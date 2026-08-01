<?php

declare(strict_types=1);

/**
 * Orchestrates the Egyptian-drug-database file import.
 *
 * Design principles
 * ─────────────────
 * • Auto-detects CSV vs JSON from file extension.
 * • Companies and categories are resolved OUTSIDE the medicines transaction
 *   so they are never rolled back on chunk failure.
 * • Medicines are written in bulk chunk transactions. On failure the chunk
 *   is retried row-by-row so one bad record never loses the whole chunk.
 * • The medicine cache is updated only after a successful commit to prevent
 *   phantom entries from rolled-back transactions poisoning duplicate detection.
 * • Three in-memory caches (name / name_ar / scientific_name+strength) are
 *   warmed at startup and kept consistent throughout the import.
 * • In dry-run mode no database writes occur; cache entries use synthetic
 *   negative IDs so cross-chunk duplicate detection still works correctly.
 */
class DrugImportService
{
    // ── Well-known company name aliases ───────────────────────────────────────
    // Keys are the result of companyKey() applied to the alias.
    // Values are the canonical display name stored in the database.
    private const COMPANY_ALIASES = [
        'gsk'                    => 'GlaxoSmithKline',
        'glaxosmithkline'        => 'GlaxoSmithKline',
        'glaxowellcome'          => 'GlaxoSmithKline',
        'msd'                    => 'Merck Sharp & Dohme',
        'mercksharpanddohme'     => 'Merck Sharp & Dohme',
        'jnj'                    => 'Johnson & Johnson',
        'johnsonandjohnson'      => 'Johnson & Johnson',
        'astrazeneca'            => 'AstraZeneca',
        'aznow'                  => 'AstraZeneca',
        'novartis'               => 'Novartis',
        'pfizer'                 => 'Pfizer',
        'sanofi'                 => 'Sanofi',
        'sanofiaventis'          => 'Sanofi',
        'roche'                  => 'Roche',
        'hoffmannlaroche'        => 'Roche',
        'bayer'                  => 'Bayer',
        'bayerhealthcare'        => 'Bayer',
        'abbvie'                 => 'AbbVie',
        'boehringeringelheim'    => 'Boehringer Ingelheim',
        'lilly'                  => 'Eli Lilly',
        'elililly'               => 'Eli Lilly',
        'ucb'                    => 'UCB Pharma',
        'ucbpharma'              => 'UCB Pharma',
    ];

    private PDO           $db;
    private ImportLogger  $logger;
    private DrugMapper    $mapper;
    private DrugValidator $validator;
    private int           $chunkSize;

    // ── In-memory caches (keyed by normalizeForKey / companyKey output) ───────
    private array $companyCache  = [];
    private array $categoryCache = [];
    private array $medByName     = [];
    private array $medByNameAr   = [];
    private array $medBySciStr   = [];

    // ── Intra-chunk pending inserts (flushed each chunk; checked by findDuplicate) ──
    // Allows within-chunk duplicate detection without touching the main cache
    // before the transaction commits (which would poison detection on rollback).
    private array $chunkPendingName   = [];
    private array $chunkPendingNameAr = [];
    private array $chunkPendingSciStr = [];

    // ── Per-run counters (reset at start of each importFile call) ─────────────
    private int $companiesCreated  = 0;
    private int $categoriesCreated = 0;
    private int $dryRunNextId      = -1;

    public function __construct(PDO $db, ImportLogger $logger, int $chunkSize = 500)
    {
        $this->db        = $db;
        $this->logger    = $logger;
        $this->mapper    = new DrugMapper();
        $this->validator = new DrugValidator();
        $this->chunkSize = $chunkSize;
    }

    // ─── Schema verification ──────────────────────────────────────────────────

    /**
     * Verify that all tables required by the import exist.
     * Call this once after connecting, before creating any service instances.
     *
     * @throws \RuntimeException if a required table is missing.
     */
    public static function verifySchema(PDO $db): void
    {
        foreach (['medicines', 'companies', 'categories', 'drug_sync_logs'] as $table) {
            $stmt = $db->query("SHOW TABLES LIKE " . $db->quote($table));
            if (!$stmt || $stmt->fetchColumn() === false) {
                throw new \RuntimeException(
                    "Required table '{$table}' does not exist. " .
                    "Run all database migrations before importing."
                );
            }
        }
    }

