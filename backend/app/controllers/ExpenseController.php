<?php

declare(strict_types=1);

class ExpenseController
{
    // ── Expenses ──────────────────────────────────────────────

    public function index(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'expenses.view');

        $db      = Database::getInstance();
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(100, max(10, (int)($_GET['per_page'] ?? 20)));
        $search  = trim($_GET['search'] ?? '');
        $catId   = (int)($_GET['category_id'] ?? 0);
        $method  = trim($_GET['payment_method'] ?? '');
        $from    = trim($_GET['date_from'] ?? '');
        $to      = trim($_GET['date_to']   ?? '');

        $where = ['1=1'];
        $binds = [];

        if ($search !== '') {
            $where[] = '(e.notes LIKE ? OR ec.name LIKE ? OR ec.name_ar LIKE ?)';
            $binds[] = "%{$search}%";
            $binds[] = "%{$search}%";
            $binds[] = "%{$search}%";
        }

        if ($catId > 0) {
            $where[] = 'e.category_id = ?';
            $binds[] = $catId;
        }

        if ($method !== '') {
            $where[] = 'e.payment_method = ?';
            $binds[] = $method;
        }

        if ($from !== '') {
            $where[] = 'e.expense_date >= ?';
            $binds[] = $from;
        }

        if ($to !== '') {
            $where[] = 'e.expense_date <= ?';
            $binds[] = $to;
        }

        $whereStr = implode(' AND ', $where);
        $total    = $db->prepare("SELECT COUNT(*) FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id WHERE {$whereStr}");
        $total->execute($binds);
        $total = (int)$total->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt   = $db->prepare("
            SELECT e.*, ec.name AS category_name, ec.name_ar AS category_name_ar,
                   u.name AS created_by_name
            FROM expenses e
            JOIN expense_categories ec ON ec.id = e.category_id
            LEFT JOIN users u ON u.id = e.user_id
            WHERE {$whereStr}
            ORDER BY e.expense_date DESC, e.id DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([...$binds, $perPage, $offset]);

        Response::paginated($stmt->fetchAll(), $total, $page, $perPage);
    }

    public function store(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'expenses.create');

        $body = $_POST;

        $validator = Validator::make($body, [
            'category_id'    => 'required|integer',
            'amount'         => 'required|numeric|min:0.001',
            'expense_date'   => 'required|date',
            'payment_method' => 'required',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        $db = Database::getInstance();

        $cat = $db->prepare("SELECT id FROM expense_categories WHERE id = ?");
        $cat->execute([(int)$body['category_id']]);
        if (!$cat->fetch()) {
            Response::error('Invalid expense category');
        }

        // Link to user's open shift if one exists
        $shiftRow = $db->prepare("SELECT id FROM shifts WHERE user_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1");
        $shiftRow->execute([$user['id']]);
        $shift   = $shiftRow->fetch();
        $shiftId = $shift ? (int)$shift['id'] : null;

        $stmt = $db->prepare("
            INSERT INTO expenses (category_id, amount, expense_date, payment_method, notes, user_id, shift_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            (int)$body['category_id'],
            (float)$body['amount'],
            $body['expense_date'],
            $body['payment_method'],
            trim($body['notes'] ?? ''),
            $user['id'],
            $shiftId,
        ]);

        $id = (int)$db->lastInsertId();

        if ($shiftId) {
            $db->prepare("UPDATE shifts SET expenses_total = expenses_total + ? WHERE id = ?")
               ->execute([(float)$body['amount'], $shiftId]);
        }

        $expense = $this->getById($db, $id);
        Logger::activity($user['id'], 'create', 'expenses', $id, 'Added expense: ' . number_format((float)$body['amount'], 3));
        Response::created($expense, 'Expense added successfully');
    }

    public function show(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'expenses.view');

        $db      = Database::getInstance();
        $expense = $this->getById($db, (int)$params['id']);

        if (!$expense) {
            Response::notFound('Expense not found');
        }

        Response::success($expense);
    }

    public function update(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'expenses.edit');

        $id   = (int)$params['id'];
        $body = $_POST;
        $db   = Database::getInstance();

        $expense = $this->getById($db, $id);
        if (!$expense) {
            Response::notFound('Expense not found');
        }

