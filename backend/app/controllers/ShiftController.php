<?php

declare(strict_types=1);

class ShiftController
{
    public function index(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'shifts.view');

        $db      = Database::getInstance();
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(100, max(10, (int)($_GET['per_page'] ?? 20)));
        $status  = trim($_GET['status'] ?? '');
        $userId  = (int)($_GET['user_id'] ?? 0);
        $from    = trim($_GET['date_from'] ?? '');
        $to      = trim($_GET['date_to']   ?? '');

        $where = ['1=1'];
        $binds = [];

        if ($status !== '') {
            $where[] = 's.status = ?';
            $binds[] = $status;
        }

        if ($userId > 0) {
            $where[] = 's.user_id = ?';
            $binds[] = $userId;
        }

        if ($from !== '') {
            $where[] = 'DATE(s.opened_at) >= ?';
            $binds[] = $from;
        }

        if ($to !== '') {
            $where[] = 'DATE(s.opened_at) <= ?';
            $binds[] = $to;
        }

        $whereStr = implode(' AND ', $where);
        $total    = $db->prepare("SELECT COUNT(*) FROM shifts s WHERE {$whereStr}");
        $total->execute($binds);
        $total = (int)$total->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt   = $db->prepare("
            SELECT s.*, u.name AS user_name
            FROM shifts s
            LEFT JOIN users u ON u.id = s.user_id
            WHERE {$whereStr}
            ORDER BY s.opened_at DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([...$binds, $perPage, $offset]);

        Response::paginated($stmt->fetchAll(), $total, $page, $perPage);
    }

    public function current(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'shifts.view');

        $db   = Database::getInstance();
        $stmt = $db->prepare("
            SELECT s.*, u.name AS user_name
            FROM shifts s
            LEFT JOIN users u ON u.id = s.user_id
            WHERE s.user_id = ? AND s.status = 'open'
            ORDER BY s.id DESC LIMIT 1
        ");
        $stmt->execute([$user['id']]);
        $shift = $stmt->fetch();

        if ($shift) {
            $sales = $db->prepare("
                SELECT
                    COALESCE(SUM(CASE WHEN payment_method = 'cash'   THEN total ELSE 0 END), 0) AS cash_sales,
                    COALESCE(SUM(CASE WHEN payment_method != 'cash'  THEN total ELSE 0 END), 0) AS card_sales,
                    COUNT(*) AS sales_count
                FROM sales WHERE shift_id = ? AND status = 'completed'
            ");
            $sales->execute([(int)$shift['id']]);
            $s = $sales->fetch();
            $shift['live_cash_sales']  = (float)$s['cash_sales'];
            $shift['live_card_sales']  = (float)$s['card_sales'];
            $shift['live_sales_count'] = (int)$s['sales_count'];
        }

        Response::success($shift ?: null);
    }

    public function open(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'shifts.view');

        $body = $_POST;
        $db   = Database::getInstance();

        $existing = $db->prepare("SELECT id FROM shifts WHERE user_id = ? AND status = 'open'");
        $existing->execute([$user['id']]);
        if ($existing->fetch()) {
            Response::error('You already have an open shift', 409);
        }

        $stmt = $db->prepare("
            INSERT INTO shifts (user_id, opening_cash, opening_notes, status)
            VALUES (?, ?, ?, 'open')
        ");
        $stmt->execute([
            $user['id'],
            (float)($body['opening_cash'] ?? 0),
            trim($body['opening_notes'] ?? ''),
        ]);

        $id    = (int)$db->lastInsertId();
        $shift = $this->getById($db, $id);

        Logger::activity($user['id'], 'create', 'shifts', $id, "Opened shift #{$id}");
        Response::created($shift, 'Shift opened successfully');
    }

    public function close(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'shifts.view');

        $id   = (int)$params['id'];
        $body = $_POST;
        $db   = Database::getInstance();

        $shift = $this->getById($db, $id);
        if (!$shift) {
            Response::notFound('Shift not found');
        }

        if ($shift['status'] === 'closed') {
            Response::error('Shift is already closed', 409);
        }

        // Only the shift owner or a manager may close it
        if ((int)$shift['user_id'] !== (int)$user['id']) {
            AuthMiddleware::require($user, 'shifts.manage');
        }

        // Recompute sales totals from actual sales records
        $sales = $db->prepare("
            SELECT
                COALESCE(SUM(CASE WHEN payment_method = 'cash'   AND status = 'completed' THEN total ELSE 0 END), 0) AS cash_sales,
                COALESCE(SUM(CASE WHEN payment_method IN ('visa','card') AND status = 'completed' THEN total ELSE 0 END), 0) AS card_sales,
                COALESCE(SUM(CASE WHEN payment_method = 'wallet' AND status = 'completed' THEN total ELSE 0 END), 0) AS wallet_sales,
                COALESCE(SUM(CASE WHEN status = 'refunded' THEN total ELSE 0 END), 0) AS refunds_total
            FROM sales WHERE shift_id = ?
        ");
        $sales->execute([$id]);
        $s = $sales->fetch();

        $db->prepare("
            UPDATE shifts SET
                closing_cash  = ?,
                closing_notes = ?,
                cash_sales    = ?,
                card_sales    = ?,
                wallet_sales  = ?,
                refunds_total = ?,
                status        = 'closed',
                closed_at     = NOW()
            WHERE id = ?
        ")->execute([
            (float)($body['closing_cash'] ?? 0),
            trim($body['closing_notes'] ?? ''),
            (float)$s['cash_sales'],
            (float)$s['card_sales'],
            (float)$s['wallet_sales'],
            (float)$s['refunds_total'],
            $id,
        ]);

        $updated = $this->getById($db, $id);
        Logger::activity($user['id'], 'update', 'shifts', $id, "Closed shift #{$id}");
        Response::success($updated, 'Shift closed successfully');
    }

    public function show(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'shifts.view');

        $id    = (int)$params['id'];
        $db    = Database::getInstance();
        $shift = $this->getById($db, $id);

        if (!$shift) {
            Response::notFound('Shift not found');
        }

        $expenses = $db->prepare("
            SELECT e.*, ec.name AS category_name, ec.name_ar AS category_name_ar
            FROM expenses e
            JOIN expense_categories ec ON ec.id = e.category_id
            WHERE e.shift_id = ?
            ORDER BY e.created_at ASC
        ");
        $expenses->execute([$id]);
        $shift['expenses'] = $expenses->fetchAll();

        $sales = $db->prepare("
            SELECT id, invoice_number, total, payment_method, sale_date, status
            FROM sales WHERE shift_id = ? ORDER BY sale_date ASC
        ");
        $sales->execute([$id]);
        $shift['sales'] = $sales->fetchAll();

        Response::success($shift);
    }

    private function getById(PDO $db, int $id): ?array
    {
        $stmt = $db->prepare("
            SELECT s.*, u.name AS user_name
            FROM shifts s
            LEFT JOIN users u ON u.id = s.user_id
            WHERE s.id = ?
        ");
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }
}
