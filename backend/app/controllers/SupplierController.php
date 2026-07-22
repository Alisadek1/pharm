<?php

declare(strict_types=1);

class SupplierController
{
    public function index(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'suppliers.view');

        $db      = Database::getInstance();
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(100, max(10, (int)($_GET['per_page'] ?? 20)));
        $search  = trim($_GET['search'] ?? '');

        $where = ['1=1'];
        $binds = [];

        if ($search !== '') {
            $where[] = '(s.name LIKE ? OR s.company_name LIKE ? OR s.phone LIKE ? OR s.email LIKE ?)';
            $binds   = array_merge($binds, ["%{$search}%", "%{$search}%", "%{$search}%", "%{$search}%"]);
        }

        $whereStr = implode(' AND ', $where);
        $total    = $db->prepare("SELECT COUNT(*) FROM suppliers s WHERE {$whereStr}");
        $total->execute($binds);
        $total = (int)$total->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt   = $db->prepare("
            SELECT s.*,
                   (SELECT COUNT(*) FROM purchases p WHERE p.supplier_id = s.id) as total_purchases,
                   (SELECT COALESCE(SUM(p.total),0) FROM purchases p WHERE p.supplier_id = s.id AND p.status = 'received') as total_amount
            FROM suppliers s
            WHERE {$whereStr}
            ORDER BY s.name ASC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([...$binds, $perPage, $offset]);

        Response::paginated($stmt->fetchAll(), $total, $page, $perPage);
    }

    public function store(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'suppliers.create');

        $body = $_POST;
        $validator = Validator::make($body, [
            'name'         => 'required|string|maxlength:150',
            'company_name' => 'required|string|maxlength:200',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        $db = Database::getInstance();
        $stmt = $db->prepare("
            INSERT INTO suppliers (name, company_name, phone, email, address, tax_number, credit_limit, notes, is_active, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            trim($body['name']),
            trim($body['company_name'] ?? ''),
            trim($body['phone'] ?? ''),
            trim($body['email'] ?? ''),
            trim($body['address'] ?? ''),
            trim($body['tax_number'] ?? ''),
            (float)($body['credit_limit'] ?? 0),
            trim($body['notes'] ?? ''),
            1,
            $user['id'],
        ]);

        $id       = (int)$db->lastInsertId();
        $supplier = $db->query("SELECT * FROM suppliers WHERE id = {$id}")->fetch();

        Logger::activity($user['id'], 'create', 'suppliers', $id, "Created supplier: {$body['name']}");
        Response::created($supplier, 'Supplier created successfully');
    }

    public function show(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'suppliers.view');

        $id  = (int)$params['id'];
        $db  = Database::getInstance();

        $stmt = $db->prepare("SELECT * FROM suppliers WHERE id = ?");
        $stmt->execute([$id]);
        $supplier = $stmt->fetch();

        if (!$supplier) {
            Response::notFound('Supplier not found');
        }

        Response::success($supplier);
    }

    public function update(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'suppliers.edit');

        $id   = (int)$params['id'];
        $body = $_POST;
        $db   = Database::getInstance();

        $stmt = $db->prepare("SELECT * FROM suppliers WHERE id = ?");
        $stmt->execute([$id]);
        $supplier = $stmt->fetch();

        if (!$supplier) {
            Response::notFound('Supplier not found');
        }

        $validator = Validator::make($body, [
            'name'         => 'required|string|maxlength:150',
            'company_name' => 'required|string|maxlength:200',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        $db->prepare("
            UPDATE suppliers SET name=?, company_name=?, phone=?, email=?, address=?,
                                 tax_number=?, credit_limit=?, notes=?, is_active=?
            WHERE id = ?
        ")->execute([
            trim($body['name']),
            trim($body['company_name'] ?? $supplier['company_name']),
            trim($body['phone'] ?? $supplier['phone']),
            trim($body['email'] ?? $supplier['email']),
            trim($body['address'] ?? $supplier['address']),
            trim($body['tax_number'] ?? $supplier['tax_number']),
            (float)($body['credit_limit'] ?? $supplier['credit_limit']),
            trim($body['notes'] ?? $supplier['notes']),
            isset($body['is_active']) ? (int)(bool)$body['is_active'] : $supplier['is_active'],
            $id,
        ]);

        $updated = $db->query("SELECT * FROM suppliers WHERE id = {$id}")->fetch();
        Logger::activity($user['id'], 'update', 'suppliers', $id, "Updated supplier: {$body['name']}");
        Response::success($updated, 'Supplier updated successfully');
    }

    public function destroy(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'suppliers.delete');

        $id = (int)$params['id'];
        $db = Database::getInstance();

        $stmt = $db->prepare("SELECT * FROM suppliers WHERE id = ?");
        $stmt->execute([$id]);
        $supplier = $stmt->fetch();

        if (!$supplier) {
            Response::notFound('Supplier not found');
        }

        $count = $db->prepare("SELECT COUNT(*) FROM purchases WHERE supplier_id = ?");
        $count->execute([$id]);
        if ((int)$count->fetchColumn() > 0) {
            Response::error('Cannot delete supplier with purchase history. Deactivate instead.', 409);
        }

        $db->prepare("DELETE FROM suppliers WHERE id = ?")->execute([$id]);
        Logger::activity($user['id'], 'delete', 'suppliers', $id, "Deleted supplier: {$supplier['name']}");
        Response::success(null, 'Supplier deleted successfully');
    }

    public function export(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'suppliers.view');

        $db = Database::getInstance();
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="suppliers-export-' . date('Y-m-d') . '.csv"');
        echo "\xEF\xBB\xBF";
        $out = fopen('php://output', 'w');
        fputcsv($out, ['Name', 'Phone', 'Email', 'Address', 'Balance', 'Total Purchases', 'Notes', 'Created At']);
        $stmt = $db->query("
            SELECT s.name, s.phone, s.email, s.address, s.balance,
                   COALESCE(SUM(p.total), 0) as total_purchases,
                   s.notes, DATE(s.created_at)
            FROM suppliers s
            LEFT JOIN purchases p ON p.supplier_id = s.id AND p.status = 'received'
            GROUP BY s.id ORDER BY s.name ASC
        ");
        foreach ($stmt->fetchAll() as $row) fputcsv($out, $row);
        fclose($out);
        exit;
    }

    public function purchases(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'suppliers.view');

        $id      = (int)$params['id'];
        $db      = Database::getInstance();
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(50, max(10, (int)($_GET['per_page'] ?? 15)));

        $stmt = $db->prepare("SELECT id FROM suppliers WHERE id = ?");
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            Response::notFound('Supplier not found');
        }

        $total = $db->prepare("SELECT COUNT(*) FROM purchases WHERE supplier_id = ?");
        $total->execute([$id]);
        $total = (int)$total->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt   = $db->prepare("
            SELECT p.*, u.name as created_by_name
            FROM purchases p
            LEFT JOIN users u ON u.id = p.user_id
            WHERE p.supplier_id = ?
            ORDER BY p.purchase_date DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([$id, $perPage, $offset]);

        Response::paginated($stmt->fetchAll(), $total, $page, $perPage);
    }
}