    // ─── Public import entry point ────────────────────────────────────────────

    /**
     * Auto-detect file type and run the import (or simulate it in dry-run mode).
     *
     * In dry-run mode the entire dataset is parsed, validated, and checked for
     * duplicates, but nothing is written to the database and no log entry is
     * created. The returned stats represent what a real import would do.
     *
     * @param  callable|null $onProgress  fn(int $done, int $total, array $stats, float $elapsed): void
     * @return array{
     *   total:int, inserted:int, updated:int, skipped:int, failed:int,
     *   validation_failures:int, chunks_ok:int, chunks_failed:int,
     *   companies_created:int, categories_created:int,
     *   duration:float, peak_memory_bytes:int
     * }
     */
    public function importFile(string $path, ?callable $onProgress = null, bool $dryRun = false): array
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
        $logId = null;

        if (!$dryRun) {
            $logId = $this->logger->start(basename($path), $total);
        }

        $stats = [
            'total'               => 0,
            'inserted'            => 0,
            'updated'             => 0,
            'skipped'             => 0,
            'failed'              => 0,
            'validation_failures' => 0,
            'chunks_ok'           => 0,
            'chunks_failed'       => 0,
            'companies_created'   => 0,
            'categories_created'  => 0,
            'duration'            => 0.0,
            'peak_memory_bytes'   => 0,
        ];

        $this->resetImportCounters();
        $this->warmCaches();

        $start = microtime(true);

        try {
            foreach ($reader->chunks() as $chunk) {
                $result = $this->processChunk($chunk, $dryRun);

                $stats['total']               += count($chunk);
                $stats['inserted']            += $result['inserted'];
                $stats['updated']             += $result['updated'];
                $stats['skipped']             += $result['skipped'];
                $stats['failed']              += $result['failed'];
                $stats['validation_failures'] += $result['validation_failures'];

                if ($result['chunk_failed']) {
                    $stats['chunks_failed']++;
                } else {
                    $stats['chunks_ok']++;
                }

                if ($onProgress !== null) {
                    ($onProgress)($stats['total'], $total, $stats, microtime(true) - $start);
                }
            }

            $stats['duration']           = round(microtime(true) - $start, 2);
            $stats['peak_memory_bytes']  = memory_get_peak_usage(true);
            $stats['companies_created']  = $this->companiesCreated;
            $stats['categories_created'] = $this->categoriesCreated;

            if (!$dryRun && $logId !== null) {
                $this->logger->finish($logId, $stats);
            }
        } catch (\Throwable $e) {
            if (!$dryRun && $logId !== null) {
                $this->logger->fail($logId, $e->getMessage());
            }
            throw $e;
        }

