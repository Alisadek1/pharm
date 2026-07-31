<?php

declare(strict_types=1);

/**
 * Orchestrates the Egyptian-drug-database file import.
 *
 * Design principles
 * ─────────────────
 * • Auto-detects CSV vs JSON from file extension.
 * • Companies and categories are resolved (looked up or created) OUTSIDE
 *   the medicines transaction so they are never rolled back.
 * • Medicines are inserted/updated in bulk chunk transactions for performance.
 *   On transaction failure the chunk is retried row-by-row.
 * • Three in-memory caches (company, category, medicine) are warmed at startup
 *   and updated only after a successful commit to stay consistent.
 * • Duplicate detection: same name OR same name_ar OR same (scientific_name+strength).
 */
class DrugImportService
{
    private PDO          $db;
    private ImportLogger $logger;
    private DrugMapper   $mapper;
    private int          $chunkSize;

    // ── In-memory caches ──────────────────────────────────────────────────────
    /** lowercase(trim(name)) => company_id  */
    private array $companyCache = [];
    /** lowercase(trim(name)) => category_id */
    private array $categoryCache = [];
    /** lowercase(trim(name)) => medicine_id */
    private array $medByName = [];
    /** lowercase(trim(name_ar)) => medicine_id */
    private array $medByNameAr = [];
    /** lowercase("sci_name|strength") => medicine_id */
    private array $medBySciStr = [];

    public function __construct(PDO $db, ImportLogger $logger, int $chunkSize = 500)
    {
        $this->db        = $db;
        $this->logger    = $logger;
        $this->mapper    = new DrugMapper();
        $this->chunkSize = $chunkSize;
    }

