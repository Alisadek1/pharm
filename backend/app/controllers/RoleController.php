<?php

declare(strict_types=1);

class RoleController
{
    public function index(array $params): void
    {
        $user = AuthMiddleware::handle();

        $db   = Database::getInstance();
        $stmt = $db->query("
            SELECT r.*, COUNT(u.id) as user_count
            FROM roles r
            LEFT JOIN users u ON u.role_id = r.id AND u.is_active = 1
            GROUP BY r.id
            ORDER BY r.id ASC
        ");

        Response::success($stmt->fetchAll());
    }

    public function permissions(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'users.view');

        $roleId = (int)$params['id'];
        $db     = Database::getInstance();

        $allPerms = $db->query("SELECT * FROM permissions ORDER BY module, name")->fetchAll();

        $rolePerms = $db->prepare("
            SELECT p.name FROM permissions p
            JOIN role_permissions rp ON rp.permission_id = p.id
            WHERE rp.role_id = ?
        ");
        $rolePerms->execute([$roleId]);
        $grantedPerms = array_column($rolePerms->fetchAll(), 'name');

        $modules = [];
        foreach ($allPerms as $perm) {
            $modules[$perm['module']][] = [
                'id'      => $perm['id'],
                'name'    => $perm['name'],
                'display' => $perm['display_name'],
                'granted' => in_array($perm['name'], $grantedPerms, true),
            ];
        }

        Response::success(['permissions' => $modules, 'granted' => $grantedPerms]);
    }

    public function allPermissions(array $params): void
    {
        $user = AuthMiddleware::handle();

        $db   = Database::getInstance();
        $stmt = $db->query("SELECT * FROM permissions ORDER BY module, display_name");
        Response::success($stmt->fetchAll());
    }

    public function updatePermissions(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'settings.edit');

        $roleId = (int)$params['id'];
        $body   = $_POST;
        $db     = Database::getInstance();

        $permIds = is_string($body['permission_ids'] ?? '') ? json_decode($body['permission_ids'], true) : ($body['permission_ids'] ?? []);

        Database::beginTransaction();
        try {
            $db->prepare("DELETE FROM role_permissions WHERE role_id = ?")->execute([$roleId]);

            foreach ($permIds as $permId) {
                $db->prepare("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)")
                   ->execute([$roleId, (int)$permId]);
            }

            Database::commit();
        } catch (Exception $e) {
            Database::rollBack();
            Response::error('Failed to update role permissions', 500);
        }

        Logger::activity($user['id'], 'update_role_permissions', 'roles', $roleId, "Updated permissions for role #{$roleId}");
        Response::success(null, 'Role permissions updated successfully');
    }
}