        return $stats;
    }

    // ─── Chunk processing ─────────────────────────────────────────────────────

    /**
     * Phase 1: validate, map, resolve company/category (auto-committed, outside transaction).
     * Phase 2: INSERT/UPDATE medicines in a single bulk transaction.
     * Fallback: if the bulk transaction fails, retry each row individually.
     *
     * @param  list<array<string,string>> $rows
     * @return array{inserted:int, updated:int, skipped:int, failed:int, validation_failures:int, chunk_failed:bool}
     */
    private function processChunk(array $rows, bool $dryRun): array
    {
        $result = [
            'inserted'            => 0,
            'updated'             => 0,
            'skipped'             => 0,
            'failed'              => 0,
            'validation_failures' => 0,
            'chunk_failed'        => false,
        ];

        // ── Phase 1: validate + map + resolve lookups (no active transaction) ─
        $prepared = [];
        foreach ($rows as $row) {
            try {
                $check = $this->validator->validate($row);
                if (!$check['valid']) {
                    $result['validation_failures']++;
                    $result['skipped']++;
                    continue;
                }

                $m = $this->mapper->map($row);
                if ($m === null) {
                    $result['skipped']++;
                    continue;
                }

                $m['_cid'] = $m['manufacturer'] !== null
                    ? $this->resolveCompany($m['manufacturer'], $dryRun) : null;
                $m['_kid'] = $m['drug_class'] !== null
                    ? $this->resolveCategory($m['drug_class'], $dryRun) : null;

                $prepared[] = $m;
            } catch (\Throwable) {
                $result['failed']++;
            }
        }

        if (empty($prepared)) {
            return $result;
        }

        // ── Phase 2: bulk transaction for medicines ───────────────────────────
        if (!$dryRun) {
            $this->db->beginTransaction();
        }

        $pendingCacheUpdates = [];
        $this->chunkPendingName   = [];
        $this->chunkPendingNameAr = [];
        $this->chunkPendingSciStr = [];

        try {
            foreach ($prepared as $m) {
                $r = $this->runMedicineAction($m, $dryRun);
                $result[$r['action']]++;
                if ($r['id'] !== null) {
                    $pendingCacheUpdates[] = [$m, $r['id']];
                    // Track in the intra-chunk pending set so findDuplicate can
                    // catch duplicates within the same chunk before the commit.
                    $this->addToChunkPending($m, $r['id']);
                }
            }

            if (!$dryRun) {
                $this->db->commit();
            }

            // Update medicine cache only after a successful commit to prevent
            // phantom entries from poisoning duplicate detection on rollback.
            foreach ($pendingCacheUpdates as [$m, $id]) {
                $this->addToMedicineCache($m, $id);
            }
            $this->chunkPendingName   = [];
            $this->chunkPendingNameAr = [];
            $this->chunkPendingSciStr = [];
        } catch (\Throwable) {
            if (!$dryRun && $this->db->inTransaction()) {
                $this->db->rollBack();
            }

            // Clear stale chunk-pending entries from the rolled-back transaction
            // so the per-row fallback below starts from a clean intra-chunk state.
            $this->chunkPendingName   = [];
            $this->chunkPendingNameAr = [];
            $this->chunkPendingSciStr = [];
            $pendingCacheUpdates      = [];
            $result['chunk_failed']   = true;

            // Per-row fallback: one bad record must not lose the whole chunk.
            foreach ($prepared as $m) {
                try {
                    if (!$dryRun) {
                        $this->db->beginTransaction();
                    }
                    $r = $this->runMedicineAction($m, $dryRun);
                    if (!$dryRun) {
                        $this->db->commit();
                    }
                    $result[$r['action']]++;
                    if ($r['id'] !== null) {
                        $this->addToMedicineCache($m, $r['id']);
                        $this->addToChunkPending($m, $r['id']);
                    }
                } catch (\Throwable) {
                    if (!$dryRun && $this->db->inTransaction()) {
                        $this->db->rollBack();
                    }
                    $result['failed']++;
                }
            }
            $this->chunkPendingName   = [];
            $this->chunkPendingNameAr = [];
            $this->chunkPendingSciStr = [];
        }

        return $result;
    }

    // ─── Shared insert/update logic ───────────────────────────────────────────

    /**
     * Detect whether the medicine is a duplicate, then INSERT or UPDATE.
     *
     * Returns the action taken and the new DB ID (null for updates and dry-run
     * updates). Callers are responsible for updating the medicine cache after
     * any enclosing transaction has committed.
     *
     * In dry-run mode the cache receives a synthetic negative ID on insert so
     * that cross-chunk duplicate detection works correctly without writing.
     *
     * @return array{action:'inserted'|'updated', id:int|null}
     */
    private function runMedicineAction(array $m, bool $dryRun): array
    {
        $existingId = $this->findDuplicate(
            $m['name'],
            (string) ($m['name_ar']         ?? ''),
            (string) ($m['scientific_name'] ?? ''),
            (string) ($m['strength']        ?? '')
        );

        if ($existingId !== null) {
            if (!$dryRun) {
                $this->updateMedicine($existingId, $m);
            }
            return ['action' => 'updated', 'id' => null];
        }

        if ($dryRun) {
            // Synthetic ID: negative, unique per import run so the cache
            // never confuses two different dry-run medicines.
            return ['action' => 'inserted', 'id' => $this->dryRunNextId--];
        }

        $this->insertMedicine($m);
        return ['action' => 'inserted', 'id' => (int) $this->db->lastInsertId()];
    }

    // ─── Duplicate detection (in-memory, O(1)) ────────────────────────────────

    private function findDuplicate(string $name, string $nameAr, string $sci, string $strength): ?int
    {
        $nk = DrugMapper::normalizeForKey($name);
        if ($nk !== '') {
            if (isset($this->chunkPendingName[$nk])) return $this->chunkPendingName[$nk];
            if (isset($this->medByName[$nk]))        return $this->medByName[$nk];
        }

        if ($nameAr !== '') {
            $nak = DrugMapper::normalizeForKey($nameAr);
            if ($nak !== '') {
                if (isset($this->chunkPendingNameAr[$nak])) return $this->chunkPendingNameAr[$nak];
                if (isset($this->medByNameAr[$nak]))        return $this->medByNameAr[$nak];
            }
        }

        if ($sci !== '' && $strength !== '') {
            $sk  = DrugMapper::normalizeForKey($sci);
            $stk = DrugMapper::normalizeForKey($strength);
            if ($sk !== '' && $stk !== '') {
                $key = "{$sk}|{$stk}";
                if (isset($this->chunkPendingSciStr[$key])) return $this->chunkPendingSciStr[$key];
                if (isset($this->medBySciStr[$key]))        return $this->medBySciStr[$key];
            }
        }

        return null;
    }

    private function addToChunkPending(array $m, int $id): void
    {
        $nk = DrugMapper::normalizeForKey($m['name']);
        if ($nk !== '') {
            $this->chunkPendingName[$nk] = $id;
        }

        if (!empty($m['name_ar'])) {
            $nak = DrugMapper::normalizeForKey((string) $m['name_ar']);
            if ($nak !== '') {
                $this->chunkPendingNameAr[$nak] = $id;
            }
        }

        if (!empty($m['scientific_name']) && !empty($m['strength'])) {
            $sk  = DrugMapper::normalizeForKey((string) $m['scientific_name']);
            $stk = DrugMapper::normalizeForKey((string) $m['strength']);
            if ($sk !== '' && $stk !== '') {
                $this->chunkPendingSciStr["{$sk}|{$stk}"] = $id;
            }
        }
    }

    private function addToMedicineCache(array $m, int $id): void
    {
        $nk = DrugMapper::normalizeForKey($m['name']);
        if ($nk !== '') {
            $this->medByName[$nk] = $id;
        }

        if (!empty($m['name_ar'])) {
            $nak = DrugMapper::normalizeForKey((string) $m['name_ar']);
            if ($nak !== '') {
                $this->medByNameAr[$nak] = $id;
            }
        }

        if (!empty($m['scientific_name']) && !empty($m['strength'])) {
            $sk  = DrugMapper::normalizeForKey((string) $m['scientific_name']);
            $stk = DrugMapper::normalizeForKey((string) $m['strength']);
            if ($sk !== '' && $stk !== '') {
                $this->medBySciStr["{$sk}|{$stk}"] = $id;
            }
        }
    }

    // ─── Company resolution ───────────────────────────────────────────────────

    private function resolveCompany(string $raw, bool $dryRun): ?int
    {
        $stored = DrugMapper::normalizeName($raw);
        if ($stored === '') {
            return null;
        }

        $key = self::companyKey($stored);

        // Resolve known abbreviations / variant spellings to a canonical name
        if (isset(self::COMPANY_ALIASES[$key])) {
            $stored = self::COMPANY_ALIASES[$key];
            $key    = self::companyKey($stored);
        }

        if (array_key_exists($key, $this->companyCache)) {
            return $this->companyCache[$key];
        }

        if ($dryRun) {
            $this->companyCache[$key] = $this->dryRunNextId--;
            $this->companiesCreated++;
            return $this->companyCache[$key];
        }

        $stmt = $this->db->prepare("SELECT id FROM companies WHERE TRIM(name) = ? LIMIT 1");
        $stmt->execute([$stored]);
        $row = $stmt->fetch();

        if (!$row) {
            // INSERT IGNORE handles concurrent chunks trying to create the same company
            $this->db->prepare("INSERT IGNORE INTO companies (name, is_active) VALUES (?, 1)")
                     ->execute([$stored]);
            $stmt->execute([$stored]);
            $row = $stmt->fetch();
            $this->companiesCreated++;
        }

        $id = $row ? (int) $row['id'] : null;
        $this->companyCache[$key] = $id;
        return $id;
    }

    // ─── Category resolution ──────────────────────────────────────────────────

    private function resolveCategory(string $raw, bool $dryRun): ?int
    {
        // Title-case new categories for consistent display; cache lookup is case-insensitive
        $stored = mb_convert_case(DrugMapper::normalizeName($raw), MB_CASE_TITLE, 'UTF-8');
        if ($stored === '') {
            return null;
        }

        $key = DrugMapper::normalizeForKey($stored);

        if (array_key_exists($key, $this->categoryCache)) {
            return $this->categoryCache[$key];
        }

        if ($dryRun) {
            $this->categoryCache[$key] = $this->dryRunNextId--;
            $this->categoriesCreated++;
            return $this->categoryCache[$key];
        }

        // utf8mb4_unicode_ci collation makes this comparison case-insensitive
        $stmt = $this->db->prepare("SELECT id FROM categories WHERE TRIM(name) = ? LIMIT 1");
        $stmt->execute([$stored]);
        $row = $stmt->fetch();

        if (!$row) {
            $this->db->prepare("INSERT IGNORE INTO categories (name, is_active) VALUES (?, 1)")
                     ->execute([$stored]);
            $stmt->execute([$stored]);
            $row = $stmt->fetch();
            $this->categoriesCreated++;
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
     * CASE expressions ensure existing non-empty values are never overwritten.
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
        // Companies — use companyKey() so "GlaxoSmithKline" and "Glaxo Smith Kline"
        // map to the same cache entry as the canonical record.
        $stmt = $this->db->query("SELECT id, name FROM companies WHERE is_active = 1");
        while ($row = $stmt->fetch()) {
            $key = self::companyKey(DrugMapper::normalizeName((string) $row['name']));
            if ($key !== '') {
                $this->companyCache[$key] = (int) $row['id'];
            }
        }

        // Categories — normalizeForKey() gives case/space/invisible-char insensitivity
        $stmt = $this->db->query("SELECT id, name FROM categories WHERE is_active = 1");
        while ($row = $stmt->fetch()) {
            $key = DrugMapper::normalizeForKey((string) $row['name']);
            if ($key !== '') {
                $this->categoryCache[$key] = (int) $row['id'];
            }
        }

        // Medicines — load all three duplicate-detection axes
        $stmt = $this->db->query("
            SELECT
                id,
                name,
                COALESCE(name_ar, '')         AS name_ar,
                COALESCE(scientific_name, '') AS scientific_name,
                COALESCE(strength, '')        AS strength
            FROM medicines
        ");
        while ($row = $stmt->fetch()) {
            $nk = DrugMapper::normalizeForKey((string) $row['name']);
            if ($nk !== '') {
                $this->medByName[$nk] = (int) $row['id'];
            }

            $nak = DrugMapper::normalizeForKey((string) $row['name_ar']);
            if ($nak !== '') {
                $this->medByNameAr[$nak] = (int) $row['id'];
            }

            $sk  = DrugMapper::normalizeForKey((string) $row['scientific_name']);
            $stk = DrugMapper::normalizeForKey((string) $row['strength']);
            if ($sk !== '' && $stk !== '') {
                $this->medBySciStr["{$sk}|{$stk}"] = (int) $row['id'];
            }
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Derive a collision-resistant company cache key.
     *
     * Strips everything except lowercase ASCII letters, digits, and Arabic
     * script so "GlaxoSmithKline", "Glaxo Smith Kline", and "Glaxo-SmithKline"
     * all map to the same key "glaxosmithkline".
     */
    private static function companyKey(string $name): string
    {
        return (string) preg_replace(
            '/[^a-z0-9\x{0600}-\x{06FF}]/u',
            '',
            mb_strtolower($name, 'UTF-8')
        );
    }

    /**
     * Reset per-run counters and clear all caches.
     * Called at the start of each importFile() invocation.
     */
    private function resetImportCounters(): void
    {
        $this->companiesCreated  = 0;
        $this->categoriesCreated = 0;
        $this->dryRunNextId      = -1;

        $this->companyCache       = [];
        $this->categoryCache      = [];
        $this->medByName          = [];
        $this->medByNameAr        = [];
        $this->medBySciStr        = [];
        $this->chunkPendingName   = [];
        $this->chunkPendingNameAr = [];
        $this->chunkPendingSciStr = [];
    }
}