    /**
     * Auto-detect file type and run the full import.
     *
     * @param  callable|null $onProgress  fn(int $done, int $total, array $stats, float $elapsed): void
     * @return array{total:int, inserted:int, updated:int, skipped:int, failed:int, duration:float}
     */
    public function importFile(string $path, ?callable $onProgress = null): array
    {
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));

        $reader = match ($ext) {
            'json'  => new JsonReader($path, $this->chunkSize),
            'csv'   => new CsvReader($path, $this->chunkSize),
            default => throw new \InvalidArgumentException(
                "Unsupported file extension '{$ext}'. Use .csv or .json"
            ),
        };

        $total = $reader->estimateTotal();
        $logId = $this->logger->start(basename($path), $total);

        $stats = ['total' => 0, 'inserted' => 0, 'updated' => 0, 'skipped' => 0, 'failed' => 0];
        $start = microtime(true);

        // Warm all caches before processing begins
        $this->warmCaches();

        try {
            foreach ($reader->chunks() as $chunk) {
                $result = $this->processChunk($chunk);

                $stats['total']    += count($chunk);
                $stats['inserted'] += $result['inserted'];
                $stats['updated']  += $result['updated'];
                $stats['skipped']  += $result['skipped'];
                $stats['failed']   += $result['failed'];

                if ($onProgress !== null) {
                    ($onProgress)($stats['total'], $total, $stats, microtime(true) - $start);
                }
            }

            $stats['duration'] = round(microtime(true) - $start, 2);
            $this->logger->finish($logId, $stats);
        } catch (\Throwable $e) {
            $this->logger->fail($logId, $e->getMessage());
            throw $e;
        }

        return $stats;
    }

    // ─── Chunk processing ─────────────────────────────────────────────────────

    /**
     * Phase 1: map + resolve company/category (auto-committed, outside transaction).
     * Phase 2: INSERT/UPDATE medicines in a single bulk transaction.
     * Fallback: if the bulk transaction fails, retry each row individually.
     *
     * @param  list<array<string,string>> $rows
     * @return array{inserted:int, updated:int, skipped:int, failed:int}
     */
    private function processChunk(array $rows): array
    {
        $result = ['inserted' => 0, 'updated' => 0, 'skipped' => 0, 'failed' => 0];

        // ── Phase 1: map and resolve lookups (no active transaction) ──────────
        $prepared = [];
        foreach ($rows as $row) {
            try {
                $m = $this->mapper->map($row);
                if ($m === null) {
                    $result['skipped']++;
                    continue;
                }
                $m['_cid'] = $m['manufacturer'] !== null
                    ? $this->resolveCompany($m['manufacturer']) : null;
                $m['_kid'] = $m['drug_class'] !== null
                    ? $this->resolveCategory($m['drug_class']) : null;
                $prepared[] = $m;
            } catch (\Throwable) {
                $result['failed']++;
            }
        }

        if (empty($prepared)) {
            return $result;
        }

        // ── Phase 2: bulk transaction for medicines ───────────────────────────
        $this->db->beginTransaction();
        $insertedThisChunk = []; // accumulated to update medicine cache after commit

        try {
            foreach ($prepared as $m) {
                $existingId = $this->findDuplicate(
                    $m['name'],
                    (string) ($m['name_ar']         ?? ''),
                    (string) ($m['scientific_name'] ?? ''),
                    (string) ($m['strength']        ?? '')
                );

                if ($existingId !== null) {
                    $this->updateMedicine($existingId, $m);
                    $result['updated']++;
                } else {
                    $this->insertMedicine($m);
                    $newId = (int) $this->db->lastInsertId();
                    $insertedThisChunk[] = [$m, $newId];
                    $result['inserted']++;
                }
            }

            $this->db->commit();

            // Only update medicine cache AFTER successful commit
            foreach ($insertedThisChunk as [$m, $newId]) {
                $this->addToMedicineCache($m, $newId);
            }
        } catch (\Throwable) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            // Retry row-by-row so a single bad record doesn't lose the whole chunk
            foreach ($prepared as $m) {
                try {
                    $this->db->beginTransaction();
                    $existingId = $this->findDuplicate(
                        $m['name'],
                        (string) ($m['name_ar']         ?? ''),
                        (string) ($m['scientific_name'] ?? ''),
                        (string) ($m['strength']        ?? '')
                    );
                    if ($existingId !== null) {
                        $this->updateMedicine($existingId, $m);
                        $this->db->commit();
                        $result['updated']++;
                    } else {
                        $this->insertMedicine($m);
                        $newId = (int) $this->db->lastInsertId();
                        $this->db->commit();
                        $this->addToMedicineCache($m, $newId);
                        $result['inserted']++;
                    }
                } catch (\Throwable) {
                    if ($this->db->inTransaction()) {
                        $this->db->rollBack();
                    }
                    $result['failed']++;
                }
            }
        }

        return $result;
    }

    // ─── Duplicate detection (in-memory, O(1)) ────────────────────────────────

    private function findDuplicate(string $name, string $nameAr, string $sci, string $strength): ?int
    {
        $nameKey = mb_strtolower(trim($name), 'UTF-8');
        if (isset($this->medByName[$nameKey])) {
            return $this->medByName[$nameKey];
        }

        if ($nameAr !== '') {
            $arKey = mb_strtolower(trim($nameAr), 'UTF-8');
            if (isset($this->medByNameAr[$arKey])) {
                return $this->medByNameAr[$arKey];
            }
        }

        if ($sci !== '' && $strength !== '') {
            $ssKey = mb_strtolower(trim($sci), 'UTF-8') . '|' . mb_strtolower(trim($strength), 'UTF-8');
            if (isset($this->medBySciStr[$ssKey])) {
                return $this->medBySciStr[$ssKey];
            }
        }

        return null;
    }

    private function addToMedicineCache(array $m, int $id): void
    {
        $this->medByName[mb_strtolower(trim($m['name']), 'UTF-8')] = $id;

        if (!empty($m['name_ar'])) {
            $this->medByNameAr[mb_strtolower(trim($m['name_ar']), 'UTF-8')] = $id;
        }
        if (!empty($m['scientific_name']) && !empty($m['strength'])) {
            $key = mb_strtolower(trim($m['scientific_name']), 'UTF-8')
                 . '|'
                 . mb_strtolower(trim($m['strength']), 'UTF-8');
            $this->medBySciStr[$key] = $id;
        }
    }

    // ─── Company resolution ───────────────────────────────────────────────────

    private function resolveCompany(string $raw): ?int
    {
        $stored = DrugMapper::normalizeName($raw);
        if ($stored === '') {
            return null;
        }
        $key = mb_strtolower($stored, 'UTF-8');

        if (array_key_exists($key, $this->companyCache)) {
            return $this->companyCache[$key];
        }

        // Lookup — utf8mb4_unicode_ci is case-insensitive, TRIM handles spaces
        $stmt = $this->db->prepare("SELECT id FROM companies WHERE TRIM(name) = ? LIMIT 1");
        $stmt->execute([$stored]);
        $row = $stmt->fetch();

        if (!$row) {
            // INSERT IGNORE handles the race condition where two chunks try to
            // insert the same company concurrently
            $this->db->prepare("INSERT IGNORE INTO companies (name, is_active) VALUES (?, 1)")
                     ->execute([$stored]);
            $stmt->execute([$stored]);
            $row = $stmt->fetch();
        }

        $id = $row ? (int) $row['id'] : null;
        $this->companyCache[$key] = $id;
        return $id;
    }

    // ─── Category resolution ──────────────────────────────────────────────────

    private function resolveCategory(string $raw): ?int
    {
        $stored = DrugMapper::normalizeName($raw);
        if ($stored === '') {
            return null;
        }
        $key = mb_strtolower($stored, 'UTF-8');

        if (array_key_exists($key, $this->categoryCache)) {
            return $this->categoryCache[$key];
        }

        $stmt = $this->db->prepare("SELECT id FROM categories WHERE TRIM(name) = ? LIMIT 1");
        $stmt->execute([$stored]);
        $row = $stmt->fetch();

        if (!$row) {
            $this->db->prepare("INSERT IGNORE INTO categories (name, is_active) VALUES (?, 1)")
                     ->execute([$stored]);
            $stmt->execute([$stored]);
            $row = $stmt->fetch();
        }

        $id = $row ? (int) $row['id'] : null;
        $this->categoryCache[$key] = $id;
        return $id;
    }

    // ─── INSERT / UPDATE ──────────────────────────────────────────────────────

    private function insertMedicine(array $m): void
    {
        $price = (float) ($m['public_price'] ?? 0);

        $this->db->prepare("
            INSERT INTO medicines
                (name, name_ar, scientific_name, company_id, category_id,
                 dosage_form, strength, public_price, description,
                 purchase_price, selling_price, minimum_stock,
                 barcode, sku, created_by, is_active)
            VALUES
                (?, ?, ?, ?, ?,
                 ?, ?, ?, ?,
                 0, ?, 10,
                 NULL, NULL, NULL, 1)
        ")->execute([
            $m['name'],
            $m['name_ar'],
            $m['scientific_name'],
            $m['_cid'],
            $m['_kid'],
            $m['dosage_form'],
            $m['strength'] !== '' ? $m['strength'] : null,
            $price,
            $m['description'],
            $price, // selling_price = public_price on first import
        ]);
    }

    /**
     * Update only the fields the spec allows to change.
     * Uses conditional CASE so existing non-empty values are never overwritten.
     */
    private function updateMedicine(int $id, array $m): void
    {
        $this->db->prepare("
            UPDATE medicines SET
                public_price    = ?,
                description     = CASE
                    WHEN (description IS NULL OR TRIM(description) = '')
                    THEN ? ELSE description END,
                scientific_name = CASE
                    WHEN (scientific_name IS NULL OR TRIM(scientific_name) = '')
                    THEN ? ELSE scientific_name END,
                company_id      = CASE
                    WHEN company_id IS NULL
                    THEN ? ELSE company_id END,
                category_id     = CASE
                    WHEN category_id IS NULL
                    THEN ? ELSE category_id END,
                dosage_form     = CASE
                    WHEN (dosage_form IS NULL OR TRIM(dosage_form) = '')
                    THEN ? ELSE dosage_form END,
                strength        = CASE
                    WHEN (strength IS NULL OR TRIM(strength) = '')
                    THEN ? ELSE strength END
            WHERE id = ?
        ")->execute([
            (float) ($m['public_price'] ?? 0),
            $m['description'],
            $m['scientific_name'],
            $m['_cid'],
            $m['_kid'],
            $m['dosage_form'],
            $m['strength'] !== '' ? $m['strength'] : null,
            $id,
        ]);
    }

    // ─── Cache warm-up ────────────────────────────────────────────────────────

    private function warmCaches(): void
    {
        // Companies
        $stmt = $this->db->query(
            "SELECT id, LOWER(TRIM(name)) AS norm FROM companies WHERE is_active = 1"
        );
        while ($row = $stmt->fetch()) {
            $this->companyCache[$row['norm']] = (int) $row['id'];
        }

        // Categories
        $stmt = $this->db->query(
            "SELECT id, LOWER(TRIM(name)) AS norm FROM categories WHERE is_active = 1"
        );
        while ($row = $stmt->fetch()) {
            $this->categoryCache[$row['norm']] = (int) $row['id'];
        }

        // Medicines — load all three lookup axes
        $stmt = $this->db->query("
            SELECT
                id,
                LOWER(TRIM(name))                                              AS n,
                LOWER(TRIM(COALESCE(name_ar, '')))                             AS na,
                LOWER(TRIM(COALESCE(scientific_name, '')))                     AS s,
                LOWER(TRIM(COALESCE(strength, '')))                            AS st
            FROM medicines
        ");
        while ($row = $stmt->fetch()) {
            $this->medByName[$row['n']] = (int) $row['id'];
            if ($row['na'] !== '') {
                $this->medByNameAr[$row['na']] = (int) $row['id'];
            }
            if ($row['s'] !== '' && $row['st'] !== '') {
                $this->medBySciStr[$row['s'] . '|' . $row['st']] = (int) $row['id'];
            }
        }
    }
}
