<?php

declare(strict_types=1);

class NotificationController
{
    public function index(array $params): void
    {
        $user = AuthMiddleware::handle();

        $db      = Database::getInstance();
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(50, max(10, (int)($_GET['per_page'] ?? 20)));
        $unread  = $_GET['unread'] ?? null;

        $where = ['1=1'];
        $binds = [];

        if ($unread !== null) {
            // unread=1 means we want only unread (is_read=0)
            $where[] = 'is_read = ?';
            $binds[] = $unread === '1' ? 0 : 1;
        }

        $typeFilter = trim($_GET['type'] ?? '');
        if ($typeFilter !== '') {
            $where[] = 'type = ?';
            $binds[] = $typeFilter;
        }

        $whereStr = implode(' AND ', $where);
        $total    = $db->prepare("SELECT COUNT(*) FROM notifications WHERE {$whereStr}");
        $total->execute($binds);
        $total = (int)$total->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt   = $db->prepare("
            SELECT * FROM notifications WHERE {$whereStr}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([...$binds, $perPage, $offset]);

        Response::paginated($stmt->fetchAll(), $total, $page, $perPage);
    }

    public function markRead(array $params): void
    {
        $user = AuthMiddleware::handle();

        $id = (int)$params['id'];
        $db = Database::getInstance();

        $db->prepare("UPDATE notifications SET is_read = 1, read_by = ? WHERE id = ?")
           ->execute([$user['id'], $id]);

        Response::success(null, 'Notification marked as read');
    }

    public function markAllRead(array $params): void
    {
        $user = AuthMiddleware::handle();

        $db = Database::getInstance();
        $db->prepare("UPDATE notifications SET is_read = 1, read_by = ? WHERE is_read = 0")
           ->execute([$user['id']]);

        Response::success(null, 'All notifications marked as read');
    }

    public function destroy(array $params): void
    {
        $user = AuthMiddleware::handle();

        $id = (int)$params['id'];
        $db = Database::getInstance();

        $db->prepare("DELETE FROM notifications WHERE id = ?")->execute([$id]);

        Response::success(null, 'Notification deleted');
    }
}
