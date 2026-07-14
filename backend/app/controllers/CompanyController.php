<?php

declare(strict_types=1);

class CompanyController
{
    public function index(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'companies.view');

        $db      = Database::getInstance();
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(100, max(10, (int)($_GET['per_page'] ?? 20)));
        $search  = trim($_GET['search'] ?? '');

        $where = ['1=1'];
        $binds = [];

        if ($search !== '') {
            $where[] = '(c.name LIKE ? OR c.name_ar LIKE ? OR c.country LIKE ?)';
            $binds[] = "%{$search}%";
            $binds[] = "%{$search}%";
            $binds[] = "%{$search}%";
        }

        $whereStr = implode(' AND ', $where);
        $total    = $db->prepare("SELECT COUNT(*) FROM companies c WHERE {$whereStr}");
        $total->execute($binds);
        $total = (int)$total->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt   = $db->prepare("
            SELECT c.*,
                   (SELECT COUNT(*) FROM medicines m WHERE m.company_id = c.id AND m.is_active = 1) as medicine_count
            FROM companies c
            WHERE {$whereStr}
            ORDER BY c.name ASC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([...$binds, $perPage, $offset]);

        Response::paginated($stmt->fetchAll(), $total, $page, $perPage);
    }

    public function store(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'companies.create');

        $body = $_POST;
        $validator = Validator::make($body, [
            'name' => 'required|string|maxlength:150',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        $db = Database::getInstance();
        $stmt = $db->prepare("SELECT id FROM companies WHERE name = ?");
        $stmt->execute([trim($body['name'])]);
        if ($stmt->fetch()) {
            Response::error('Company name already exists', 409);
        }

        $stmt = $db->prepare("
            INSERT INTO companies (name, name_ar, country, phone, email, address, website, is_active, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            trim($body['name']),
            trim($body['name_ar'] ?? ''),
            trim($body['country'] ?? ''),
            trim($body['phone'] ?? ''),
            trim($body['email'] ?? ''),
            trim($body['address'] ?? ''),
            trim($body['website'] ?? ''),
            isset($body['is_active']) ? (int)(bool)$body['is_active'] : 1,
            $user['id'],
        ]);

        $id      = (int)$db->lastInsertId();
        $company = $db->query("SELECT * FROM companies WHERE id = {$id}")->fetch();

        Logger::activity($user['id'], 'create', 'companies', $id, "Created company: {$body['name']}");
        Response::created($company, 'Company created successfully');
    }

    public function show(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'companies.view');

        $db   = Database::getInstance();
        $stmt = $db->prepare("SELECT * FROM companies WHERE id = ?");
        $stmt->execute([(int)$params['id']]);
        $company = $stmt->fetch();

        if (!$company) {
            Response::notFound('Company not found');
        }

        Response::success($company);
    }

    public function update(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'companies.edit');

        $id   = (int)$params['id'];
        $body = $_POST;
        $db   = Database::getInstance();

        $stmt = $db->prepare("SELECT * FROM companies WHERE id = ?");
        $stmt->execute([$id]);
        $company = $stmt->fetch();

        if (!$company) {
            Response::notFound('Company not found');
        }

        $validator = Validator::make($body, [
            'name' => 'required|string|maxlength:150',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        $stmt = $db->prepare("SELECT id FROM companies WHERE name = ? AND id != ?");
        $stmt->execute([trim($body['name']), $id]);
        if ($stmt->fetch()) {
            Response::error('Company name already exists', 409);
        }

        $db->prepare("
            UPDATE companies SET name=?, name_ar=?, country=?, phone=?, email=?, address=?, website=?, is_active=?
            WHERE id = ?
        ")->execute([
            trim($body['name']),
            trim($body['name_ar'] ?? $company['name_ar']),
            trim($body['country'] ?? $company['country']),
            trim($body['phone'] ?? $company['phone']),
            trim($body['email'] ?? $company['email']),
            trim($body['address'] ?? $company['address']),
            trim($body['website'] ?? $company['website']),
            isset($body['is_active']) ? (int)(bool)$body['is_active'] : $company['is_active'],
            $id,
        ]);

        $updated = $db->query("SELECT * FROM companies WHERE id = {$id}")->fetch();
        Logger::activity($user['id'], 'update', 'companies', $id, "Updated company: {$body['name']}");
        Response::success($updated, 'Company updated successfully');
    }

    public function destroy(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'companies.delete');

        $id = (int)$params['id'];
        $db = Database::getInstance();

        $stmt = $db->prepare("SELECT * FROM companies WHERE id = ?");
        $stmt->execute([$id]);
        $company = $stmt->fetch();

        if (!$company) {
            Response::notFound('Company not found');
        }

        $count = $db->prepare("SELECT COUNT(*) FROM medicines WHERE company_id = ?");
        $count->execute([$id]);
        if ((int)$count->fetchColumn() > 0) {
            Response::error('Cannot delete company that has medicines assigned to it', 409);
        }

        $db->prepare("DELETE FROM companies WHERE id = ?")->execute([$id]);
        Logger::activity($user['id'], 'delete', 'companies', $id, "Deleted company: {$company['name']}");
        Response::success(null, 'Company deleted successfully');
    }
}
