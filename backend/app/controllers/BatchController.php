<?php

declare(strict_types=1);

class BatchController
{
    public function index(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'batches.view');

        $db         = Database::getInstance();
        $page       = max(1, (int)($_GET['page'] ?? 1));
        $perPage    = min(100, max(10, (int)($_GET['per_page'] ?? 20)));
        $medicineId = (int)($_GET['medicine_id'] ?? 0);
        $status     = $_GET['status'] ?? '';

        $where = ['1=1'];
        $binds = [];

        if ($medicineId > 0) {
            $where[] = 'b.medicine_id = ?';
            $binds[] = $medicineId;
        }

        switch ($status) {
            case 'active':
                $where[] = 'b.expiry_date >= CURDATE() AND b.quantity > 0';
                break;
            case 'expired':
                $where[] = 'b.expiry_date < CURDATE()';
                break;
            case 'near_expiry':
                $where[] = 'b.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND b.quantity > 0';
                break;
            case 'out_of_stock':
                $where[] = 'b.quantity = 0';
                break;
        }

        $whereStr = implode(' AND ', $where);
        $total    = $db->prepare("SELECT COUNT(*) FROM medicine_batches b WHERE {$whereStr}");
        $total->execute($binds);
        $total = (int)$total->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt   = $db->prepare("
            SELECT b.*, m.name as medicine_name, m.name_ar as medicine_name_ar, m.sku,
                   s.name as supplier_name,
                   DATEDIFF(b.expiry_date, CURDATE()) as days_to_expiry,
                   CASE
                       WHEN b.expiry_date < CURDATE() THEN 'expired'
                       WHEN b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'near_expiry'
                       WHEN b.quantity = 0 THEN 'out_of_stock'
                       ELSE 'active'
                   END as status
            FROM medicine_batches b
            JOIN medicines m ON m.id = b.medicine_id
            LEFT JOIN suppliers s ON s.id = b.supplier_id
            WHERE {$whereStr}
            ORDER BY b.expiry_date ASC, b.id ASC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([...$binds, $perPage, $offset]);

        Response::paginated($stmt->fetchAll(), $total, $page, $perPage);
    }

    public function store(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'batches.create');

        $body = $_POST;

        $validator = Validator::make($body, [
            'medicine_id'    => 'required|integer|min:1',
            'batch_number'   => 'required|string|maxlength:100',
            'expiry_date'    => 'required|date',
            'purchase_price' => 'required|numeric|min:0',
            'public_price'   => 'required|numeric|min:0',
            'quantity'       => 'required|integer|min:0',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        $db = Database::getInstance();

        // Verify medicine exists
        $stmt = $db->prepare("SELECT id FROM medicines WHERE id = ? AND is_active = 1");
        $stmt->execute([(int)$body['medicine_id']]);
        if (!$stmt->fetch()) {
            Response::notFound('Medicine not found');
        }

        // Check duplicate batch number for same medicine
        $stmt = $db->prepare("SELECT id FROM medicine_batches WHERE medicine_id = ? AND batch_number = ?");
        $stmt->execute([(int)$body['medicine_id'], trim($body['batch_number'])]);
        if ($stmt->fetch()) {
            Response::error('Batch number already exists for this medicine', 409);
        }

        $qty  = (int)$body['quantity'];
        $publicPrice = (float)$body['public_price'];
        $stmt = $db->prepare("
            INSERT INTO medicine_batches (medicine_id, supplier_id, batch_number, manufacturing_date,
                expiry_date, purchase_price, selling_price, public_price, quantity, initial_quantity, notes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            (int)$body['medicine_id'],
            !empty($body['supplier_id']) ? (int)$body['supplier_id'] : null,
            trim($body['batch_number']),
            $body['manufacturing_date'] ?? null,
            trim($body['expiry_date']),
            (float)$body['purchase_price'],
            $publicPrice,
            $publicPrice,
            $qty,
            $qty,
            trim($body['notes'] ?? ''),
            $user['id'],
        ]);

        $id    = (int)$db->lastInsertId();
        $batch = $db->query("
            SELECT b.*, m.name as medicine_name FROM medicine_batches b
            JOIN medicines m ON m.id = b.medicine_id WHERE b.id = {$id}
        ")->fetch();

        Logger::activity($user['id'], 'create', 'batches', $id, "Created batch {$body['batch_number']}");
        Response::created($batch, 'Batch created successfully');
    }

    public function show(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'batches.view');

        $id   = (int)$params['id'];
        $db   = Database::getInstance();
        $stmt = $db->prepare("
            SELECT b.*, m.name as medicine_name, m.sku, s.name as supplier_name
            FROM medicine_batches b
            JOIN medicines m ON m.id = b.medicine_id
            LEFT JOIN suppliers s ON s.id = b.supplier_id
            WHERE b.id = ?
        ");
        $stmt->execute([$id]);
        $batch = $stmt->fetch();

        if (!$batch) {
            Response::notFound('Batch not found');
        }

        Response::success($batch);
    }

    public function update(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'batches.edit');

        $id   = (int)$params['id'];
        $body = $_POST;
        $db   = Database::getInstance();

        $stmt = $db->prepare("SELECT * FROM medicine_batches WHERE id = ?");
        $stmt->execute([$id]);
        $batch = $stmt->fetch();

        if (!$batch) {
            Response::notFound('Batch not found');
        }

        $validator = Validator::make($body, [
            'expiry_date'    => 'required|date',
            'purchase_price' => 'required|numeric|min:0',
            'public_price'   => 'required|numeric|min:0',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        $publicPrice = (float)$body['public_price'];
        $db->prepare("
            UPDATE medicine_batches SET
                supplier_id=?, manufacturing_date=?, expiry_date=?,
                purchase_price=?, selling_price=?, public_price=?, notes=?
            WHERE id = ?
        ")->execute([
            !empty($body['supplier_id']) ? (int)$body['supplier_id'] : $batch['supplier_id'],
            $body['manufacturing_date'] ?? $batch['manufacturing_date'],
            trim($body['expiry_date']),
            (float)$body['purchase_price'],
            $publicPrice,
            $publicPrice,
            trim($body['notes'] ?? $batch['notes']),
            $id,
        ]);

        $updated = $db->query("SELECT * FROM medicine_batches WHERE id = {$id}")->fetch();
        Logger::activity($user['id'], 'update', 'batches', $id, "Updated batch #{$id}");
        Response::success($updated, 'Batch updated successfully');
    }

    public function destroy(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'batches.delete');

        $id = (int)$params['id'];
        $db = Database::getInstance();

        $stmt = $db->prepare("SELECT * FROM medicine_batches WHERE id = ?");
        $stmt->execute([$id]);
        $batch = $stmt->fetch();

        if (!$batch) {
            Response::notFound('Batch not found');
        }

        // Check if batch has been used in sales
        $count = $db->prepare("SELECT COUNT(*) FROM sale_items WHERE batch_id = ?");
        $count->execute([$id]);
        if ((int)$count->fetchColumn() > 0) {
            Response::error('Cannot delete batch that has been used in sales', 409);
        }

        $db->prepare("DELETE FROM medicine_batches WHERE id = ?")->execute([$id]);
        Logger::activity($user['id'], 'delete', 'batches', $id, "Deleted batch #{$id}");
        Response::success(null, 'Batch deleted successfully');
    }
}
