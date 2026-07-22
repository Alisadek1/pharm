<?php

declare(strict_types=1);

class SupplierPaymentController
{
    public function index(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'suppliers.view');

        $supplierId = (int)$params['supplier_id'];
        $db      = Database::getInstance();
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(50, max(10, (int)($_GET['per_page'] ?? 15)));

        $check = $db->prepare("SELECT id FROM suppliers WHERE id = ?");
        $check->execute([$supplierId]);
        if (!$check->fetch()) {
            Response::notFound('Supplier not found');
        }

        $countStmt = $db->prepare("SELECT COUNT(*) FROM supplier_payments WHERE supplier_id = ?");
        $countStmt->execute([$supplierId]);
        $total = (int)$countStmt->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt   = $db->prepare("
            SELECT sp.*, u.name as created_by_name
            FROM supplier_payments sp
            LEFT JOIN users u ON u.id = sp.user_id
            WHERE sp.supplier_id = ?
            ORDER BY sp.payment_date DESC, sp.id DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([$supplierId, $perPage, $offset]);

        Response::paginated($stmt->fetchAll(), $total, $page, $perPage);
    }

    public function store(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'suppliers.edit');

        $supplierId = (int)$params['supplier_id'];
        $body       = $_POST;
        $db         = Database::getInstance();

        $check = $db->prepare("SELECT * FROM suppliers WHERE id = ?");
        $check->execute([$supplierId]);
        if (!$check->fetch()) {
            Response::notFound('Supplier not found');
        }

        $validator = Validator::make($body, [
            'amount'       => 'required|numeric|min:0.001',
            'payment_date' => 'required|date',
        ]);
        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        $amount = round((float)$body['amount'], 3);

        Database::beginTransaction();
        try {
            $db->prepare("
                INSERT INTO supplier_payments (supplier_id, user_id, amount, payment_date, payment_method, notes)
                VALUES (?, ?, ?, ?, ?, ?)
            ")->execute([
                $supplierId,
                $user['id'],
                $amount,
                $body['payment_date'],
                trim($body['payment_method'] ?? 'cash'),
                trim($body['notes'] ?? ''),
            ]);

            $db->prepare("UPDATE suppliers SET balance = GREATEST(0, balance - ?) WHERE id = ?")
               ->execute([$amount, $supplierId]);

            Database::commit();
        } catch (\Exception $e) {
            Database::rollBack();
            Response::error('Payment failed: ' . $e->getMessage(), 500);
        }

        Logger::activity($user['id'], 'create', 'supplier_payments', $supplierId, "Payment {$amount} for supplier #{$supplierId}");
        Response::created(['amount' => $amount], 'Payment recorded successfully');
    }

    public function destroy(array $params): void
    {
        $user       = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'suppliers.edit');

        $supplierId = (int)$params['supplier_id'];
        $paymentId  = (int)$params['id'];
        $db         = Database::getInstance();

        $stmt = $db->prepare("SELECT * FROM supplier_payments WHERE id = ? AND supplier_id = ?");
        $stmt->execute([$paymentId, $supplierId]);
        $payment = $stmt->fetch();
        if (!$payment) {
            Response::notFound('Payment not found');
        }

        Database::beginTransaction();
        try {
            $db->prepare("DELETE FROM supplier_payments WHERE id = ?")->execute([$paymentId]);
            $db->prepare("UPDATE suppliers SET balance = balance + ? WHERE id = ?")
               ->execute([(float)$payment['amount'], $supplierId]);
            Database::commit();
        } catch (\Exception $e) {
            Database::rollBack();
            Response::error('Failed to delete payment', 500);
        }

        Response::success(null, 'Payment deleted');
    }
}
