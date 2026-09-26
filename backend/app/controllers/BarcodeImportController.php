<?php

declare(strict_types=1);

/**
 * BarcodeImportController
 *
 * Endpoints:
 *   POST /api/barcodes/lookup          — single barcode lookup (local + optional external)
 *   POST /api/barcodes/import          — confirm + execute a single import action
 *   POST /api/barcodes/preview         — parse CSV and return preview rows (no writes)
 *   POST /api/barcodes/import/csv      — execute CSV import from confirmed rows
 *   GET  /api/barcodes/logs            — paginated import audit log
 *
 * Safety contract:
 *   External API results NEVER overwrite local prices, stock, supplier,
 *   SKU, or existing valid barcodes. All imports require explicit user action.
 */
class BarcodeImportController
{
    // ── POST /api/barcodes/lookup ────────────────────────────

    public function lookup(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'medicines.view');

        $barcode = BarcodeService::normalize(trim($_POST['barcode'] ?? ''));
        if ($barcode === '') {
            Response::validationError(['barcode' => ['Barcode is required']]);
        }

        // sources: JSON array or comma-separated string — both forms accepted
        $rawSources = $_POST['sources'] ?? 'local';
        $sources    = is_array($rawSources)
            ? array_map('trim', $rawSources)
            : array_map('trim', explode(',', (string)$rawSources));

        $result             = BarcodeService::validate($barcode);
        $result['local']    = $this->searchLocal($barcode);
        $result['opf']      = null;
        $result['gs1']      = null;

        // Only hit external sources when not found locally
        if (!$result['local']['found']) {
            if (in_array('opf', $sources, true)) {
                $result['opf'] = (new OpenProductsFactsAdapter())->lookup($barcode);
            }
            if (in_array('gs1', $sources, true)) {
                $gs1 = new Gs1EgyptAdapter();
                $result['gs1'] = $gs1->isConfigured()
                    ? $gs1->lookup($barcode)
                    : ['found' => false, 'source' => 'gs1', 'configured' => false];
            }
        }

