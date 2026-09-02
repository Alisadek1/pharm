<?php

declare(strict_types=1);

/**
 * ProductUnitController
 *
 * Manages the product_units table — multiple selling/purchasing
 * units per product (medicine), each with its own price,
 * conversion factor, and optional barcode.
 *
 * Conventions: follows existing project patterns (AuthMiddleware,
 * Validator, Response, Database, Logger).
 */
class ProductUnitController
{
    // ── List units for a product ─────────────────────────────

    public function index(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'medicines.view');

        $medicineId = (int)$params['medicine_id'];
        $db         = Database::getInstance();

        $this->assertMedicineExists($db, $medicineId);

        $stmt = $db->prepare("
            SELECT *
            FROM   product_units
            WHERE  medicine_id = ?
            ORDER  BY sort_order ASC, id ASC
        ");
        $stmt->execute([$medicineId]);

        Response::success($stmt->fetchAll());
    }

    // ── Create a unit ────────────────────────────────────────

    public function store(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'medicines.edit');

        $medicineId = (int)$params['medicine_id'];
        $body       = $_POST;
        $db         = Database::getInstance();

        $this->assertMedicineExists($db, $medicineId);

        $validator = Validator::make($body, [
            'unit_name' => 'required|string|maxlength:50',
        ]);
        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        $isBase            = $this->boolVal($body['is_base_unit']        ?? null, 0);
        $isDefaultPurchase = $this->boolVal($body['is_default_purchase'] ?? null, 0);
        $isDefaultSale     = $this->boolVal($body['is_default_sale']     ?? null, 0);
        $isActive          = $this->boolVal($body['is_active']           ?? null, 1);

        // ── Hierarchy: parent_unit_id + contains_quantity ────
        $parentUnitId  = !empty($body['parent_unit_id']) ? (int)$body['parent_unit_id'] : null;
        $containsQty   = null;
        $factor        = null;

        if ($parentUnitId !== null) {
            if ($isBase) {
                Response::error('The base unit cannot have a parent unit', 422);
            }
            $containsQty = (float)($body['contains_quantity'] ?? 0);
            if ($containsQty <= 0) {
                Response::error('contains_quantity must be greater than zero', 422);
            }
            $parent = $this->getUnitById($db, $parentUnitId);
            if (!$parent || (int)$parent['medicine_id'] !== $medicineId) {
                Response::error('Parent unit not found or belongs to a different product', 422);
            }
            // Auto-calculate conversion factor from hierarchy
            $factor = round((float)$parent['conversion_factor'] * $containsQty, 6);
        } else {
            // Flat unit: trust the submitted factor
            $factor = (float)($body['conversion_factor'] ?? 0);
            if ($factor <= 0) {
                Response::validationError(['conversion_factor' => ['Conversion factor must be greater than zero']]);
            }
        }

        // Validate barcode uniqueness if supplied
        $barcode = trim($body['barcode'] ?? '');
        if ($barcode !== '') {
            $this->assertBarcodeAvailable($db, $barcode, 0);
        }

        Database::beginTransaction();
        try {
            if ($isBase) {
                $this->clearBaseFlag($db, $medicineId);
            }

            $stmt = $db->prepare("
                INSERT INTO product_units
                  (medicine_id, unit_name, unit_name_ar, unit_code, conversion_factor,
                   purchase_price, selling_price, public_price, barcode,
                   is_base_unit, is_default_purchase, is_default_sale,
                   is_active, sort_order, parent_unit_id, contains_quantity)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $medicineId,
                trim($body['unit_name']),
                trim($body['unit_name_ar']  ?? ''),
                trim($body['unit_code']     ?? ''),
                $factor,
                strlen((string)($body['purchase_price'] ?? '')) > 0 ? (float)$body['purchase_price'] : null,
                strlen((string)($body['selling_price']  ?? '')) > 0 ? (float)$body['selling_price']  : null,
                strlen((string)($body['public_price']   ?? '')) > 0 ? (float)$body['public_price']   : null,
                $barcode !== '' ? $barcode : null,
                $isBase,
                $isDefaultPurchase,
                $isDefaultSale,
                $isActive,
                (int)($body['sort_order'] ?? 0),
                $parentUnitId,
                $containsQty,
            ]);

