<?php

declare(strict_types=1);

class MedicineController
{
    public function index(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'medicines.view');

        $db      = Database::getInstance();
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(100, max(10, (int)($_GET['per_page'] ?? 20)));
        $search  = trim($_GET['search'] ?? '');
        $catId   = (int)($_GET['category_id'] ?? 0);
        $compId  = (int)($_GET['company_id'] ?? 0);
        $active  = $_GET['is_active'] ?? null;

        $where = ['1=1'];
        $binds = [];

        if ($search !== '') {
            $where[] = '(m.name LIKE ? OR m.name_ar LIKE ? OR m.barcode LIKE ? OR m.sku LIKE ?)';
            $q = "%{$search}%";
            $binds = array_merge($binds, [$q, $q, $q, $q]);
        }

        if ($catId > 0) {
            $where[] = 'm.category_id = ?';
            $binds[] = $catId;
        }

        if ($compId > 0) {
            $where[] = 'm.company_id = ?';
            $binds[] = $compId;
        }

        if ($active !== null) {
            $where[] = 'm.is_active = ?';
            $binds[] = (int)$active;
        }

        $whereStr = implode(' AND ', $where);
        $total    = $db->prepare("SELECT COUNT(*) FROM medicines m WHERE {$whereStr}");
        $total->execute($binds);
        $total = (int)$total->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt   = $db->prepare("
            SELECT m.*,
                   c.name as category_name,
                   co.name as company_name,
                   COALESCE((SELECT SUM(b.quantity) FROM medicine_batches b WHERE b.medicine_id = m.id AND b.quantity > 0 AND b.expiry_date >= CURDATE()), 0) as current_stock,
                   (SELECT COUNT(*) FROM medicine_batches b WHERE b.medicine_id = m.id AND b.expiry_date < CURDATE() AND b.quantity > 0) as expired_batches,
                   (SELECT pu2.unit_name    FROM product_units pu2 WHERE pu2.medicine_id = m.id AND pu2.is_default_purchase = 1 AND pu2.is_active = 1 LIMIT 1) AS default_purchase_unit_name,
                   (SELECT pu2.unit_name_ar FROM product_units pu2 WHERE pu2.medicine_id = m.id AND pu2.is_default_purchase = 1 AND pu2.is_active = 1 LIMIT 1) AS default_purchase_unit_name_ar,
                   COALESCE(CONCAT('[', GROUP_CONCAT(
                       JSON_OBJECT('name', pu.unit_name, 'name_ar', pu.unit_name_ar, 'factor', CAST(pu.conversion_factor AS CHAR))
                       ORDER BY pu.conversion_factor DESC SEPARATOR ','
                   ), ']'), '[]') AS packaging_raw
            FROM medicines m
            LEFT JOIN categories c ON c.id = m.category_id
            LEFT JOIN companies co ON co.id = m.company_id
            LEFT JOIN product_units pu ON pu.medicine_id = m.id AND pu.is_active = 1
            WHERE {$whereStr}
            GROUP BY m.id
            ORDER BY CASE WHEN current_stock > 0 THEN 0 ELSE 1 END ASC, m.name ASC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([...$binds, $perPage, $offset]);

        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            $row['packaging'] = json_decode($row['packaging_raw'] ?? '[]', true) ?: [];
            unset($row['packaging_raw']);
        }
        unset($row);
        Response::paginated($rows, $total, $page, $perPage);
    }

    public function store(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'medicines.create');

        $body = $_POST;

        $validator = Validator::make($body, [
            'name' => 'required|string|maxlength:200',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        $db = Database::getInstance();

        // Check duplicate barcode
        if (!empty($body['barcode'])) {
            $stmt = $db->prepare("SELECT id FROM medicines WHERE barcode = ?");
            $stmt->execute([trim($body['barcode'])]);
            if ($stmt->fetch()) {
                Response::error('Barcode already exists', 409);
            }
        }

        // SKU: use client-supplied value or auto-generate
        $clientSku = trim($body['sku'] ?? '');
        if ($clientSku !== '') {
            $stmt = $db->prepare("SELECT id FROM medicines WHERE sku = ?");
            $stmt->execute([$clientSku]);
            if ($stmt->fetch()) {
                Response::error('Local barcode (SKU) already in use', 409);
            }
            $sku = $clientSku;
        } else {
            $sku = null;
            for ($attempt = 0; $attempt < 3; $attempt++) {
                $candidate = 'MED-' . strtoupper(bin2hex(random_bytes(4)));
                $stmt = $db->prepare("SELECT id FROM medicines WHERE sku = ?");
                $stmt->execute([$candidate]);
                if (!$stmt->fetch()) {
                    $sku = $candidate;
                    break;
                }
            }
            if ($sku === null) {
                Response::error('Unable to generate a unique SKU — please try again', 500);
            }
        }

        $image = null;
        if (!empty($_FILES['image']['name'])) {
            try {
                $image = Upload::image($_FILES['image'], 'medicines');
            } catch (RuntimeException $e) {
                Response::error($e->getMessage());
            }
        }

        $allowedTypes = ['medicine', 'cosmetics', 'medical_supply', 'personal_care', 'other'];
        $productType  = in_array($body['product_type'] ?? '', $allowedTypes, true)
            ? $body['product_type']
            : 'other';

        $stripsPerBox    = isset($body['strips_per_box'])    && $body['strips_per_box']    !== '' ? (int)$body['strips_per_box']    : null;
        $tabletsPerStrip = isset($body['tablets_per_strip']) && $body['tablets_per_strip'] !== '' ? (int)$body['tablets_per_strip'] : null;
        if ($stripsPerBox !== null && $stripsPerBox <= 0)    $stripsPerBox    = null;
        if ($tabletsPerStrip !== null && $tabletsPerStrip <= 0) $tabletsPerStrip = null;

        $stmt = $db->prepare("
            INSERT INTO medicines (
                category_id, company_id, name, name_ar, barcode, sku,
                dosage_form, product_type, strength, unit,
                strips_per_box, tablets_per_strip,
                purchase_price, selling_price, public_price, minimum_stock,
                prescription_required, controlled_drug, image, description, is_active, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");

        $stmt->execute([
            !empty($body['category_id']) ? (int)$body['category_id'] : null,
            !empty($body['company_id'])  ? (int)$body['company_id']  : null,
            trim($body['name']),
            trim($body['name_ar'] ?? ''),
            !empty($body['barcode']) ? trim($body['barcode']) : null,
            $sku,
            trim($body['dosage_form'] ?? ''),
            $productType,
            trim($body['strength'] ?? ''),
            trim($body['unit'] ?? 'Piece'),
            $stripsPerBox,
            $tabletsPerStrip,
            isset($body['purchase_price']) && $body['purchase_price'] !== '' ? (float)$body['purchase_price'] : 0.0,
            isset($body['public_price'])   && $body['public_price']   !== '' ? (float)$body['public_price']   : 0.0,
            isset($body['public_price'])   && $body['public_price']   !== '' ? (float)$body['public_price']   : 0.0,
            isset($body['minimum_stock']) && $body['minimum_stock'] !== '' ? (int)$body['minimum_stock'] : 10,
            isset($body['prescription_required']) ? (int)(bool)$body['prescription_required'] : 0,
            isset($body['controlled_drug'])        ? (int)(bool)$body['controlled_drug']        : 0,
            $image,
            trim($body['description'] ?? ''),
            isset($body['is_active']) ? (int)(bool)$body['is_active'] : 1,
            $user['id'],
        ]);

        $id = (int)$db->lastInsertId();

        // Auto-seed base unit and, if strip data was supplied, the full 3-tier hierarchy
        try {
            if ($stripsPerBox !== null && $tabletsPerStrip !== null && $stripsPerBox > 1) {
                $this->upsertStripUnits($db, $id, $stripsPerBox, $tabletsPerStrip);
            } else {
                $unitName = trim($body['unit'] ?? 'Piece') ?: 'Piece';
                $db->prepare("
                    INSERT INTO product_units
                        (medicine_id, unit_name, unit_name_ar, unit_code, conversion_factor,
                         is_base_unit, is_default_purchase, is_default_sale, is_active, sort_order)
                    VALUES (?, ?, '', ?, 1.000000, 1, 1, 1, 1, 0)
                ")->execute([$id, $unitName, strtolower($unitName)]);
            }
        } catch (Exception $e) {
            // Non-fatal — medicine created; admin can apply unit preset manually
        }

        $medicine = $this->getById($db, $id);

        Logger::activity($user['id'], 'create', 'medicines', $id, "Created medicine: {$body['name']}");
        Response::created($medicine, 'Medicine created successfully');
    }

    public function show(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'medicines.view');

        $db       = Database::getInstance();
        $medicine = $this->getById($db, (int)$params['id']);

        if (!$medicine) {
            Response::notFound('Medicine not found');
        }

        Response::success($medicine);
    }

    public function update(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'medicines.edit');

        $id   = (int)$params['id'];
        $body = $_POST;
        $db   = Database::getInstance();

        $existing = $this->getById($db, $id);
        if (!$existing) {
            Response::notFound('Medicine not found');
        }

        $validator = Validator::make($body, [
            'name' => 'required|string|maxlength:200',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        // Fix B1: allow clearing barcode by sending an empty string
        $newBarcode = $existing['barcode'];
        if (array_key_exists('barcode', $body)) {
            $newBarcode = trim($body['barcode']) !== '' ? trim($body['barcode']) : null;
        }
        if ($newBarcode !== null && $newBarcode !== $existing['barcode']) {
            $stmt = $db->prepare("SELECT id FROM medicines WHERE barcode = ? AND id != ?");
            $stmt->execute([$newBarcode, $id]);
            if ($stmt->fetch()) {
                Response::error('Barcode already exists', 409);
            }
        }

        $newSku = $existing['sku'];
        if (isset($body['sku']) && trim($body['sku']) !== '' && trim($body['sku']) !== $existing['sku']) {
            $newSku = trim($body['sku']);
            $stmt = $db->prepare("SELECT id FROM medicines WHERE sku = ? AND id != ?");
            $stmt->execute([$newSku, $id]);
            if ($stmt->fetch()) {
                Response::error('Local barcode (SKU) already in use', 409);
            }
        }

        $image = $existing['image'];
        if (!empty($_FILES['image']['name'])) {
            try {
                $newImage = Upload::image($_FILES['image'], 'medicines');
                if ($image) {
                    Upload::delete($image);
                }
                $image = $newImage;
            } catch (RuntimeException $e) {
                Response::error($e->getMessage());
            }
        }

        $newPurchasePrice = isset($body['purchase_price']) && $body['purchase_price'] !== ''
            ? (float)$body['purchase_price'] : (float)$existing['purchase_price'];
        $newPublicPrice   = isset($body['public_price'])   && $body['public_price']   !== ''
            ? (float)$body['public_price']   : (float)$existing['public_price'];

        $allowedTypes = ['medicine', 'cosmetics', 'medical_supply', 'personal_care', 'other'];
        $productType  = in_array($body['product_type'] ?? '', $allowedTypes, true)
            ? $body['product_type']
            : ($existing['product_type'] ?? 'other');

        // Resolve strip packaging fields
        $newStripsPerBox = array_key_exists('strips_per_box', $body)
            ? (isset($body['strips_per_box']) && $body['strips_per_box'] !== '' ? (int)$body['strips_per_box'] : null)
            : ($existing['strips_per_box'] ?? null);
        $newTabletsPerStrip = array_key_exists('tablets_per_strip', $body)
            ? (isset($body['tablets_per_strip']) && $body['tablets_per_strip'] !== '' ? (int)$body['tablets_per_strip'] : null)
            : ($existing['tablets_per_strip'] ?? null);
        if ($newStripsPerBox !== null && $newStripsPerBox <= 0)       $newStripsPerBox    = null;
        if ($newTabletsPerStrip !== null && $newTabletsPerStrip <= 0) $newTabletsPerStrip = null;

        $db->prepare("
            UPDATE medicines SET
                category_id=?, company_id=?, name=?, name_ar=?, barcode=?, sku=?,
                dosage_form=?, product_type=?, strength=?, unit=?,
                strips_per_box=?, tablets_per_strip=?,
                purchase_price=?, selling_price=?, public_price=?,
                minimum_stock=?, prescription_required=?, controlled_drug=?,
                image=?, description=?, is_active=?
            WHERE id = ?
        ")->execute([
            !empty($body['category_id']) ? (int)$body['category_id'] : null,
            !empty($body['company_id'])  ? (int)$body['company_id']  : null,
            trim($body['name']),
            trim($body['name_ar'] ?? $existing['name_ar'] ?? ''),
            $newBarcode,
            $newSku,
            trim($body['dosage_form'] ?? $existing['dosage_form'] ?? ''),
            $productType,
            trim($body['strength'] ?? $existing['strength'] ?? ''),
            trim($body['unit'] ?? $existing['unit'] ?? ''),
            $newStripsPerBox,
            $newTabletsPerStrip,
            $newPurchasePrice,
            $newPublicPrice,
            $newPublicPrice,
            isset($body['minimum_stock']) && $body['minimum_stock'] !== '' ? (int)$body['minimum_stock'] : (int)$existing['minimum_stock'],
            isset($body['prescription_required']) ? (int)(bool)$body['prescription_required'] : $existing['prescription_required'],
            isset($body['controlled_drug'])        ? (int)(bool)$body['controlled_drug']        : $existing['controlled_drug'],
            $image,
            trim($body['description'] ?? $existing['description'] ?? ''),
            isset($body['is_active']) ? (int)(bool)$body['is_active'] : $existing['is_active'],
            $id,
        ]);

        // Upsert Strip/Box units when strip configuration changed
        $stripsChanged = ($newStripsPerBox !== ((int)($existing['strips_per_box'] ?? 0) ?: null))
                      || ($newTabletsPerStrip !== ((int)($existing['tablets_per_strip'] ?? 0) ?: null));
        if ($stripsChanged && $newStripsPerBox !== null && $newTabletsPerStrip !== null && $newStripsPerBox > 1) {
            try {
                $this->upsertStripUnits($db, $id, $newStripsPerBox, $newTabletsPerStrip);
            } catch (Exception $e) {
                // Non-fatal
            }
        }

        // Record price change if prices actually changed
        $oldPurchasePrice = (float)$existing['purchase_price'];
        $oldPublicPrice   = (float)$existing['public_price'];
        if (abs($oldPurchasePrice - $newPurchasePrice) > 0.0001 || abs($oldPublicPrice - $newPublicPrice) > 0.0001) {
            try {
                $db->prepare("
                    INSERT INTO medicine_price_history
                        (medicine_id, old_purchase_price, new_purchase_price, old_public_price, new_public_price, changed_by, reason)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ")->execute([
                    $id,
                    $oldPurchasePrice,
                    $newPurchasePrice,
                    $oldPublicPrice,
                    $newPublicPrice,
                    $user['id'],
                    trim($body['price_change_reason'] ?? ''),
                ]);
            } catch (Exception $e) {
                // Table may not exist before migration — silently skip
            }
        }

        $updated = $this->getById($db, $id);
        Logger::activity($user['id'], 'update', 'medicines', $id, "Updated medicine: {$body['name']}");
        Response::success($updated, 'Medicine updated successfully');
    }

    public function destroy(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'medicines.delete');

        $id = (int)$params['id'];
        $db = Database::getInstance();

        $medicine = $this->getById($db, $id);
        if (!$medicine) {
            Response::notFound('Medicine not found');
        }

        $db->beginTransaction();
        try {
            $db->prepare("DELETE FROM sale_items WHERE medicine_id = ?")->execute([$id]);
            $db->prepare("DELETE FROM purchase_items WHERE medicine_id = ?")->execute([$id]);
            $db->prepare("DELETE FROM return_items WHERE medicine_id = ?")->execute([$id]);
            $db->prepare("DELETE FROM inventory_adjustment_request_items WHERE medicine_id = ?")->execute([$id]);
            $db->prepare("DELETE FROM inventory_adjustments WHERE medicine_id = ?")->execute([$id]);
            $db->prepare("DELETE FROM inventory_count_items WHERE medicine_id = ?")->execute([$id]);
            $db->prepare("DELETE FROM medicine_price_history WHERE medicine_id = ?")->execute([$id]);
            $db->prepare("DELETE FROM medicine_batches WHERE medicine_id = ?")->execute([$id]);
            // NULL out self-referential parent_unit_id before deleting to avoid FK cycle
            $db->prepare("UPDATE product_units SET parent_unit_id = NULL WHERE medicine_id = ?")->execute([$id]);
            $db->prepare("DELETE FROM product_units WHERE medicine_id = ?")->execute([$id]);
            $db->prepare("DELETE FROM medicines WHERE id = ?")->execute([$id]);
            $db->commit();
        } catch (Exception $e) {
            $db->rollBack();
            Response::error('Failed to delete medicine: ' . $e->getMessage(), 500);
            return;
        }

        Logger::activity($user['id'], 'delete', 'medicines', $id, "Deleted medicine: {$medicine['name']}");
        Response::success(null, 'Medicine deleted successfully');
    }

    public function batches(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'medicines.view');

        $id  = (int)$params['id'];
        $db  = Database::getInstance();

        $stmt = $db->prepare("SELECT id FROM medicines WHERE id = ?");
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            Response::notFound('Medicine not found');
        }

        $batches = $db->prepare("
            SELECT b.*, s.name as supplier_name,
                   DATEDIFF(b.expiry_date, CURDATE()) as days_to_expiry,
                   CASE
                       WHEN b.expiry_date < CURDATE() THEN 'expired'
                       WHEN b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'near_expiry'
                       ELSE 'active'
                   END as status
            FROM medicine_batches b
            LEFT JOIN suppliers s ON s.id = b.supplier_id
            WHERE b.medicine_id = ?
            ORDER BY b.expiry_date ASC, b.id ASC
        ");
        $batches->execute([$id]);

        Response::success($batches->fetchAll());
    }

    public function search(array $params): void
    {
        $user = AuthMiddleware::handle();

        $query = trim($_GET['q'] ?? '');
        if (strlen($query) < 2) {
            Response::success([]);
        }

        $db   = Database::getInstance();
        $stmt = $db->prepare("
            SELECT m.id, m.name, m.name_ar, m.barcode, m.sku, m.selling_price, m.public_price, m.purchase_price, m.unit,
                   m.prescription_required, m.controlled_drug,
                   c.name as category_name,
                   COALESCE((
                       SELECT SUM(b.quantity) FROM medicine_batches b
                       WHERE b.medicine_id = m.id AND b.quantity > 0 AND b.expiry_date >= CURDATE()
                   ), 0) as current_stock,
                   (SELECT pu2.unit_name    FROM product_units pu2 WHERE pu2.medicine_id = m.id AND pu2.is_default_purchase = 1 AND pu2.is_active = 1 LIMIT 1) AS default_purchase_unit_name,
                   (SELECT pu2.unit_name_ar FROM product_units pu2 WHERE pu2.medicine_id = m.id AND pu2.is_default_purchase = 1 AND pu2.is_active = 1 LIMIT 1) AS default_purchase_unit_name_ar
            FROM medicines m
            LEFT JOIN categories c ON c.id = m.category_id
            WHERE m.is_active = 1
              AND (
                  m.name LIKE ? OR m.name_ar LIKE ? OR m.barcode LIKE ? OR m.sku LIKE ?
                  OR EXISTS (
                      SELECT 1 FROM product_units pu
                      WHERE pu.medicine_id = m.id AND pu.barcode LIKE ? AND pu.is_active = 1
                  )
              )
            ORDER BY m.name ASC
            LIMIT 20
        ");
        $q = "%{$query}%";
        $stmt->execute([$q, $q, $q, $q, $q]);

        Response::success($stmt->fetchAll());
    }

    public function lowStock(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.view');

        $db   = Database::getInstance();
        $stmt = $db->query("
            SELECT m.id, m.name, m.name_ar, m.sku, m.minimum_stock, m.unit,
                   c.name as category_name,
                   COALESCE((
                       SELECT SUM(b.quantity) FROM medicine_batches b
                       WHERE b.medicine_id = m.id AND b.quantity > 0 AND b.expiry_date >= CURDATE()
                   ), 0) as current_stock
            FROM medicines m
            LEFT JOIN categories c ON c.id = m.category_id
            WHERE m.is_active = 1
            HAVING current_stock <= m.minimum_stock
            ORDER BY current_stock ASC
        ");

        Response::success($stmt->fetchAll());
    }

    public function expired(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.view');

        $db   = Database::getInstance();
        $stmt = $db->query("
            SELECT m.id, m.name, m.name_ar, b.batch_number, b.expiry_date,
                   b.quantity, b.id as batch_id, s.name as supplier_name,
                   DATEDIFF(CURDATE(), b.expiry_date) as days_expired
            FROM medicine_batches b
            JOIN medicines m ON m.id = b.medicine_id
            LEFT JOIN suppliers s ON s.id = b.supplier_id
            WHERE b.expiry_date < CURDATE() AND b.quantity > 0
            ORDER BY b.expiry_date ASC
        ");

        Response::success($stmt->fetchAll());
    }

    public function nearExpiry(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.view');

        $days = (int)($_GET['days'] ?? 30);
        $db   = Database::getInstance();
        $stmt = $db->prepare("
            SELECT m.id, m.name, m.name_ar, b.batch_number, b.expiry_date,
                   b.quantity, b.id as batch_id, s.name as supplier_name,
                   DATEDIFF(b.expiry_date, CURDATE()) as days_to_expiry
            FROM medicine_batches b
            JOIN medicines m ON m.id = b.medicine_id
            LEFT JOIN suppliers s ON s.id = b.supplier_id
            WHERE b.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
              AND b.quantity > 0
            ORDER BY b.expiry_date ASC
        ");
        $stmt->execute([$days]);

        Response::success($stmt->fetchAll());
    }

    public function import(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'medicines.create');

        if (empty($_FILES['file']['name'])) {
            Response::error('CSV file is required');
        }

        $file = $_FILES['file']['tmp_name'];
        if (!is_readable($file)) {
            Response::error('Cannot read uploaded file');
        }

        $handle  = fopen($file, 'r');
        $headers = fgetcsv($handle);
        $db      = Database::getInstance();
        $imported = 0;
        $errors  = [];
        $row     = 1;

        Database::beginTransaction();
        try {
            while (($data = fgetcsv($handle)) !== false) {
                $row++;
                if (count($data) < 4) {
                    $errors[] = "Row {$row}: insufficient columns";
                    continue;
                }

                [$name, $barcode, $purchasePrice, $publicPrice] = array_pad($data, 8, '');

                if (empty(trim($name))) {
                    $errors[] = "Row {$row}: name is required";
                    continue;
                }

                if (!empty(trim($barcode))) {
                    $check = $db->prepare("SELECT id FROM medicines WHERE barcode = ?");
                    $check->execute([trim($barcode)]);
                    if ($check->fetch()) {
                        $errors[] = "Row {$row}: barcode '{$barcode}' already exists";
                        continue;
                    }
                }

                // B6: 3-attempt SKU generation
                $sku = null;
                for ($attempt = 0; $attempt < 3; $attempt++) {
                    $candidate = 'MED-' . strtoupper(bin2hex(random_bytes(4)));
                    $chk = $db->prepare("SELECT id FROM medicines WHERE sku = ?");
                    $chk->execute([$candidate]);
                    if (!$chk->fetch()) { $sku = $candidate; break; }
                }
                if ($sku === null) {
                    $errors[] = "Row {$row}: could not generate unique SKU — skipped";
                    continue;
                }

                $stmt = $db->prepare("
                    INSERT INTO medicines (name, barcode, sku, purchase_price, selling_price, public_price, minimum_stock, is_active, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, 10, 1, ?)
                ");
                $stmt->execute([
                    trim($name),
                    !empty(trim($barcode)) ? trim($barcode) : null,
                    $sku,
                    (float)$purchasePrice,
                    (float)$publicPrice,
                    (float)$publicPrice,
                    $user['id'],
                ]);
                $medId = (int)$db->lastInsertId();

                // B3: seed base product_units row so medicine is scannable at POS
                try {
                    $db->prepare("
                        INSERT INTO product_units
                            (medicine_id, unit_name, unit_name_ar, unit_code, conversion_factor,
                             is_base_unit, is_default_purchase, is_default_sale, is_active, sort_order)
                        VALUES (?, 'Piece', '', 'piece', 1.000000, 1, 1, 1, 1, 0)
                    ")->execute([$medId]);
                } catch (Exception $e) { /* non-fatal */ }

                $imported++;
            }

            fclose($handle);
            Database::commit();
        } catch (Exception $e) {
            Database::rollBack();
            fclose($handle);
            Response::error('Import failed: ' . $e->getMessage(), 500);
        }

        Logger::activity($user['id'], 'import', 'medicines', null, "Imported {$imported} medicines");
        Response::success(['imported' => $imported, 'errors' => $errors], "Import completed. {$imported} medicines imported.");
    }

    public function export(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'medicines.view');

        $db   = Database::getInstance();
        $stmt = $db->query("
            SELECT m.name, m.name_ar, m.barcode, m.sku,
                   c.name as category, co.name as company,
                   m.purchase_price, m.public_price, m.minimum_stock,
                   m.dosage_form, m.strength, m.unit, m.prescription_required, m.controlled_drug,
                   COALESCE((SELECT SUM(b.quantity) FROM medicine_batches b WHERE b.medicine_id = m.id AND b.quantity > 0 AND b.expiry_date >= CURDATE()), 0) as current_stock
            FROM medicines m
            LEFT JOIN categories c ON c.id = m.category_id
            LEFT JOIN companies co ON co.id = m.company_id
            WHERE m.is_active = 1
            ORDER BY m.name ASC
        ");
        $medicines = $stmt->fetchAll();

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="medicines-' . date('Y-m-d') . '.csv"');

        $out = fopen('php://output', 'w');
        fputcsv($out, ['Name', 'Arabic Name', 'Barcode', 'SKU', 'Category', 'Company',
                        'Purchase Price', 'Public Price', 'Min Stock', 'Dosage Form', 'Strength', 'Unit',
                        'Prescription Required', 'Controlled Drug', 'Current Stock']);

        foreach ($medicines as $medicine) {
            fputcsv($out, $medicine);
        }

        fclose($out);
        exit;
    }

    public function priceHistory(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'medicines.view');

        $id      = (int)$params['id'];
        $db      = Database::getInstance();
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(50, max(10, (int)($_GET['per_page'] ?? 20)));

        $stmt = $db->prepare("SELECT id FROM medicines WHERE id = ?");
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            Response::notFound('Medicine not found');
        }

        $total = $db->prepare("SELECT COUNT(*) FROM medicine_price_history WHERE medicine_id = ?");
        $total->execute([$id]);
        $total = (int)$total->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $rows   = $db->prepare("
            SELECT mph.*, u.name AS changed_by_name
            FROM medicine_price_history mph
            LEFT JOIN users u ON u.id = mph.changed_by
            WHERE mph.medicine_id = ?
            ORDER BY mph.changed_at DESC
            LIMIT ? OFFSET ?
        ");
        $rows->execute([$id, $perPage, $offset]);

        Response::paginated($rows->fetchAll(), $total, $page, $perPage);
    }

    public function purchaseLines(array $params): void
    {
        $user = AuthMiddleware::handle();

        $id  = (int)$params['id'];
        $db  = Database::getInstance();

        $stmt = $db->prepare("
            SELECT pi.id, pi.purchase_id, pi.quantity, pi.remaining_quantity,
                   pi.purchase_price, pi.expiry_date,
                   p.invoice_number, p.purchase_date,
                   s.name as supplier_name
            FROM purchase_items pi
            JOIN purchases p ON p.id = pi.purchase_id
            LEFT JOIN suppliers s ON s.id = p.supplier_id
            WHERE pi.medicine_id = ? AND pi.remaining_quantity > 0
            ORDER BY pi.expiry_date ASC, pi.id ASC
        ");
        $stmt->execute([$id]);

        Response::success($stmt->fetchAll());
    }

    private function upsertStripUnits(PDO $db, int $mid, int $strips, int $tablets): void
    {
        // Piece / Tablet — base unit (factor = 1)
        $base = $db->prepare("SELECT id FROM product_units WHERE medicine_id = ? AND is_base_unit = 1 LIMIT 1");
        $base->execute([$mid]);
        $baseRow = $base->fetch();
        if ($baseRow) {
            $db->prepare("UPDATE product_units SET conversion_factor=1.000000, sort_order=0, is_active=1 WHERE id=?")->execute([(int)$baseRow['id']]);
            $baseId = (int)$baseRow['id'];
        } else {
            $db->prepare("INSERT INTO product_units (medicine_id,unit_name,unit_code,conversion_factor,is_base_unit,is_default_purchase,is_default_sale,is_active,sort_order) VALUES (?,'Tablet','TAB',1.000000,1,0,0,1,0)")->execute([$mid]);
            $baseId = (int)$db->lastInsertId();
        }

        // Strip — factor = tablets_per_strip
        $stripFactor = (float)$tablets;
        $stripRow = $db->prepare("SELECT id FROM product_units WHERE medicine_id = ? AND (LOWER(unit_code)='str' OR LOWER(unit_name) LIKE '%strip%') LIMIT 1");
        $stripRow->execute([$mid]);
        $strip = $stripRow->fetch();
        if ($strip) {
            $db->prepare("UPDATE product_units SET conversion_factor=?,parent_unit_id=?,contains_quantity=?,is_active=1,sort_order=1 WHERE id=?")->execute([$stripFactor, $baseId, $tablets, (int)$strip['id']]);
            $stripId = (int)$strip['id'];
        } else {
            $db->prepare("INSERT INTO product_units (medicine_id,unit_name,unit_code,conversion_factor,parent_unit_id,contains_quantity,is_base_unit,is_default_purchase,is_default_sale,is_active,sort_order) VALUES (?,'Strip','STR',?,?,?,0,0,0,1,1)")->execute([$mid, $stripFactor, $baseId, $tablets]);
            $stripId = (int)$db->lastInsertId();
        }

        // Box — factor = strips_per_box × tablets_per_strip
        $boxFactor = (float)($strips * $tablets);
        $boxRow = $db->prepare("SELECT id FROM product_units WHERE medicine_id = ? AND (LOWER(unit_code)='box' OR LOWER(unit_name) LIKE '%box%') LIMIT 1");
        $boxRow->execute([$mid]);
        $box = $boxRow->fetch();
        if ($box) {
            $db->prepare("UPDATE product_units SET conversion_factor=?,parent_unit_id=?,contains_quantity=?,is_default_purchase=1,is_default_sale=1,is_active=1,sort_order=2 WHERE id=?")->execute([$boxFactor, $stripId, $strips, (int)$box['id']]);
        } else {
            $db->prepare("INSERT INTO product_units (medicine_id,unit_name,unit_code,conversion_factor,parent_unit_id,contains_quantity,is_base_unit,is_default_purchase,is_default_sale,is_active,sort_order) VALUES (?,'Box','BOX',?,?,?,0,1,1,1,2)")->execute([$mid, $boxFactor, $stripId, $strips]);
        }
    }

    private function getById(PDO $db, int $id): ?array
    {
        $stmt = $db->prepare("
            SELECT m.*,
                   c.name as category_name,
                   co.name as company_name,
                   COALESCE((
                       SELECT SUM(b.quantity) FROM medicine_batches b
                       WHERE b.medicine_id = m.id AND b.quantity > 0 AND b.expiry_date >= CURDATE()
                   ), 0) as current_stock,
                   (SELECT COUNT(*) FROM medicine_batches b WHERE b.medicine_id = m.id) as batch_count,
                   (SELECT pu2.unit_name    FROM product_units pu2 WHERE pu2.medicine_id = m.id AND pu2.is_default_purchase = 1 AND pu2.is_active = 1 LIMIT 1) AS default_purchase_unit_name,
                   (SELECT pu2.unit_name_ar FROM product_units pu2 WHERE pu2.medicine_id = m.id AND pu2.is_default_purchase = 1 AND pu2.is_active = 1 LIMIT 1) AS default_purchase_unit_name_ar,
                   COALESCE(CONCAT('[', GROUP_CONCAT(
                       JSON_OBJECT('name', pu.unit_name, 'name_ar', pu.unit_name_ar, 'factor', CAST(pu.conversion_factor AS CHAR))
                       ORDER BY pu.conversion_factor DESC SEPARATOR ','
                   ), ']'), '[]') AS packaging_raw
            FROM medicines m
            LEFT JOIN categories c ON c.id = m.category_id
            LEFT JOIN companies co ON co.id = m.company_id
            LEFT JOIN product_units pu ON pu.medicine_id = m.id AND pu.is_active = 1
            WHERE m.id = ?
            GROUP BY m.id
        ");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) return null;
        $row['packaging'] = json_decode($row['packaging_raw'] ?? '[]', true) ?: [];
        unset($row['packaging_raw']);
        return $row;
    }
}