        Response::success($result);
    }

    // ── POST /api/barcodes/import ────────────────────────────

    public function importSingle(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'barcodes.import');

        $body    = $_POST;
        $barcode = BarcodeService::normalize(trim($body['barcode'] ?? ''));
        $action  = trim($body['action'] ?? '');
        $source  = in_array($body['source'] ?? '', ['manual', 'csv', 'opf', 'gs1'], true)
                 ? $body['source'] : 'manual';

        if ($barcode === '') {
            Response::validationError(['barcode' => ['Barcode is required']]);
        }
        if (!in_array($action, ['create', 'link_unit', 'link_medicine'], true)) {
            Response::validationError(['action' => ['Must be: create, link_unit, or link_medicine']]);
        }

        $db = Database::getInstance();

        Database::beginTransaction();
        try {
            $result = match ($action) {
                'create'         => $this->createMedicineFromBarcode($db, $user, $barcode, $body, $source),
                'link_unit'      => $this->linkBarcodeToUnit($db, $user, $barcode, (int)($body['unit_id'] ?? 0), $source),
                'link_medicine'  => $this->linkBarcodeToMedicine($db, $user, $barcode, (int)($body['medicine_id'] ?? 0), $source),
            };
            $this->logImport($db, $user['id'], 'single', $barcode, $result, $source, $body);
            Database::commit();
        } catch (\Exception $e) {
            Database::rollBack();
            Response::error($e->getMessage(), 422);
        }

        Response::success($result);
    }

    // ── POST /api/barcodes/preview ───────────────────────────

    public function previewCsv(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'barcodes.import');

        if (empty($_FILES['file']['name'])) {
            Response::error('CSV file is required');
        }
        $file = $_FILES['file']['tmp_name'];
        if (!is_readable($file)) {
            Response::error('Cannot read uploaded file');
        }

        $handle = fopen($file, 'r');
        fgetcsv($handle);  // skip header
        $rows   = [];
        $rowNum = 1;

        while (($data = fgetcsv($handle)) !== false) {
            $rowNum++;
            $data = array_map('trim', array_pad($data, 7, ''));
            [$barcodeRaw, $name, $manufacturer, $activeIngredient, $strength, $dosageForm, $packageSize] = $data;

            $barcode   = BarcodeService::normalize($barcodeRaw);
            $validated = BarcodeService::validate($barcode);
            $local     = $barcode !== '' ? $this->searchLocal($barcode) : ['found' => false];

            $rows[] = [
                'row'               => $rowNum,
                'barcode'           => $barcode,
                'name'              => $name,
                'manufacturer'      => $manufacturer,
                'active_ingredient' => $activeIngredient,
                'strength'          => $strength,
                'dosage_form'       => $dosageForm,
                'package_size'      => $packageSize,
                'format'            => $validated['format'],
                'valid_checksum'    => $validated['valid_checksum'],
                'local_match'       => $local,
                // Default: skip existing, create new
                'suggested_action'  => $local['found'] ? 'skip' : ($barcode !== '' ? 'create' : 'skip'),
            ];
        }
        fclose($handle);

        Response::success(['rows' => $rows, 'total' => count($rows)]);
    }

    // ── POST /api/barcodes/import/csv ────────────────────────

    public function importCsv(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'barcodes.import');

        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
        $rows = $body['rows'] ?? [];

        if (empty($rows)) {
            Response::error('No rows provided');
        }

        $db      = Database::getInstance();
        $created = 0;
        $linked  = 0;
        $skipped = 0;
        $errors  = [];

        foreach ($rows as $idx => $row) {
            $action  = trim($row['user_action'] ?? $row['suggested_action'] ?? 'skip');
            $barcode = BarcodeService::normalize($row['barcode'] ?? '');

            if ($barcode === '' || $action === 'skip') {
                $skipped++;
                continue;
            }

            Database::beginTransaction();
            try {
                $source = 'csv';
                switch ($action) {
                    case 'create':
                        $r = $this->createMedicineFromBarcode($db, $user, $barcode, $row, $source);
                        $created++;
                        break;
                    case 'link_unit':
                        $r = $this->linkBarcodeToUnit($db, $user, $barcode, (int)($row['unit_id'] ?? 0), $source);
                        $linked++;
                        break;
                    case 'link_medicine':
                        $r = $this->linkBarcodeToMedicine($db, $user, $barcode, (int)($row['medicine_id'] ?? 0), $source);
                        $linked++;
                        break;
                    default:
                        $skipped++;
                        Database::rollBack();
                        continue 2;
                }
                $this->logImport($db, $user['id'], 'csv', $barcode, $r, $source, $row);
                Database::commit();
            } catch (\Exception $e) {
                Database::rollBack();
                $errors[] = ['row' => $row['row'] ?? $idx + 1, 'barcode' => $barcode, 'error' => $e->getMessage()];
            }
        }

        $total = $created + $linked + $skipped + count($errors);
        Response::success([
            'created' => $created,
            'linked'  => $linked,
            'skipped' => $skipped,
            'errors'  => $errors,
            'total'   => $total,
        ], "CSV import completed: {$created} created, {$linked} linked, {$skipped} skipped, " . count($errors) . " errors");
    }

    // ── GET /api/barcodes/logs ───────────────────────────────

    public function logs(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'medicines.view');

        $db      = Database::getInstance();
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(100, max(10, (int)($_GET['per_page'] ?? 20)));
        $offset  = ($page - 1) * $perPage;

        $total = (int)$db->query("SELECT COUNT(*) FROM barcode_import_logs")->fetchColumn();

        $stmt = $db->prepare("
            SELECT bil.*,
                   m.name  AS medicine_name,
                   u.name  AS user_name
            FROM   barcode_import_logs bil
            LEFT JOIN medicines m ON m.id = bil.medicine_id
            LEFT JOIN users     u ON u.id = bil.user_id
            ORDER  BY bil.created_at DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([$perPage, $offset]);

        Response::paginated($stmt->fetchAll(), $total, $page, $perPage);
    }

    // ── Private: local DB search ─────────────────────────────

    private function searchLocal(string $barcode): array
    {
        $db = Database::getInstance();

        // Step 1: unit-level barcode (most specific)
        $stmt = $db->prepare("
            SELECT pu.id        AS unit_id,
                   pu.unit_name,
                   pu.medicine_id,
                   pu.barcode_source,
                   m.name       AS medicine_name,
                   m.sku,
                   m.barcode    AS medicine_barcode
            FROM   product_units pu
            JOIN   medicines m ON m.id = pu.medicine_id
            WHERE  pu.barcode = ?
              AND  pu.is_active = 1
              AND  m.is_active  = 1
            LIMIT  1
        ");
        $stmt->execute([$barcode]);
        $unit = $stmt->fetch();
        if ($unit) {
            return ['found' => true, 'match_type' => 'unit', 'data' => $unit];
        }

        // Step 2: medicine-level barcode
        $stmt = $db->prepare("
            SELECT id AS medicine_id, name AS medicine_name,
                   barcode AS medicine_barcode, sku, barcode_source
            FROM   medicines
            WHERE  barcode = ? AND is_active = 1
            LIMIT  1
        ");
        $stmt->execute([$barcode]);
        $med = $stmt->fetch();
        if ($med) {
            return ['found' => true, 'match_type' => 'medicine', 'data' => $med];
        }

        // Step 3: SKU fallback
        $stmt = $db->prepare("
            SELECT id AS medicine_id, name AS medicine_name,
                   barcode AS medicine_barcode, sku, barcode_source
            FROM   medicines
            WHERE  sku = ? AND is_active = 1
            LIMIT  1
        ");
        $stmt->execute([$barcode]);
        $sku = $stmt->fetch();
        if ($sku) {
            return ['found' => true, 'match_type' => 'sku', 'data' => $sku];
        }

        return ['found' => false];
    }

    // ── Private: action handlers ─────────────────────────────

    /**
     * Create a new medicine from an imported barcode.
     * NEVER overwrites prices, stock, or any existing operational data.
     */
    private function createMedicineFromBarcode(PDO $db, array $user, string $barcode, array $data, string $source): array
    {
        $name = trim($data['name'] ?? '');
        if ($name === '') {
            throw new \RuntimeException('Medicine name is required to create a new record');
        }

        // Check barcode is not already taken in either table
        $dupStmt = $db->prepare("SELECT 'unit' AS tbl FROM product_units WHERE barcode = ? UNION SELECT 'medicine' FROM medicines WHERE barcode = ?");
        $dupStmt->execute([$barcode, $barcode]);
        if ($dupStmt->fetch()) {
            throw new \RuntimeException("Barcode {$barcode} is already assigned in the system");
        }

        // Generate unique SKU (3 attempts)
        $sku = null;
        for ($i = 0; $i < 3; $i++) {
            $candidate = 'MED-' . strtoupper(bin2hex(random_bytes(4)));
            $chk = $db->prepare("SELECT id FROM medicines WHERE sku = ?");
            $chk->execute([$candidate]);
            if (!$chk->fetch()) {
                $sku = $candidate;
                break;
            }
        }
        if ($sku === null) {
            throw new \RuntimeException('Unable to generate a unique SKU — please try again');
        }

        $db->prepare("
            INSERT INTO medicines
                (name, name_ar, barcode, barcode_source, barcode_imported_at,
                 sku, minimum_stock, is_active, created_by)
            VALUES (?, ?, ?, ?, NOW(), ?, 10, 1, ?)
        ")->execute([
            substr($name, 0, 200),
            substr(trim($data['name_ar'] ?? ''), 0, 200),
            $barcode,
            $source,
            $sku,
            $user['id'],
        ]);
        $medId = (int)$db->lastInsertId();

        // Seed a base product_unit so the medicine is immediately scannable at POS
        try {
            $db->prepare("
                INSERT INTO product_units
                    (medicine_id, unit_name, conversion_factor, barcode, barcode_source,
                     is_base_unit, is_default_purchase, is_default_sale, is_active, sort_order)
                VALUES (?, 'Piece', 1.000000, ?, ?, 1, 1, 1, 1, 0)
            ")->execute([$medId, $barcode, $source]);
        } catch (\Exception) {
            // Non-fatal — unit can be added manually
        }

        Logger::activity($user['id'], 'barcode_import', 'medicines', $medId,
            "Created medicine from barcode {$barcode} (source: {$source})");

        return ['action' => 'created', 'medicine_id' => $medId, 'name' => $name, 'barcode' => $barcode];
    }

    /**
     * Link a barcode to an existing product_unit.
     * Uses the existing doAssignBarcode() conflict checks.
     * NEVER touches prices, stock, or other unit data.
     */
    private function linkBarcodeToUnit(PDO $db, array $user, string $barcode, int $unitId, string $source): array
    {
        if ($unitId < 1) {
            throw new \RuntimeException('unit_id is required for link_unit action');
        }

        $stmt = $db->prepare("
            SELECT pu.*, m.name AS medicine_name
            FROM   product_units pu
            JOIN   medicines m ON m.id = pu.medicine_id
            WHERE  pu.id = ?
        ");
        $stmt->execute([$unitId]);
        $unit = $stmt->fetch();
        if (!$unit) {
            throw new \RuntimeException("Unit #{$unitId} not found");
        }

        $puc    = new ProductUnitController();
        $status = $puc->doAssignBarcode($db, $unitId, (int)$unit['medicine_id'], $barcode, $unit['barcode'] ?? null);

        if ($status === 'assigned') {
            // Set provenance (best-effort; column may not exist before migration)
            try {
                $db->prepare("UPDATE product_units SET barcode_source = ? WHERE id = ?")->execute([$source, $unitId]);
            } catch (\Exception) {}
        }

        Logger::activity($user['id'], 'barcode_import', 'product_units', $unitId,
            "Barcode {$barcode} {$status} on unit #{$unitId} (source: {$source})");

        return [
            'action'        => $status,
            'unit_id'       => $unitId,
            'medicine_name' => $unit['medicine_name'],
            'barcode'       => $barcode,
        ];
    }

    /**
     * Link a barcode to medicines.barcode of an existing medicine.
     * NEVER overwrites an existing different barcode without explicit intent.
     * NEVER touches prices, stock, supplier, or SKU.
     */
    private function linkBarcodeToMedicine(PDO $db, array $user, string $barcode, int $medicineId, string $source): array
    {
        if ($medicineId < 1) {
            throw new \RuntimeException('medicine_id is required for link_medicine action');
        }

        $stmt = $db->prepare("SELECT id, name, barcode, barcode_source FROM medicines WHERE id = ? AND is_active = 1");
        $stmt->execute([$medicineId]);
        $med = $stmt->fetch();
        if (!$med) {
            throw new \RuntimeException("Medicine #{$medicineId} not found");
        }
        if (!empty($med['barcode']) && $med['barcode'] !== $barcode) {
            throw new \RuntimeException(
                "Medicine already has barcode '{$med['barcode']}'. " .
                "Remove it first or use link_unit to assign to a specific unit."
            );
        }
        if ($med['barcode'] === $barcode) {
            return ['action' => 'no_change', 'medicine_id' => $medicineId, 'medicine_name' => $med['name'], 'barcode' => $barcode];
        }

        // Check no other medicine already has this barcode
        $conf = $db->prepare("SELECT id FROM medicines WHERE barcode = ? AND id != ?");
        $conf->execute([$barcode, $medicineId]);
        if ($conf->fetch()) {
            throw new \RuntimeException("Barcode {$barcode} is already assigned to a different medicine");
        }

        $db->prepare("
            UPDATE medicines
            SET barcode = ?, barcode_source = ?, barcode_imported_at = NOW()
            WHERE id = ?
        ")->execute([$barcode, $source, $medicineId]);

        Logger::activity($user['id'], 'barcode_import', 'medicines', $medicineId,
            "Linked barcode {$barcode} to medicine #{$medicineId} (source: {$source})");

        return ['action' => 'linked', 'medicine_id' => $medicineId, 'medicine_name' => $med['name'], 'barcode' => $barcode];
    }

    // ── Private: audit log ───────────────────────────────────

    private function logImport(PDO $db, int $userId, string $importType, string $barcode, array $result, string $source, array $sourceData): void
    {
        try {
            $action = $result['action'] ?? 'imported';
            $status = in_array($action, ['created', 'linked', 'assigned', 'already_linked', 'no_change'], true)
                    ? 'imported' : 'error';

            $db->prepare("
                INSERT INTO barcode_import_logs
                    (import_type, barcode, medicine_id, unit_id, status, action, source, source_data, user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ")->execute([
                $importType,
                $barcode,
                $result['medicine_id'] ?? null,
                $result['unit_id']     ?? null,
                $status,
                $action,
                $source,
                json_encode(array_intersect_key($sourceData, array_flip(['barcode', 'name', 'manufacturer', 'row']))),
                $userId,
            ]);
        } catch (\Exception) {
            // Non-fatal — log table may not exist before migration
        }
    }
}