            $id = (int)$db->lastInsertId();
            Database::commit();
        } catch (\Exception $e) {
            Database::rollBack();
            Response::error('Failed to create unit: ' . $e->getMessage(), 500);
        }

        $unit = $this->getUnitById($db, $id);

        Logger::activity($user['id'], 'create', 'product_units', $id,
            "Added unit '{$unit['unit_name']}' to medicine #{$medicineId}");
        Response::created($unit, 'Unit created successfully');
    }

    // ── Show single unit ─────────────────────────────────────

    public function show(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'medicines.view');

        $unit = $this->getUnitById(Database::getInstance(), (int)$params['id']);
        if (!$unit) {
            Response::notFound('Unit not found');
        }
        Response::success($unit);
    }

    // ── Update a unit ────────────────────────────────────────

    public function update(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'medicines.edit');

        $id   = (int)$params['id'];
        $body = $_POST;
        $db   = Database::getInstance();

        $unit = $this->getUnitById($db, $id);
        if (!$unit) {
            Response::notFound('Unit not found');
        }

        $medicineId = (int)$unit['medicine_id'];

        $validator = Validator::make($body, [
            'unit_name' => 'required|string|maxlength:50',
        ]);
        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        $isBase            = $this->boolVal($body['is_base_unit']        ?? null, (int)$unit['is_base_unit']);
        $isDefaultPurchase = $this->boolVal($body['is_default_purchase'] ?? null, (int)$unit['is_default_purchase']);
        $isDefaultSale     = $this->boolVal($body['is_default_sale']     ?? null, (int)$unit['is_default_sale']);
        $isActive          = $this->boolVal($body['is_active']           ?? null, (int)$unit['is_active']);

        // ── Hierarchy: parent_unit_id + contains_quantity ────
        $parentKeyPresent = array_key_exists('parent_unit_id', $body);
        $parentUnitId = $parentKeyPresent
            ? (!empty($body['parent_unit_id']) ? (int)$body['parent_unit_id'] : null)
            : (isset($unit['parent_unit_id']) ? (int)$unit['parent_unit_id'] : null);
        $containsQty = null;
        $factor      = null;

        if ($parentUnitId !== null) {
            if ($isBase) {
                Response::error('The base unit cannot have a parent unit', 422);
            }
            $containsQty = isset($body['contains_quantity'])
                ? (float)$body['contains_quantity']
                : (float)($unit['contains_quantity'] ?? 0);
            if ($containsQty <= 0) {
                Response::error('contains_quantity must be greater than zero', 422);
            }
            // Circular reference guard
            if ($this->wouldCreateCycle($db, $id, $parentUnitId)) {
                Response::error('Setting this parent would create a circular reference', 422);
            }
            $parent = $this->getUnitById($db, $parentUnitId);
            if (!$parent || (int)$parent['medicine_id'] !== $medicineId) {
                Response::error('Parent unit not found or belongs to a different product', 422);
            }
            $factor = round((float)$parent['conversion_factor'] * $containsQty, 6);
        } else {
            $factor = isset($body['conversion_factor'])
                ? (float)$body['conversion_factor']
                : (float)$unit['conversion_factor'];
            if ($factor <= 0) {
                Response::validationError(['conversion_factor' => ['Conversion factor must be greater than zero']]);
            }
        }

        $barcode = trim($body['barcode'] ?? '');
        if ($barcode !== '' && $barcode !== ($unit['barcode'] ?? '')) {
            $this->assertBarcodeAvailable($db, $barcode, $id);
        }

        $factorChanged = abs($factor - (float)$unit['conversion_factor']) > 0.000001;

        Database::beginTransaction();
        try {
            if ($isBase && !$unit['is_base_unit']) {
                $this->clearBaseFlag($db, $medicineId);
            }

            $db->prepare("
                UPDATE product_units SET
                  unit_name           = ?,
                  unit_name_ar        = ?,
                  unit_code           = ?,
                  conversion_factor   = ?,
                  purchase_price      = ?,
                  selling_price       = ?,
                  public_price        = ?,
                  barcode             = ?,
                  is_base_unit        = ?,
                  is_default_purchase = ?,
                  is_default_sale     = ?,
                  is_active           = ?,
                  sort_order          = ?,
                  parent_unit_id      = ?,
                  contains_quantity   = ?
                WHERE id = ?
            ")->execute([
                trim($body['unit_name']),
                trim($body['unit_name_ar']  ?? ''),
                trim($body['unit_code']     ?? ''),
                $factor,
                strlen((string)($body['purchase_price'] ?? '')) > 0 ? (float)$body['purchase_price'] : null,
                strlen((string)($body['selling_price']  ?? '')) > 0 ? (float)$body['selling_price']  : null,
                strlen((string)($body['public_price']   ?? '')) > 0 ? (float)$body['public_price']   : null,
                $barcode !== '' ? $barcode : null,
                $isBase,
                $isDefaultPurchase,
                $isDefaultSale,
                $isActive,
                (int)($body['sort_order'] ?? 0),
                $parentUnitId,
                $containsQty,
                $id,
            ]);

            // Cascade: recalculate all descendants if this unit's factor changed
            if ($factorChanged) {
                $this->cascadeRecalculate($db, $id, $factor);
            }

            Database::commit();
        } catch (\Exception $e) {
            Database::rollBack();
            Response::error('Failed to update unit: ' . $e->getMessage(), 500);
        }

        $updated = $this->getUnitById($db, $id);
        Logger::activity($user['id'], 'update', 'product_units', $id,
            "Updated unit '{$updated['unit_name']}' (medicine #{$medicineId})");
        Response::success($updated, 'Unit updated successfully');
    }

    // ── Delete a unit ────────────────────────────────────────

    public function destroy(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'medicines.edit');

        $id   = (int)$params['id'];
        $db   = Database::getInstance();
        $unit = $this->getUnitById($db, $id);

        if (!$unit) {
            Response::notFound('Unit not found');
        }

        // Prevent deleting a unit that other units use as their parent
        $childCount = $db->prepare("SELECT COUNT(*) FROM product_units WHERE parent_unit_id = ?");
        $childCount->execute([$id]);
        if ((int)$childCount->fetchColumn() > 0) {
            Response::error(
                'Cannot delete this unit — other units are children of it. ' .
                'Remove or re-parent the child units first.',
                409
            );
        }

        // Prevent deleting the base unit if other units exist for the medicine
        if ($unit['is_base_unit']) {
            $others = $db->prepare(
                "SELECT COUNT(*) FROM product_units WHERE medicine_id = ? AND id <> ?"
            );
            $others->execute([(int)$unit['medicine_id'], $id]);
            if ((int)$others->fetchColumn() > 0) {
                Response::error(
                    'Cannot delete the base unit while other units exist. ' .
                    'Set a different base unit first.',
                    409
                );
            }
        }

        // Check if this unit is referenced in historical transactions.
        // If it is, soft-delete (deactivate) to preserve invoice history rather
        // than leaving orphaned unit_id references in sale_items / purchase_items.
        $saleRef = $db->prepare("SELECT 1 FROM sale_items WHERE unit_id = ? LIMIT 1");
        $saleRef->execute([$id]);
        $purchRef = $db->prepare("SELECT 1 FROM purchase_items WHERE unit_id = ? LIMIT 1");
        $purchRef->execute([$id]);

        if ($saleRef->fetch() || $purchRef->fetch()) {
            // Soft-delete: deactivate so it cannot be selected for new transactions
            // but historical records remain fully intact
            $db->prepare("UPDATE product_units SET is_active = 0 WHERE id = ?")->execute([$id]);
            Logger::activity($user['id'], 'deactivate', 'product_units', $id,
                "Deactivated unit '{$unit['unit_name']}' (referenced in transactions, medicine #{$unit['medicine_id']})");
            Response::success(null, 'Unit deactivated (it is referenced in historical transactions and cannot be permanently deleted)');
            return;
        }

        $db->prepare("DELETE FROM product_units WHERE id = ?")->execute([$id]);
        Logger::activity($user['id'], 'delete', 'product_units', $id,
            "Deleted unit '{$unit['unit_name']}' (medicine #{$unit['medicine_id']})");
        Response::success(null, 'Unit deleted successfully');
    }

    // ── Packaging preset generator ───────────────────────────
    // Creates or updates the standard unit hierarchy for a medicine.
    // Never deletes units; only inserts or updates matching ones.
    // Safe to call repeatedly (idempotent per preset type).

    public function applyPreset(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'medicines.edit');

        $medicineId = (int)$params['medicine_id'];
        $body       = $_POST;
        $db         = Database::getInstance();

        $this->assertMedicineExists($db, $medicineId);

        $preset = trim($body['preset'] ?? '');
        if (!in_array($preset, ['tablet_capsule', 'syrup', 'piece', 'bottle', 'custom', 'box_unit'], true)) {
            Response::error('Invalid preset type. Allowed: tablet_capsule, syrup, piece, bottle, custom, box_unit', 422);
        }

        Database::beginTransaction();
        try {
            if ($preset === 'tablet_capsule') {
                $stripsPerBox    = (int)($body['strips_per_box']    ?? 0);
                $tabletsPerStrip = (int)($body['tablets_per_strip'] ?? 0);
                if ($stripsPerBox <= 0 || $tabletsPerStrip <= 0) {
                    Response::error('strips_per_box and tablets_per_strip must be greater than zero', 422);
                }
                $this->applyTabletCapsulePreset($db, $medicineId, $stripsPerBox, $tabletsPerStrip);
            } elseif ($preset === 'box_unit') {
                $unitsPerBox = (int)($body['units_per_box'] ?? 0);
                if ($unitsPerBox <= 0) {
                    Response::error('units_per_box must be greater than zero', 422);
                }
                $this->applyBoxUnitPreset($db, $medicineId, $unitsPerBox);
            } else {
                $unitName = trim($body['unit_name'] ?? '');
                if ($unitName === '') {
                    $unitName = ['syrup' => 'Bottle', 'bottle' => 'Bottle', 'piece' => 'Piece', 'custom' => 'Unit'][$preset] ?? 'Unit';
                }
                $this->applySingleUnitPreset($db, $medicineId, $unitName);
            }
            Database::commit();
        } catch (\Exception $e) {
            Database::rollBack();
            Response::error('Failed to apply preset: ' . $e->getMessage(), 500);
        }

        $stmt = $db->prepare("SELECT * FROM product_units WHERE medicine_id = ? ORDER BY sort_order ASC, conversion_factor ASC");
        $stmt->execute([$medicineId]);

        Logger::activity($user['id'], 'preset', 'product_units', $medicineId,
            "Applied '{$preset}' preset to medicine #{$medicineId}");
        Response::success($stmt->fetchAll(), 'Packaging preset applied successfully');
    }

    // ── POS unit data — medicine + all active units + derived prices ─────

    public function posUnits(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'pos.access');

        $medicineId = (int)$params['medicine_id'];
        $db         = Database::getInstance();

        $medStmt = $db->prepare("
            SELECT m.*,
                   COALESCE((SELECT SUM(b.quantity) FROM medicine_batches b
                             WHERE b.medicine_id = m.id AND b.quantity > 0 AND b.expiry_date >= CURDATE()), 0)
                   AS stock_base_quantity
            FROM   medicines m
            WHERE  m.id = ? AND m.is_active = 1
        ");
        $medStmt->execute([$medicineId]);
        $medicine = $medStmt->fetch();
        if (!$medicine) {
            Response::notFound('Medicine not found');
        }

        $unitsStmt = $db->prepare(
            "SELECT * FROM product_units WHERE medicine_id = ? AND is_active = 1 ORDER BY sort_order ASC, conversion_factor ASC"
        );
        $unitsStmt->execute([$medicineId]);
        $units = $unitsStmt->fetchAll();

        $masterPrice = (float)$medicine['public_price'] > 0
            ? (float)$medicine['public_price']
            : (float)$medicine['selling_price'];

        $refFactor = $this->getRefFactor($db, $medicineId, $units);

        $unitList = array_map(function (array $u) use ($masterPrice, $refFactor) {
            $factor = (float)$u['conversion_factor'];
            $price  = $this->deriveUnitPrice($u, $masterPrice, $factor, $refFactor);
            return [
                'id'                  => (int)$u['id'],
                'name'                => $u['unit_name'],
                'name_ar'             => $u['unit_name_ar'],
                'code'                => $u['unit_code'],
                'factor'              => $factor,
                'price'               => $price,
                'is_base_unit'        => (bool)$u['is_base_unit'],
                'is_default_purchase' => (bool)$u['is_default_purchase'],
                'is_default_sale'     => (bool)$u['is_default_sale'],
                'barcode'             => $u['barcode'],
                'parent_unit_id'      => $u['parent_unit_id'] ? (int)$u['parent_unit_id'] : null,
                'contains_quantity'   => $u['contains_quantity'] !== null ? (float)$u['contains_quantity'] : null,
                'stock_in_unit'       => $factor > 0 ? (int)floor((float)($medicine['stock_base_quantity'] ?? 0) / $factor) : 0,
            ];
        }, $units);

        $expiryStmt = $db->prepare("
            SELECT expiry_date, DATEDIFF(expiry_date, CURDATE()) AS days_to_expiry
            FROM   medicine_batches
            WHERE  medicine_id = ? AND quantity > 0 AND expiry_date >= CURDATE()
            ORDER  BY expiry_date ASC
            LIMIT  1
        ");
        $expiryStmt->execute([$medicineId]);
        $nearestBatch = $expiryStmt->fetch();

        Response::success([
            'medicine_id'         => (int)$medicine['id'],
            'name'                => $medicine['name'],
            'name_ar'             => $medicine['name_ar'],
            'product_type'        => $medicine['product_type'] ?? 'other',
            'dosage_form'         => $medicine['dosage_form'],
            'stock_base_quantity' => (int)($medicine['stock_base_quantity'] ?? 0),
            'master_price'        => $masterPrice,
            'ref_factor'          => $refFactor,
            'units'               => $unitList,
            'nearest_expiry_date' => $nearestBatch ? $nearestBatch['expiry_date'] : null,
            'days_to_expiry'      => $nearestBatch ? (int)$nearestBatch['days_to_expiry'] : null,
        ]);
    }

    // ── Barcode lookup ───────────────────────────────────────
    // Resolves a barcode to product + unit information.
    // Used by POS barcode scanner.

    public function barcodeLookup(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'pos.access');

        $code = trim($params['code'] ?? '');
        if ($code === '') {
            Response::error('Barcode is required');
        }

        $db = Database::getInstance();

        // 1. Check product_units barcodes first
        $unitStmt = $db->prepare("
            SELECT
                pu.*,
                m.id              AS medicine_id,
                m.name            AS medicine_name,
                m.name_ar         AS medicine_name_ar,
                m.unit            AS medicine_unit,
                m.minimum_stock,
                m.prescription_required,
                m.controlled_drug,
                m.is_active       AS medicine_active,
                m.selling_price   AS medicine_selling_price,
                m.public_price    AS medicine_public_price,
                m.purchase_price  AS medicine_purchase_price,
                (
                  SELECT COALESCE(SUM(b.quantity), 0)
                  FROM   medicine_batches b
                  WHERE  b.medicine_id = m.id
                    AND  b.quantity    > 0
                    AND  b.expiry_date >= CURDATE()
                ) AS current_stock_base
            FROM   product_units  pu
            JOIN   medicines      m  ON m.id = pu.medicine_id
            WHERE  pu.barcode = ?
              AND  pu.is_active = 1
              AND  m.is_active  = 1
            LIMIT  1
        ");
        $unitStmt->execute([$code]);
        $row = $unitStmt->fetch();

        if ($row) {
            $baseUnit  = $this->getBaseUnit($db, (int)$row['medicine_id']);
            $refFactor = $this->getRefFactor($db, (int)$row['medicine_id']);
            Response::success($this->formatUnitResult($row, $baseUnit, $refFactor));
            return;
        }

        // 2. Fall back: check legacy medicines.barcode or medicines.sku
        $medStmt = $db->prepare("
            SELECT
                m.*,
                (
                  SELECT COALESCE(SUM(b.quantity), 0)
                  FROM   medicine_batches b
                  WHERE  b.medicine_id = m.id
                    AND  b.quantity    > 0
                    AND  b.expiry_date >= CURDATE()
                ) AS current_stock_base
            FROM   medicines m
            WHERE  (m.barcode = ? OR m.sku = ?)
              AND  m.is_active = 1
            LIMIT  1
        ");
        $medStmt->execute([$code, $code]);
        $med = $medStmt->fetch();

        if (!$med) {
            Response::notFound('Barcode not found');
        }

        // Get (or create) the default sale unit for this medicine
        $unitRow = $this->getDefaultSaleUnit($db, (int)$med['id']);
        if (!$unitRow) {
            // product_units not yet seeded — synthesise a virtual base unit
            $unitRow = [
                'id'                  => null,
                'medicine_id'         => $med['id'],
                'unit_name'           => $med['unit'] ?: 'Unit',
                'unit_name_ar'        => null,
                'unit_code'           => null,
                'conversion_factor'   => '1.000000',
                'purchase_price'      => $med['purchase_price'],
                'selling_price'       => $med['selling_price'],
                'public_price'        => $med['public_price'],
                'barcode'             => $med['barcode'],
                'is_base_unit'        => 1,
                'is_default_purchase' => 1,
                'is_default_sale'     => 1,
                'is_active'           => 1,
            ];
            $unitRow['medicine_name']    = $med['name'];
            $unitRow['medicine_name_ar'] = $med['name_ar'];
            $unitRow['medicine_unit']    = $med['unit'];
            $unitRow['current_stock_base'] = $med['current_stock_base'];
            $unitRow['minimum_stock']    = $med['minimum_stock'];
            $unitRow['prescription_required'] = $med['prescription_required'];
            $unitRow['controlled_drug']  = $med['controlled_drug'];
        } else {
            $unitRow['medicine_name']    = $med['name'];
            $unitRow['medicine_name_ar'] = $med['name_ar'];
            $unitRow['medicine_unit']    = $med['unit'];
            $unitRow['current_stock_base'] = $med['current_stock_base'];
            $unitRow['minimum_stock']    = $med['minimum_stock'];
            $unitRow['prescription_required'] = $med['prescription_required'];
            $unitRow['controlled_drug']  = $med['controlled_drug'];
        }

        $baseUnit  = $this->getBaseUnit($db, (int)$med['id']);
        $refFactor = $this->getRefFactor($db, (int)$med['id']);
        Response::success($this->formatUnitResult($unitRow, $baseUnit, $refFactor));
    }

    // ── Private helpers ───────────────────────────────────────

    /**
     * Parse boolean-ish values from form submissions.
     * FormData sends true/false as strings 'true'/'false'.
     * PHP intval('true') = 0, so we handle this explicitly.
     */
    private function boolVal(mixed $v, int $default): int
    {
        if ($v === null || $v === '') return $default;
        if (is_bool($v)) return $v ? 1 : 0;
        $s = strtolower(trim((string)$v));
        if (in_array($s, ['1', 'true', 'on', 'yes'], true)) return 1;
        if (in_array($s, ['0', 'false', 'off', 'no'], true)) return 0;
        return $default;
    }

    private function getUnitById(PDO $db, int $id): ?array
    {
        $stmt = $db->prepare("SELECT * FROM product_units WHERE id = ?");
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    private function assertMedicineExists(PDO $db, int $medicineId): void
    {
        $stmt = $db->prepare("SELECT id FROM medicines WHERE id = ? AND is_active = 1");
        $stmt->execute([$medicineId]);
        if (!$stmt->fetch()) {
            Response::notFound('Medicine not found');
        }
    }

    private function assertBarcodeAvailable(PDO $db, string $barcode, int $excludeId): void
    {
        $stmt = $db->prepare(
            "SELECT id FROM product_units WHERE barcode = ? AND id <> ?"
        );
        $stmt->execute([$barcode, $excludeId]);
        if ($stmt->fetch()) {
            Response::error('Barcode is already assigned to another unit', 409);
        }

        // Also check the legacy medicines.barcode column
        $stmt2 = $db->prepare(
            "SELECT id FROM medicines WHERE barcode = ? AND (
               NOT EXISTS (
                 SELECT 1 FROM product_units pu WHERE pu.medicine_id = medicines.id AND pu.barcode = ?
               )
             )"
        );
        $stmt2->execute([$barcode, $barcode]);
        if ($stmt2->fetch()) {
            Response::error('Barcode conflicts with an existing medicine barcode', 409);
        }
    }

    private function clearBaseFlag(PDO $db, int $medicineId): void
    {
        $db->prepare(
            "UPDATE product_units SET is_base_unit = 0 WHERE medicine_id = ?"
        )->execute([$medicineId]);
    }

    private function getBaseUnit(PDO $db, int $medicineId): ?array
    {
        $stmt = $db->prepare(
            "SELECT * FROM product_units WHERE medicine_id = ? AND is_base_unit = 1 LIMIT 1"
        );
        $stmt->execute([$medicineId]);
        return $stmt->fetch() ?: null;
    }

    private function getDefaultSaleUnit(PDO $db, int $medicineId): ?array
    {
        $stmt = $db->prepare(
            "SELECT * FROM product_units
             WHERE  medicine_id = ?
               AND  is_default_sale = 1
               AND  is_active = 1
             ORDER  BY sort_order ASC LIMIT 1"
        );
        $stmt->execute([$medicineId]);
        return $stmt->fetch() ?: null;
    }

    /**
     * Detect whether setting $newParentId as parent of $unitId would form a cycle.
     * Walks UP the ancestry chain of $newParentId; if we hit $unitId, it's a cycle.
     */
    private function wouldCreateCycle(PDO $db, int $unitId, int $newParentId): bool
    {
        $visited = [];
        $current = $newParentId;
        $stmt    = $db->prepare("SELECT parent_unit_id FROM product_units WHERE id = ?");
        while ($current !== null) {
            if ($current === $unitId) return true;
            if (isset($visited[$current])) break; // already-broken cycle in DB — stop
            $visited[$current] = true;
            $stmt->execute([$current]);
            $row     = $stmt->fetch();
            $current = $row && $row['parent_unit_id'] !== null ? (int)$row['parent_unit_id'] : null;
        }
        return false;
    }

    /**
     * Resolve the reference factor for price derivation.
     * The reference unit is the one marked is_default_purchase = 1 (typically the Box).
     * For legacy medicines with no default purchase unit, returns 1.0 so that
     * derived price = master_price × factor/1.0 = master_price (backwards compatible).
     *
     * $units: optional pre-fetched unit array to avoid a second DB query.
     */
    private function getRefFactor(PDO $db, int $medicineId, array $units = []): float
    {
        if ($units) {
            foreach ($units as $u) {
                if ($u['is_default_purchase']) {
                    return (float)$u['conversion_factor'];
                }
            }
            return 1.0;
        }
        $stmt = $db->prepare(
            "SELECT conversion_factor FROM product_units
             WHERE medicine_id = ? AND is_default_purchase = 1 AND is_active = 1 LIMIT 1"
        );
        $stmt->execute([$medicineId]);
        $row = $stmt->fetch();
        return $row ? (float)$row['conversion_factor'] : 1.0;
    }

    /**
     * Derive the selling price for a single unit given master price and factors.
     * Formula: price = master_price × (unit_factor / ref_factor)
     * Falls back to the unit's explicit public_price when set.
     */
    private function deriveUnitPrice(array $unit, float $masterPrice, float $unitFactor, float $refFactor): float
    {
        if ($unit['public_price'] !== null && (float)$unit['public_price'] > 0) {
            return (float)$unit['public_price'];
        }
        return $refFactor > 0 ? round($masterPrice * $unitFactor / $refFactor, 3) : $masterPrice;
    }

    // ── Preset helpers ────────────────────────────────────────

    /**
     * Create or update the BOX → STRIP → TABLET hierarchy.
     * Matches existing units by is_base_unit, parent_unit_id, or name/code patterns.
     * Never deletes any unit; only inserts or updates.
     */
    private function applyTabletCapsulePreset(
        PDO $db, int $medicineId, int $stripsPerBox, int $tabletsPerStrip
    ): void {
        // ── Step 1: Tablet (base unit) ─────────────────────────────────────
        $tabletStmt = $db->prepare(
            "SELECT * FROM product_units WHERE medicine_id = ? AND is_base_unit = 1 LIMIT 1"
        );
        $tabletStmt->execute([$medicineId]);
        $tablet = $tabletStmt->fetch();

        if (!$tablet) {
            $tabletStmt = $db->prepare(
                "SELECT * FROM product_units WHERE medicine_id = ?
                 AND (LOWER(unit_code) = 'tab' OR LOWER(unit_name) LIKE '%tablet%'
                      OR LOWER(unit_name) LIKE '%capsule%')
                 ORDER BY id ASC LIMIT 1"
            );
            $tabletStmt->execute([$medicineId]);
            $tablet = $tabletStmt->fetch();
        }

        if ($tablet) {
            $db->prepare(
                "UPDATE product_units SET
                   is_base_unit = 1, conversion_factor = 1.000000,
                   parent_unit_id = NULL, contains_quantity = NULL,
                   is_default_purchase = 0, is_default_sale = 0,
                   is_active = 1, sort_order = 0
                 WHERE id = ?"
            )->execute([(int)$tablet['id']]);
            $tabletId = (int)$tablet['id'];
        } else {
            $db->prepare(
                "INSERT INTO product_units
                   (medicine_id, unit_name, unit_code, conversion_factor,
                    is_base_unit, is_default_purchase, is_default_sale, is_active, sort_order)
                 VALUES (?, 'Tablet', 'TAB', 1.000000, 1, 0, 0, 1, 0)"
            )->execute([$medicineId]);
            $tabletId = (int)$db->lastInsertId();
        }

        // ── Step 2: Strip ──────────────────────────────────────────────────
        $stripFactor = (float)$tabletsPerStrip;

        $stripStmt = $db->prepare(
            "SELECT * FROM product_units WHERE medicine_id = ?
             AND (parent_unit_id = ? OR LOWER(unit_code) = 'str' OR LOWER(unit_name) LIKE '%strip%')
             ORDER BY CASE WHEN parent_unit_id = ? THEN 0 ELSE 1 END ASC, id ASC LIMIT 1"
        );
        $stripStmt->execute([$medicineId, $tabletId, $tabletId]);
        $strip = $stripStmt->fetch();

        if ($strip) {
            $db->prepare(
                "UPDATE product_units SET
                   parent_unit_id = ?, contains_quantity = ?, conversion_factor = ?,
                   is_base_unit = 0, is_default_purchase = 0, is_default_sale = 0,
                   is_active = 1, sort_order = 1
                 WHERE id = ?"
            )->execute([$tabletId, $tabletsPerStrip, $stripFactor, (int)$strip['id']]);
            $stripId = (int)$strip['id'];
        } else {
            $db->prepare(
                "INSERT INTO product_units
                   (medicine_id, unit_name, unit_code, conversion_factor, parent_unit_id,
                    contains_quantity, is_base_unit, is_default_purchase, is_default_sale, is_active, sort_order)
                 VALUES (?, 'Strip', 'STR', ?, ?, ?, 0, 0, 0, 1, 1)"
            )->execute([$medicineId, $stripFactor, $tabletId, $tabletsPerStrip]);
            $stripId = (int)$db->lastInsertId();
        }

        // ── Step 3: Box (default purchase + default sale) ──────────────────
        $boxFactor = (float)($stripsPerBox * $tabletsPerStrip);

        $boxStmt = $db->prepare(
            "SELECT * FROM product_units WHERE medicine_id = ?
             AND (parent_unit_id = ? OR LOWER(unit_code) = 'box' OR LOWER(unit_name) LIKE '%box%')
             ORDER BY CASE WHEN parent_unit_id = ? THEN 0 ELSE 1 END ASC, id ASC LIMIT 1"
        );
        $boxStmt->execute([$medicineId, $stripId, $stripId]);
        $box = $boxStmt->fetch();

        if ($box) {
            $db->prepare(
                "UPDATE product_units SET
                   parent_unit_id = ?, contains_quantity = ?, conversion_factor = ?,
                   is_base_unit = 0, is_default_purchase = 1, is_default_sale = 1,
                   is_active = 1, sort_order = 2
                 WHERE id = ?"
            )->execute([$stripId, $stripsPerBox, $boxFactor, (int)$box['id']]);
        } else {
            $db->prepare(
                "INSERT INTO product_units
                   (medicine_id, unit_name, unit_code, conversion_factor, parent_unit_id,
                    contains_quantity, is_base_unit, is_default_purchase, is_default_sale, is_active, sort_order)
                 VALUES (?, 'Box', 'BOX', ?, ?, ?, 0, 1, 1, 1, 2)"
            )->execute([$medicineId, $boxFactor, $stripId, $stripsPerBox]);
        }
    }

    /**
     * Create or update a 2-level Box → Unit hierarchy.
     * Box has conversion_factor=N (is_default_purchase); Unit has factor=1 (is_default_sale, is_base_unit).
     * Idempotent: never deletes existing units, only inserts or updates.
     */
    private function applyBoxUnitPreset(PDO $db, int $medicineId, int $unitsPerBox): void
    {
        // Step 1: base unit (lowest factor = 1)
        $stmt = $db->prepare(
            "SELECT * FROM product_units WHERE medicine_id = ?
             ORDER BY CASE WHEN is_base_unit = 1 THEN 0 ELSE 1 END ASC,
                      conversion_factor ASC, id ASC LIMIT 1"
        );
        $stmt->execute([$medicineId]);
        $baseUnit = $stmt->fetch();

        if ($baseUnit) {
            $db->prepare(
                "UPDATE product_units SET
                   conversion_factor = 1.000000, parent_unit_id = NULL,
                   contains_quantity = NULL, is_base_unit = 1,
                   is_default_purchase = 0, is_default_sale = 1,
                   is_active = 1, sort_order = 0
                 WHERE id = ?"
            )->execute([(int)$baseUnit['id']]);
            $baseId = (int)$baseUnit['id'];
        } else {
            $db->prepare(
                "INSERT INTO product_units
                   (medicine_id, unit_name, conversion_factor, is_base_unit,
                    is_default_purchase, is_default_sale, is_active, sort_order)
                 VALUES (?, 'Unit', 1.000000, 1, 0, 1, 1, 0)"
            )->execute([$medicineId]);
            $baseId = (int)$db->lastInsertId();
        }

        // Step 2: Box unit (factor=N, different row from base)
        $stmt = $db->prepare(
            "SELECT * FROM product_units WHERE medicine_id = ? AND id != ?
             ORDER BY conversion_factor DESC, id ASC LIMIT 1"
        );
        $stmt->execute([$medicineId, $baseId]);
        $boxUnit = $stmt->fetch();

        if ($boxUnit) {
            $db->prepare(
                "UPDATE product_units SET
                   conversion_factor = ?, parent_unit_id = NULL,
                   contains_quantity = NULL, is_base_unit = 0,
                   is_default_purchase = 1, is_default_sale = 0,
                   is_active = 1, sort_order = 1
                 WHERE id = ?"
            )->execute([$unitsPerBox, (int)$boxUnit['id']]);
        } else {
            $db->prepare(
                "INSERT INTO product_units
                   (medicine_id, unit_name, conversion_factor, is_base_unit,
                    is_default_purchase, is_default_sale, is_active, sort_order)
                 VALUES (?, 'Box', ?, 0, 1, 0, 1, 1)"
            )->execute([$medicineId, $unitsPerBox]);
        }
    }

    /**
     * Create or update a single commercial unit (Bottle, Piece, etc.).
     * Used for syrup, cosmetics, and simple non-hierarchical products.
     */
    private function applySingleUnitPreset(PDO $db, int $medicineId, string $unitName): void
    {
        // Prefer existing base unit; otherwise take the first unit for the medicine
        $stmt = $db->prepare(
            "SELECT * FROM product_units WHERE medicine_id = ?
             ORDER BY CASE WHEN is_base_unit = 1 THEN 0 ELSE 1 END ASC, id ASC LIMIT 1"
        );
        $stmt->execute([$medicineId]);
        $existing = $stmt->fetch();

        if ($existing) {
            $db->prepare(
                "UPDATE product_units SET
                   unit_name = ?, conversion_factor = 1.000000,
                   parent_unit_id = NULL, contains_quantity = NULL,
                   is_base_unit = 1, is_default_purchase = 1, is_default_sale = 1,
                   is_active = 1, sort_order = 0
                 WHERE id = ?"
            )->execute([$unitName, (int)$existing['id']]);
        } else {
            $db->prepare(
                "INSERT INTO product_units
                   (medicine_id, unit_name, conversion_factor, is_base_unit,
                    is_default_purchase, is_default_sale, is_active, sort_order)
                 VALUES (?, ?, 1.000000, 1, 1, 1, 1, 0)"
            )->execute([$medicineId, $unitName]);
        }
    }

    /**
     * Recursively recalculate conversion_factor for all descendants of $parentId.
     * Must be called inside an open transaction. Does NOT touch historical snapshots.
     */
    private function cascadeRecalculate(PDO $db, int $parentId, float $parentFactor): void
    {
        $children = $db->prepare(
            "SELECT id, contains_quantity FROM product_units WHERE parent_unit_id = ?"
        );
        $children->execute([$parentId]);
        $update = $db->prepare(
            "UPDATE product_units SET conversion_factor = ? WHERE id = ?"
        );
        foreach ($children->fetchAll() as $child) {
            $qty       = (float)$child['contains_quantity'];
            $newFactor = round($parentFactor * $qty, 6);
            $update->execute([$newFactor, (int)$child['id']]);
            $this->cascadeRecalculate($db, (int)$child['id'], $newFactor);
        }
    }

    /**
     * Build a normalised result for barcode lookup.
     * Prices: unit-level explicit price wins; otherwise derived from master price
     * via the hierarchy formula: unit_price = master_price × (unit_factor / ref_factor).
     * ref_factor = conversion_factor of the is_default_purchase unit (1.0 if none set).
     */
    private function formatUnitResult(array $row, ?array $baseUnit, float $refFactor = 1.0): array
    {
        $factor      = (float)($row['conversion_factor'] ?? 1);
        $masterSell  = (float)($row['medicine_selling_price']  ?? 0);
        $masterPub   = (float)($row['medicine_public_price']   ?? 0);
        $masterPrice = $masterPub > 0 ? $masterPub : $masterSell;

        $purchasePrice = $row['purchase_price'] !== null ? (float)$row['purchase_price'] : (float)($row['medicine_purchase_price'] ?? 0);

        // Derive public / selling price from master using hierarchy formula
        $derivedPrice  = $refFactor > 0 ? round($masterPrice * $factor / $refFactor, 3) : $masterPrice;
        $publicPrice   = $row['public_price']  !== null && (float)$row['public_price']  > 0 ? (float)$row['public_price']  : $derivedPrice;
        $sellingPrice  = $row['selling_price'] !== null && (float)$row['selling_price'] > 0 ? (float)$row['selling_price'] : $derivedPrice;

        // Available stock in this unit = base_stock / conversion_factor
        $stockBase = (float)($row['current_stock_base'] ?? 0);
        $stockUnit = $factor > 0 ? floor($stockBase / $factor) : 0;

        return [
            'medicine_id'           => (int)$row['medicine_id'],
            'medicine_name'         => $row['medicine_name']    ?? '',
            'medicine_name_ar'      => $row['medicine_name_ar'] ?? '',
            'unit_id'               => $row['id'] ? (int)$row['id'] : null,
            'unit_name'             => $row['unit_name']        ?? '',
            'unit_name_ar'          => $row['unit_name_ar']     ?? '',
            'unit_code'             => $row['unit_code']        ?? '',
            'conversion_factor'     => $factor,
            'is_base_unit'          => (bool)($row['is_base_unit'] ?? false),
            'barcode'               => $row['barcode']          ?? null,
            // Prices
            'selling_price'         => $sellingPrice,
            'public_price'          => $publicPrice,
            'purchase_price'        => $purchasePrice,
            // Stock in base units and in this unit
            'current_stock_base'    => $stockBase,
            'current_stock_unit'    => $stockUnit,
            // Base unit info for display
            'base_unit_name'        => $baseUnit['unit_name']   ?? ($row['unit_name'] ?? ''),
            'minimum_stock'         => (int)($row['minimum_stock'] ?? 0),
            'prescription_required' => (bool)($row['prescription_required'] ?? false),
            'controlled_drug'       => (bool)($row['controlled_drug'] ?? false),
        ];
    }
}
