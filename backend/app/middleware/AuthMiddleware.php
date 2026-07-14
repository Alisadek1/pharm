<?php

declare(strict_types=1);

class AuthMiddleware
{
    public static function handle(): array
    {
        $token = self::extractToken();

        if (!$token) {
            Response::unauthorized('Access token is required');
            exit;
        }

        $payload = JWT::decode($token);

        if (!$payload || ($payload['type'] ?? '') !== 'access') {
            Response::unauthorized('Invalid or expired access token');
            exit;
        }

        $db   = Database::getInstance();
        $stmt = $db->prepare("SELECT id, role_id, name, username, email, is_active FROM users WHERE id = ?");
        $stmt->execute([$payload['sub']]);
        $user = $stmt->fetch();

        if (!$user) {
            Response::unauthorized('User not found');
            exit;
        }

        if (!$user['is_active']) {
            Response::unauthorized('Account is deactivated');
            exit;
        }

        return $user;
    }

    public static function can(array $user, string $permission): bool
    {
        $db = Database::getInstance();

        // Check role permissions first
        $stmt = $db->prepare("
            SELECT 1 FROM role_permissions rp
            JOIN permissions p ON p.id = rp.permission_id
            WHERE rp.role_id = ? AND p.name = ?
            LIMIT 1
        ");
        $stmt->execute([$user['role_id'], $permission]);

        if ($stmt->fetchColumn()) {
            // Check if user permission is explicitly revoked
            $stmt2 = $db->prepare("
                SELECT granted FROM user_permissions up
                JOIN permissions p ON p.id = up.permission_id
                WHERE up.user_id = ? AND p.name = ?
                LIMIT 1
            ");
            $stmt2->execute([$user['id'], $permission]);
            $override = $stmt2->fetchColumn();

            if ($override === false) {
                return true;
            }

            return (bool) $override;
        }

        // Check user-level granted permissions
        $stmt3 = $db->prepare("
            SELECT granted FROM user_permissions up
            JOIN permissions p ON p.id = up.permission_id
            WHERE up.user_id = ? AND p.name = ? AND granted = 1
            LIMIT 1
        ");
        $stmt3->execute([$user['id'], $permission]);

        return (bool) $stmt3->fetchColumn();
    }

    public static function require(array $user, string $permission): void
    {
        if (!self::can($user, $permission)) {
            Response::forbidden("You don't have permission to perform this action");
            exit;
        }
    }

    private static function extractToken(): ?string
    {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';

        if (str_starts_with($authHeader, 'Bearer ')) {
            return substr($authHeader, 7);
        }

        return $_GET['token'] ?? null;
    }
}
