<?php

declare(strict_types=1);

class UserController
{
    public function index(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'users.view');

        $db      = Database::getInstance();
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(100, max(10, (int)($_GET['per_page'] ?? 20)));
        $search  = trim($_GET['search'] ?? '');
        $roleId  = (int)($_GET['role_id'] ?? 0);

        $where = ['1=1'];
        $binds = [];

        if ($search !== '') {
            $where[] = '(u.name LIKE ? OR u.username LIKE ? OR u.email LIKE ?)';
            $binds   = array_merge($binds, ["%{$search}%", "%{$search}%", "%{$search}%"]);
        }

        if ($roleId > 0) {
            $where[] = 'u.role_id = ?';
            $binds[] = $roleId;
        }

        $whereStr = implode(' AND ', $where);
        $total    = $db->prepare("SELECT COUNT(*) FROM users u WHERE {$whereStr}");
        $total->execute($binds);
        $total = (int)$total->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt   = $db->prepare("
            SELECT u.id, u.name, u.email, u.phone, u.role_id, u.is_active,
                   u.last_login as last_login_at, u.created_at,
                   r.id as role_id, r.name as role_name, r.display_name as role_display_name
            FROM users u
            JOIN roles r ON r.id = u.role_id
            WHERE {$whereStr}
            ORDER BY u.name ASC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([...$binds, $perPage, $offset]);

        Response::paginated($stmt->fetchAll(), $total, $page, $perPage);
    }

    public function store(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'users.create');

        $body = $_POST;

        // Auto-generate username from email if not provided
        if (empty($body['username']) && !empty($body['email'])) {
            $base = strtolower(preg_replace('/[^a-zA-Z0-9_]/', '', explode('@', $body['email'])[0]));
            $body['username'] = $base ?: 'user';
        }

        $validator = Validator::make($body, [
            'name'     => 'required|string|maxlength:100',
            'username' => 'required|string|minlength:3|maxlength:50',
            'email'    => 'required|email',
            'password' => 'required|string|minlength:8',
            'role_id'  => 'required|integer|min:1',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        $db = Database::getInstance();

        $baseUsername = trim($body['username']);
        $username = $baseUsername;
        $suffix = 1;
        while (true) {
            $stmt = $db->prepare("SELECT id FROM users WHERE username = ?");
            $stmt->execute([$username]);
            if (!$stmt->fetch()) break;
            $username = $baseUsername . $suffix++;
        }
        $body['username'] = $username;

        $stmt = $db->prepare("SELECT id FROM users WHERE email = ?");
        $stmt->execute([trim($body['email'])]);
        if ($stmt->fetch()) {
            Response::error('Email already exists', 409);
        }

        $stmt = $db->prepare("SELECT id FROM roles WHERE id = ?");
        $stmt->execute([(int)$body['role_id']]);
        if (!$stmt->fetch()) {
            Response::error('Invalid role', 400);
        }

        $hashed = password_hash($body['password'], PASSWORD_BCRYPT, ['cost' => 12]);

        $db->prepare("
            INSERT INTO users (role_id, name, username, email, password, phone, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ")->execute([
            (int)$body['role_id'],
            trim($body['name']),
            trim($body['username']),
            trim($body['email']),
            $hashed,
            trim($body['phone'] ?? ''),
            1,
        ]);

        $id       = (int)$db->lastInsertId();
        $newUser  = $this->getUserById($db, $id);

        Logger::activity($user['id'], 'create', 'users', $id, "Created user: {$body['username']}");
        Response::created($newUser, 'User created successfully');
    }

    public function me(array $params): void
    {
        $user = AuthMiddleware::handle();

        $db      = Database::getInstance();
        $full    = $this->getUserById($db, $user['id']);
        $perms   = $this->getUserPermissions($db, $user['id'], $user['role_id']);

        $full['permissions'] = $perms;

        Response::success($full);
    }

    public function show(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'users.view');

        $id      = (int)$params['id'];
        $db      = Database::getInstance();
        $found   = $this->getUserById($db, $id);

        if (!$found) {
            Response::notFound('User not found');
        }

        Response::success($found);
    }

    public function update(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'users.edit');

        $id   = (int)$params['id'];
        $body = $_POST;
        $db   = Database::getInstance();

