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
            $where[] = 'MATCH(m.name, m.name_ar, m.scientific_name, m.barcode, m.sku) AGAINST(? IN BOOLEAN MODE)';
            $binds[] = $search . '*';
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
                   (SELECT COUNT(*) FROM medicine_batches b WHERE b.medicine_id = m.id AND b.expiry_date < CURDATE() AND b.quantity > 0) as expired_batches
            FROM medicines m
            LEFT JOIN categories c ON c.id = m.category_id
            LEFT JOIN companies co ON co.id = m.company_id
            WHERE {$whereStr}
            ORDER BY m.name ASC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([...$binds, $perPage, $offset]);

        Response::paginated($stmt->fetchAll(), $total, $page, $perPage);
    }

    public function store(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'medicines.create');

        $body = $_POST;

        $validator = Validator::make($body, [
            'name'          => 'required|string|maxlength:200',
            'public_price'  => 'required|numeric|min:0',
            'purchase_price'=> 'required|numeric|min:0',
            'minimum_stock' => 'required|integer|min:0',
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

        // Auto-generate SKU if not provided
        $sku = !empty($body['sku']) ? trim($body['sku']) : 'MED-' . strtoupper(bin2hex(random_bytes(4)));

        // Check duplicate SKU
        $stmt = $db->prepare("SELECT id FROM medicines WHERE sku = ?");
        $stmt->execute([$sku]);
        if ($stmt->fetch()) {
            $sku = 'MED-' . strtoupper(bin2hex(random_bytes(4)));
        }

        $image = null;
        if (!empty($_FILES['image']['name'])) {
            try {
                $image = Upload::image($_FILES['image'], 'medicines');
            } catch (RuntimeException $e) {
                Response::error($e->getMessage());
            }
        }

        $stmt = $db->prepare("
            INSERT INTO medicines (
                category_id, company_id, name, name_ar, scientific_name, barcode, sku,
                dosage_form, strength, unit, purchase_price, selling_price, public_price, minimum_stock,
                prescription_required, controlled_drug, image, description, is_active, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");

        $stmt->execute([
            !empty($body['category_id']) ? (int)$body['category_id'] : null,
            !empty($body['company_id'])  ? (int)$body['company_id']  : null,
            trim($body['name']),
            trim($body['name_ar'] ?? ''),
            trim($body['scientific_name'] ?? ''),
            !empty($body['barcode']) ? trim($body['barcode']) : null,
            $sku,
            trim($body['dosage_form'] ?? ''),
            trim($body['strength'] ?? ''),
            trim($body['unit'] ?? 'Piece'),
            (float)$body['purchase_price'],
            (float)$body['public_price'],
            (float)$body['public_price'],
            (int)$body['minimum_stock'],
            isset($body['prescription_required']) ? (int)(bool)$body['prescription_required'] : 0,
            isset($body['controlled_drug'])        ? (int)(bool)$body['controlled_drug']        : 0,
            $image,
            trim($body['description'] ?? ''),
            isset($body['is_active']) ? (int)(bool)$body['is_active'] : 1,
            $user['id'],
        ]);

        $id       = (int)$db->lastInsertId();
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
            'name'          => 'required|string|maxlength:200',
            'public_price'  => 'required|numeric|min:0',
            'purchase_price'=> 'required|numeric|min:0',
            'minimum_stock' => 'required|integer|min:0',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        if (!empty($body['barcode']) && $body['barcode'] !== $existing['barcode']) {
            $stmt = $db->prepare("SELECT id FROM medicines WHERE barcode = ? AND id != ?");
            $stmt->execute([trim($body['barcode']), $id]);
            if ($stmt->fetch()) {
                Response::error('Barcode already exists', 409);
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

        $db->prepare("
            UPDATE medicines SET
                category_id=?, company_id=?, name=?, name_ar=?, scientific_name=?, barcode=?,
                dosage_form=?, strength=?, unit=?, purchase_price=?, selling_price=?, public_price=?,
                minimum_stock=?, prescription_required=?, controlled_drug=?,
                image=?, description=?, is_active=?
            WHERE id = ?
        ")->execute([
            !empty($body['category_id']) ? (int)$body['category_id'] : null,
            !empty($body['company_id'])  ? (int)$body['company_id']  : null,
            trim($body['name']),
            trim($body['name_ar'] ?? $existing['name_ar']),
            trim($body['scientific_name'] ?? $existing['scientific_name']),
            !empty($body['barcode']) ? trim($body['barcode']) : $existing['barcode'],
            trim($body['dosage_form'] ?? $existing['dosage_form']),
            trim($body['strength'] ?? $existing['strength']),
            trim($body['unit'] ?? $existing['unit']),
            (float)$body['purchase_price'],
            (float)$body['public_price'],
            (float)$body['public_price'],
            (int)$body['minimum_stock'],
            isset($body['prescription_required']) ? (int)(bool)$body['prescription_required'] : $existing['prescription_required'],
            isset($body['controlled_drug'])        ? (int)(bool)$body['controlled_drug']        : $existing['controlled_drug'],
            $image,
            trim($body['description'] ?? $existing['description']),
            isset($body['is_active']) ? (int)(bool)$body['is_active'] : $existing['is_active'],
            $id,
        ]);

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

        // Soft delete
        $db->prepare("UPDATE medicines SET is_active = 0 WHERE id = ?")->execute([$id]);
        Logger::activity($user['id'], 'delete', 'medicines', $id, "Deactivated medicine: {$medicine['name']}");
        Response::success(null, 'Medicine deactivated successfully');
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
            SELECT m.id, m.name, m.name_ar, m.barcode, m.sku, m.selling_price, m.public_price, m.unit,
                   m.prescription_required, m.controlled_drug,
                   c.name as category_name,
                   COALESCE((
                       SELECT SUM(b.quantity) FROM medicine_batches b
                       WHERE b.medicine_id = m.id AND b.quantity > 0 AND b.expiry_date >= CURDATE()
                   ), 0) as current_stock
            FROM medicines m
            LEFT JOIN categories c ON c.id = m.category_id
            WHERE m.is_active = 1
              AND (m.name LIKE ? OR m.name_ar LIKE ? OR m.barcode LIKE ? OR m.scientific_name LIKE ?)
            ORDER BY m.name ASC
            LIMIT 20
        ");
        $q = "%{$query}%";
        $stmt->execute([$q, $q, $q, $q]);

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

                $sku  = 'MED-' . strtoupper(bin2hex(random_bytes(4)));
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
            SELECT m.name, m.name_ar, m.scientific_name, m.barcode, m.sku,
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
        fputcsv($out, ['Name', 'Arabic Name', 'Scientific Name', 'Barcode', 'SKU', 'Category', 'Company',
                        'Purchase Price', 'Public Price', 'Min Stock', 'Dosage Form', 'Strength', 'Unit',
                        'Prescription Required', 'Controlled Drug', 'Current Stock']);

        foreach ($medicines as $medicine) {
            fputcsv($out, $medicine);
        }

        fclose($out);
        exit;
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
                   (SELECT COUNT(*) FROM medicine_batches b WHERE b.medicine_id = m.id) as batch_count
            FROM medicines m
            LEFT JOIN categories c ON c.id = m.category_id
            LEFT JOIN companies co ON co.id = m.company_id
            WHERE m.id = ?
        ");
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }
}
