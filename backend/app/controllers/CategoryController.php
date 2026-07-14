<?php

declare(strict_types=1);

class CategoryController
{
    public function index(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'categories.view');

        $db      = Database::getInstance();
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(100, max(10, (int)($_GET['per_page'] ?? 20)));
        $search  = trim($_GET['search'] ?? '');
        $active  = $_GET['is_active'] ?? null;

        $where  = ['1=1'];
        $binds  = [];

        if ($search !== '') {
            $where[] = '(c.name LIKE ? OR c.name_ar LIKE ?)';
            $binds[] = "%{$search}%";
            $binds[] = "%{$search}%";
        }

        if ($active !== null) {
            $where[] = 'c.is_active = ?';
            $binds[] = (int)$active;
        }

        $whereStr = implode(' AND ', $where);

        $total = $db->prepare("SELECT COUNT(*) FROM categories c WHERE {$whereStr}");
        $total->execute($binds);
        $total = (int)$total->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt   = $db->prepare("
            SELECT c.*, u.name as created_by_name,
                   (SELECT COUNT(*) FROM medicines m WHERE m.category_id = c.id AND m.is_active = 1) as medicine_count
            FROM categories c
            LEFT JOIN users u ON u.id = c.created_by
            WHERE {$whereStr}
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([...$binds, $perPage, $offset]);
        $categories = $stmt->fetchAll();

        Response::paginated($categories, $total, $page, $perPage);
    }

    public function store(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'categories.create');

        $body = $_POST;

        $validator = Validator::make($body, [
            'name' => 'required|string|maxlength:100',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        $db   = Database::getInstance();
        $stmt = $db->prepare("SELECT id FROM categories WHERE name = ?");
        $stmt->execute([trim($body['name'])]);
        if ($stmt->fetch()) {
            Response::error('Category name already exists', 409);
        }

        $stmt = $db->prepare("
            INSERT INTO categories (name, name_ar, description, is_active, created_by)
            VALUES (?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            trim($body['name']),
            trim($body['name_ar'] ?? ''),
            trim($body['description'] ?? ''),
            isset($body['is_active']) ? (int)(bool)$body['is_active'] : 1,
            $user['id'],
        ]);

        $id       = (int)$db->lastInsertId();
        $category = $db->prepare("SELECT * FROM categories WHERE id = ?")->execute([$id]);
        $category = $db->query("SELECT * FROM categories WHERE id = {$id}")->fetch();

        Logger::activity($user['id'], 'create', 'categories', $id, "Created category: {$body['name']}");
        Response::created($category, 'Category created successfully');
    }

    public function show(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'categories.view');

        $db   = Database::getInstance();
        $stmt = $db->prepare("SELECT * FROM categories WHERE id = ?");
        $stmt->execute([(int)$params['id']]);
        $category = $stmt->fetch();

        if (!$category) {
            Response::notFound('Category not found');
        }

        Response::success($category);
    }

    public function update(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'categories.edit');

        $body = $_POST;
        $id   = (int)$params['id'];
        $db   = Database::getInstance();

        $stmt = $db->prepare("SELECT * FROM categories WHERE id = ?");
        $stmt->execute([$id]);
        $category = $stmt->fetch();

        if (!$category) {
            Response::notFound('Category not found');
        }

        $validator = Validator::make($body, [
            'name' => 'required|string|maxlength:100',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        // Check duplicate name (exclude current)
        $stmt = $db->prepare("SELECT id FROM categories WHERE name = ? AND id != ?");
        $stmt->execute([trim($body['name']), $id]);
        if ($stmt->fetch()) {
            Response::error('Category name already exists', 409);
        }

        $db->prepare("
            UPDATE categories SET name = ?, name_ar = ?, description = ?, is_active = ?
            WHERE id = ?
        ")->execute([
            trim($body['name']),
            trim($body['name_ar'] ?? $category['name_ar']),
            trim($body['description'] ?? $category['description']),
            isset($body['is_active']) ? (int)(bool)$body['is_active'] : $category['is_active'],
            $id,
        ]);

        $updated = $db->query("SELECT * FROM categories WHERE id = {$id}")->fetch();
        Logger::activity($user['id'], 'update', 'categories', $id, "Updated category: {$body['name']}");
        Response::success($updated, 'Category updated successfully');
    }

    public function destroy(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'categories.delete');

        $id = (int)$params['id'];
        $db = Database::getInstance();

        $stmt = $db->prepare("SELECT * FROM categories WHERE id = ?");
        $stmt->execute([$id]);
        $category = $stmt->fetch();

        if (!$category) {
            Response::notFound('Category not found');
        }

        // Check if category has medicines
        $count = $db->prepare("SELECT COUNT(*) FROM medicines WHERE category_id = ?");
        $count->execute([$id]);
        if ((int)$count->fetchColumn() > 0) {
            Response::error('Cannot delete category that has medicines assigned to it', 409);
        }

        $db->prepare("DELETE FROM categories WHERE id = ?")->execute([$id]);
        Logger::activity($user['id'], 'delete', 'categories', $id, "Deleted category: {$category['name']}");
        Response::success(null, 'Category deleted successfully');
    }
}