        $existing = $this->getUserById($db, $id);
        if (!$existing) {
            Response::notFound('User not found');
        }

        $validator = Validator::make($body, [
            'name'    => 'required|string|maxlength:100',
            'email'   => 'required|email',
            'role_id' => 'required|integer|min:1',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        if ($body['email'] !== $existing['email']) {
            $dup = $db->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
            $dup->execute([trim($body['email']), $id]);
            if ($dup->fetch()) {
                Response::error('Email already exists', 409);
            }
        }

        $db->prepare("
            UPDATE users SET name=?, email=?, role_id=?, phone=?, is_active=? WHERE id = ?
        ")->execute([
            trim($body['name']),
            trim($body['email']),
            (int)$body['role_id'],
            trim($body['phone'] ?? $existing['phone']),
            isset($body['is_active']) ? (int)(bool)$body['is_active'] : $existing['is_active'],
            $id,
        ]);

        if (!empty($body['password'])) {
            if (strlen($body['password']) < 8) {
                Response::error('Password must be at least 8 characters', 400);
            }
            $hashed = password_hash($body['password'], PASSWORD_BCRYPT, ['cost' => 12]);
            $db->prepare("UPDATE users SET password = ?, refresh_token = NULL WHERE id = ?")->execute([$hashed, $id]);
        }

        $updated = $this->getUserById($db, $id);
        Logger::activity($user['id'], 'update', 'users', $id, "Updated user: {$body['name']}");
        Response::success($updated, 'User updated successfully');
    }

    public function destroy(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'users.delete');

        $id = (int)$params['id'];

        if ($id === $user['id']) {
            Response::error('Cannot delete your own account', 409);
        }

        $db = Database::getInstance();
        $found = $this->getUserById($db, $id);
        if (!$found) {
            Response::notFound('User not found');
        }