        $validator = Validator::make($body, [
            'category_id'    => 'required|integer',
            'amount'         => 'required|numeric|min:0.001',
            'expense_date'   => 'required|date',
            'payment_method' => 'required',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        $oldAmount = (float)$expense['amount'];
        $newAmount = (float)$body['amount'];

        $db->prepare("
            UPDATE expenses SET category_id=?, amount=?, expense_date=?, payment_method=?, notes=?
            WHERE id = ?
        ")->execute([
            (int)$body['category_id'],
            $newAmount,
            $body['expense_date'],
            $body['payment_method'],
            trim($body['notes'] ?? $expense['notes']),
            $id,
        ]);

        if ($expense['shift_id'] && abs($newAmount - $oldAmount) > 0.0001) {
            $diff = $newAmount - $oldAmount;
            $db->prepare("UPDATE shifts SET expenses_total = GREATEST(0, expenses_total + ?) WHERE id = ?")
               ->execute([$diff, (int)$expense['shift_id']]);
        }

        $updated = $this->getById($db, $id);
        Logger::activity($user['id'], 'update', 'expenses', $id, "Updated expense #{$id}");
        Response::success($updated, 'Expense updated successfully');
    }

    public function destroy(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'expenses.delete');

        $id = (int)$params['id'];
        $db = Database::getInstance();

        $expense = $this->getById($db, $id);
        if (!$expense) {
            Response::notFound('Expense not found');
        }

        $db->prepare("DELETE FROM expenses WHERE id = ?")->execute([$id]);

        if ($expense['shift_id']) {
            $db->prepare("UPDATE shifts SET expenses_total = GREATEST(0, expenses_total - ?) WHERE id = ?")
               ->execute([(float)$expense['amount'], (int)$expense['shift_id']]);
        }

        Logger::activity($user['id'], 'delete', 'expenses', $id, "Deleted expense #{$id}");
        Response::success(null, 'Expense deleted successfully');
    }

    public function summary(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'expenses.view');

        $db   = Database::getInstance();
        $from = trim($_GET['date_from'] ?? date('Y-m-01'));
        $to   = trim($_GET['date_to']   ?? date('Y-m-d'));

        $total = $db->prepare("SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE expense_date BETWEEN ? AND ?");
        $total->execute([$from, $to]);

        $byCategory = $db->prepare("
            SELECT ec.name, ec.name_ar, COUNT(e.id) AS count, COALESCE(SUM(e.amount), 0) AS total
            FROM expenses e
            JOIN expense_categories ec ON ec.id = e.category_id
            WHERE e.expense_date BETWEEN ? AND ?
            GROUP BY ec.id, ec.name, ec.name_ar
            ORDER BY total DESC
        ");
        $byCategory->execute([$from, $to]);

        Response::success([
            'total'       => round((float)$total->fetchColumn(), 3),
            'date_from'   => $from,
            'date_to'     => $to,
            'by_category' => $byCategory->fetchAll(),
        ]);
    }

    // ── Expense Categories ────────────────────────────────────

    public function categories(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'expenses.view');

        $db   = Database::getInstance();
        $rows = $db->query("SELECT * FROM expense_categories ORDER BY name ASC")->fetchAll();
        Response::success($rows);
    }

    public function storeCategory(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'expenses.edit');

        $body      = $_POST;
        $validator = Validator::make($body, [
            'name' => 'required|string|maxlength:100',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        $db   = Database::getInstance();
        $stmt = $db->prepare("INSERT INTO expense_categories (name, name_ar) VALUES (?, ?)");
        $stmt->execute([trim($body['name']), trim($body['name_ar'] ?? '')]);

        $id  = (int)$db->lastInsertId();
        $cat = $db->query("SELECT * FROM expense_categories WHERE id = {$id}")->fetch();
        Response::created($cat, 'Category created');
    }

    public function deleteCategory(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'expenses.edit');

        $id = (int)$params['id'];
        $db = Database::getInstance();

        $inUse = $db->prepare("SELECT COUNT(*) FROM expenses WHERE category_id = ?");
        $inUse->execute([$id]);
        if ((int)$inUse->fetchColumn() > 0) {
            Response::error('Cannot delete: category has linked expenses', 409);
        }

        $db->prepare("DELETE FROM expense_categories WHERE id = ?")->execute([$id]);
        Response::success(null, 'Category deleted');
    }

    public function updateCategory(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'expenses.edit');

        $id        = (int)$params['id'];
        $body      = $_POST;
        $validator = Validator::make($body, [
            'name' => 'required|string|maxlength:100',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        $db = Database::getInstance();
        $db->prepare("UPDATE expense_categories SET name=?, name_ar=? WHERE id=?")
           ->execute([
               trim($body['name']),
               trim($body['name_ar'] ?? ''),
               $id,
           ]);

        $cat = $db->query("SELECT * FROM expense_categories WHERE id = {$id}")->fetch();
        Response::success($cat, 'Category updated');
    }

    // ── Private helpers ───────────────────────────────────────

    private function getById(PDO $db, int $id): ?array
    {
        $stmt = $db->prepare("
            SELECT e.*, ec.name AS category_name, ec.name_ar AS category_name_ar,
                   u.name AS created_by_name
            FROM expenses e
            JOIN expense_categories ec ON ec.id = e.category_id
            LEFT JOIN users u ON u.id = e.user_id
            WHERE e.id = ?
        ");
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }
}
