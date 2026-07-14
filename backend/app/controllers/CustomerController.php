<?php

declare(strict_types=1);

class CustomerController
{
    public function index(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'customers.view');

        $db      = Database::getInstance();
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(100, max(10, (int)($_GET['per_page'] ?? 20)));
        $search  = trim($_GET['search'] ?? '');

        $where = ['1=1'];
        $binds = [];

        if ($search !== '') {
            $where[] = '(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)';
            $binds   = array_merge($binds, ["%{$search}%", "%{$search}%", "%{$search}%"]);
        }

        $whereStr = implode(' AND ', $where);
        $total    = $db->prepare("SELECT COUNT(*) FROM customers c WHERE {$whereStr}");
        $total->execute($binds);
        $total = (int)$total->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt   = $db->prepare("
            SELECT c.*,
                   (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completed') as total_invoices
            FROM customers c
            WHERE {$whereStr}
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([...$binds, $perPage, $offset]);

        Response::paginated($stmt->fetchAll(), $total, $page, $perPage);
    }

    public function store(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'customers.create');

        $body = $_POST;
        $validator = Validator::make($body, [
            'name' => 'required|string|maxlength:150',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        // Check duplicate phone
        if (!empty($body['phone'])) {
            $db   = Database::getInstance();
            $stmt = $db->prepare("SELECT id FROM customers WHERE phone = ?");
            $stmt->execute([trim($body['phone'])]);
            if ($stmt->fetch()) {
                Response::error('A customer with this phone number already exists', 409);
            }
        }

        $db = Database::getInstance();
        $stmt = $db->prepare("
            INSERT INTO customers (name, phone, email, date_of_birth, gender, address, id_number, notes, is_active, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            trim($body['name']),
            trim($body['phone'] ?? ''),
            trim($body['email'] ?? ''),
            $body['date_of_birth'] ?? null,
            $body['gender'] ?? null,
            trim($body['address'] ?? ''),
            trim($body['id_number'] ?? ''),
            trim($body['notes'] ?? ''),
            1,
            $user['id'],
        ]);

        $id       = (int)$db->lastInsertId();
        $customer = $db->query("SELECT * FROM customers WHERE id = {$id}")->fetch();

        Logger::activity($user['id'], 'create', 'customers', $id, "Created customer: {$body['name']}");
        Response::created($customer, 'Customer created successfully');
    }

    public function show(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'customers.view');

        $id  = (int)$params['id'];
        $db  = Database::getInstance();

        $stmt = $db->prepare("SELECT * FROM customers WHERE id = ?");
        $stmt->execute([$id]);
        $customer = $stmt->fetch();

        if (!$customer) {
            Response::notFound('Customer not found');
        }

        Response::success($customer);
    }

    public function update(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'customers.edit');

        $id   = (int)$params['id'];
        $body = $_POST;
        $db   = Database::getInstance();

        $stmt = $db->prepare("SELECT * FROM customers WHERE id = ?");
        $stmt->execute([$id]);
        $customer = $stmt->fetch();

        if (!$customer) {
            Response::notFound('Customer not found');
        }

        $validator = Validator::make($body, [
            'name' => 'required|string|maxlength:150',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        if (!empty($body['phone']) && $body['phone'] !== $customer['phone']) {
            $stmt2 = $db->prepare("SELECT id FROM customers WHERE phone = ? AND id != ?");
            $stmt2->execute([trim($body['phone']), $id]);
            if ($stmt2->fetch()) {
                Response::error('A customer with this phone number already exists', 409);
            }
        }

        $db->prepare("
            UPDATE customers SET name=?, phone=?, email=?, date_of_birth=?, gender=?,
                                 address=?, id_number=?, notes=?, is_active=?
            WHERE id = ?
        ")->execute([
            trim($body['name']),
            trim($body['phone'] ?? $customer['phone']),
            trim($body['email'] ?? $customer['email']),
            $body['date_of_birth'] ?? $customer['date_of_birth'],
            $body['gender'] ?? $customer['gender'],
            trim($body['address'] ?? $customer['address']),
            trim($body['id_number'] ?? $customer['id_number']),
            trim($body['notes'] ?? $customer['notes']),
            isset($body['is_active']) ? (int)(bool)$body['is_active'] : $customer['is_active'],
            $id,
        ]);

        $updated = $db->query("SELECT * FROM customers WHERE id = {$id}")->fetch();
        Logger::activity($user['id'], 'update', 'customers', $id, "Updated customer: {$body['name']}");
        Response::success($updated, 'Customer updated successfully');
    }

    public function destroy(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'customers.delete');

        $id = (int)$params['id'];
        $db = Database::getInstance();

        $stmt = $db->prepare("SELECT * FROM customers WHERE id = ?");
        $stmt->execute([$id]);
        $customer = $stmt->fetch();

        if (!$customer) {
            Response::notFound('Customer not found');
        }

        // Soft delete to preserve history
        $db->prepare("UPDATE customers SET is_active = 0 WHERE id = ?")->execute([$id]);
        Logger::activity($user['id'], 'delete', 'customers', $id, "Deactivated customer: {$customer['name']}");
        Response::success(null, 'Customer deactivated successfully');
    }

    public function export(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'customers.view');

        $db = Database::getInstance();
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="customers-export-' . date('Y-m-d') . '.csv"');
        echo "\xEF\xBB\xBF";
        $out = fopen('php://output', 'w');
        fputcsv($out, ['Name', 'Phone', 'Email', 'Date of Birth', 'Loyalty Points', 'Total Purchases', 'Notes', 'Created At']);
        $stmt = $db->query("SELECT name, phone, email, date_of_birth, loyalty_points, total_purchases, notes, DATE(created_at) FROM customers ORDER BY name ASC");
        foreach ($stmt->fetchAll() as $row) fputcsv($out, $row);
        fclose($out);
        exit;
    }

    public function history(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'customers.view');

        $id      = (int)$params['id'];
        $db      = Database::getInstance();
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(50, max(10, (int)($_GET['per_page'] ?? 15)));

        $stmt = $db->prepare("SELECT * FROM customers WHERE id = ?");
        $stmt->execute([$id]);
        $customer = $stmt->fetch();

        if (!$customer) {
            Response::notFound('Customer not found');
        }

        $total = $db->prepare("SELECT COUNT(*) FROM sales WHERE customer_id = ?");
        $total->execute([$id]);
        $total = (int)$total->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt   = $db->prepare("
            SELECT s.id, s.invoice_number, s.total, s.payment_method, s.sale_date,
                   s.status, s.loyalty_points_earned, u.name as cashier_name
            FROM sales s
            LEFT JOIN users u ON u.id = s.user_id
            WHERE s.customer_id = ?
            ORDER BY s.sale_date DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([$id, $perPage, $offset]);

        Response::paginated($stmt->fetchAll(), $total, $page, $perPage);
    }
}