        $db->prepare("UPDATE users SET is_active = 0 WHERE id = ?")->execute([$id]);
        Logger::activity($user['id'], 'delete', 'users', $id, "Deactivated user: {$found['username']}");
        Response::success(null, 'User deactivated successfully');
    }

    public function activity(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'users.view');

        $id      = (int)$params['id'];
        $db      = Database::getInstance();
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(50, max(10, (int)($_GET['per_page'] ?? 20)));

        $total  = $db->prepare("SELECT COUNT(*) FROM activity_logs WHERE user_id = ?");
        $total->execute([$id]);
        $total  = (int)$total->fetchColumn();
        $offset = ($page - 1) * $perPage;

        $stmt = $db->prepare("
            SELECT * FROM activity_logs WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([$id, $perPage, $offset]);

        Response::paginated($stmt->fetchAll(), $total, $page, $perPage);
    }

    public function updateProfile(array $params): void
    {
        $user = AuthMiddleware::handle();

        $body = $_POST;
        $db   = Database::getInstance();

        $db->prepare("UPDATE users SET name=?, phone=? WHERE id = ?")->execute([
            trim($body['name'] ?? $user['name']),
            trim($body['phone'] ?? ''),
            $user['id'],
        ]);

        $updated = $this->getUserById($db, $user['id']);
        Response::success($updated, 'Profile updated successfully');
    }

    public function changePassword(array $params): void
    {
        $user = AuthMiddleware::handle();

        $body = $_POST;

        $validator = Validator::make($body, [
            'current_password' => 'required|string',
            'new_password'     => 'required|string|minlength:8',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        $db   = Database::getInstance();
        $stmt = $db->prepare("SELECT password FROM users WHERE id = ?");
        $stmt->execute([$user['id']]);
        $current = $stmt->fetchColumn();

        if (!password_verify($body['current_password'], $current)) {
            Response::error('Current password is incorrect', 400);
        }

        $hashed = password_hash($body['new_password'], PASSWORD_BCRYPT, ['cost' => 12]);
        $db->prepare("UPDATE users SET password = ?, refresh_token = NULL WHERE id = ?")->execute([$hashed, $user['id']]);

        Logger::activity($user['id'], 'password_change', 'users', $user['id'], 'Password changed');
        Response::success(null, 'Password changed successfully');
    }

    public function getPermissions(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'users.view');

        $id  = (int)$params['id'];
        $db  = Database::getInstance();
        $found = $this->getUserById($db, $id);
        if (!$found) Response::notFound('User not found');

        $stmt = $db->prepare("SELECT * FROM user_permissions WHERE user_id = ?");
        $stmt->execute([$id]);
        Response::success($stmt->fetchAll());
    }

    public function toggleActive(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'users.edit');

        $id = (int)$params['id'];
        if ($id === $user['id']) Response::error('Cannot deactivate your own account', 409);

        $db    = Database::getInstance();
        $found = $this->getUserById($db, $id);
        if (!$found) Response::notFound('User not found');

        $newStatus = $found['is_active'] ? 0 : 1;
        $db->prepare("UPDATE users SET is_active = ? WHERE id = ?")->execute([$newStatus, $id]);

        Logger::activity($user['id'], $newStatus ? 'activate' : 'deactivate', 'users', $id, "Toggled user #{$id} to " . ($newStatus ? 'active' : 'inactive'));
        Response::success(['is_active' => $newStatus], $newStatus ? 'User activated' : 'User deactivated');
    }

    public function updatePermissions(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'users.edit');

        $id   = (int)$params['id'];
        $body = $_POST;
        $db   = Database::getInstance();

        $found = $this->getUserById($db, $id);
        if (!$found) {
            Response::notFound('User not found');
        }

        // Accept both formats:
        // New: { permissions: [{permission_id: int, granted: 0|1}] }
        // Legacy: { granted: [ids], revoked: [ids] }
        $permissions = $body['permissions'] ?? null;
        if (is_string($permissions)) $permissions = json_decode($permissions, true);

        Database::beginTransaction();
        try {
            $db->prepare("DELETE FROM user_permissions WHERE user_id = ?")->execute([$id]);

            if (is_array($permissions)) {
                foreach ($permissions as $perm) {
                    $permId  = (int)($perm['permission_id'] ?? 0);
                    $granted = isset($perm['granted']) ? (int)(bool)$perm['granted'] : 1;
                    if ($permId > 0) {
                        $db->prepare("INSERT INTO user_permissions (user_id, permission_id, granted) VALUES (?, ?, ?)")
                           ->execute([$id, $permId, $granted]);
                    }
                }
            } else {
                // Legacy format
                $granted = is_string($body['granted'] ?? '') ? json_decode($body['granted'], true) ?? [] : ($body['granted'] ?? []);
                $revoked = is_string($body['revoked'] ?? '') ? json_decode($body['revoked'], true) ?? [] : ($body['revoked'] ?? []);
                foreach ($granted as $permId) {
                    $db->prepare("INSERT INTO user_permissions (user_id, permission_id, granted) VALUES (?, ?, 1)")->execute([$id, (int)$permId]);
                }
                foreach ($revoked as $permId) {
                    $db->prepare("INSERT INTO user_permissions (user_id, permission_id, granted) VALUES (?, ?, 0)")->execute([$id, (int)$permId]);
                }
            }

            Database::commit();
        } catch (Exception $e) {
            Database::rollBack();
            Response::error('Failed to update permissions: ' . $e->getMessage(), 500);
        }

        Logger::activity($user['id'], 'update_permissions', 'users', $id, "Updated permissions for user #{$id}");
        Response::success(null, 'Permissions updated successfully');
    }

    private function getUserById(PDO $db, int $id): ?array
    {
        $stmt = $db->prepare("
            SELECT u.id, u.name, u.username, u.email, u.phone, u.role_id, u.is_active,
                   u.last_login as last_login_at, u.created_at, u.avatar,
                   r.name as role_name, r.display_name as role_display_name
            FROM users u
            JOIN roles r ON r.id = u.role_id
            WHERE u.id = ?
        ");
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    private function getUserPermissions(PDO $db, int $userId, int $roleId): array
    {
        $stmt = $db->prepare("
            SELECT DISTINCT p.name FROM permissions p
            JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role_id = ?
            WHERE NOT EXISTS (
                SELECT 1 FROM user_permissions up
                WHERE up.user_id = ? AND up.permission_id = p.id AND up.granted = 0
            )
            UNION
            SELECT p.name FROM permissions p
            JOIN user_permissions up ON up.permission_id = p.id AND up.user_id = ? AND up.granted = 1
        ");
        $stmt->execute([$roleId, $userId, $userId]);
        return array_column($stmt->fetchAll(), 'name');
    }
}
