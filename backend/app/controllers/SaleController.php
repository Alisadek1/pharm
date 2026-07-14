<?php

declare(strict_types=1);

class SaleController
{
    public function index(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'sales.view');

        $db         = Database::getInstance();
        $page       = max(1, (int)($_GET['page'] ?? 1));
        $perPage    = min(100, max(10, (int)($_GET['per_page'] ?? 20)));
        $customerId = (int)($_GET['customer_id'] ?? 0);
        $status     = trim($_GET['status'] ?? '');
        $dateFrom   = trim($_GET['date_from'] ?? '');
        $dateTo     = trim($_GET['date_to'] ?? '');
        $search     = trim($_GET['search'] ?? '');
        $payMethod  = trim($_GET['payment_method'] ?? '');

        $where = ['1=1'];
        $binds = [];

        if ($customerId > 0) {
            $where[] = 's.customer_id = ?';
            $binds[] = $customerId;
        }

        if ($status !== '') {
            $where[] = 's.status = ?';
            $binds[] = $status;
        }

        if ($payMethod !== '') {
            $where[] = 's.payment_method = ?';
            $binds[] = $payMethod;
        }

        if ($dateFrom !== '') {
            $where[] = 'DATE(s.sale_date) >= ?';
            $binds[] = $dateFrom;
        }

        if ($dateTo !== '') {
            $where[] = 'DATE(s.sale_date) <= ?';
            $binds[] = $dateTo;
        }

        if ($search !== '') {
            $where[] = '(s.invoice_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)';
            $binds[] = "%{$search}%";
            $binds[] = "%{$search}%";
            $binds[] = "%{$search}%";
        }

        $whereStr = implode(' AND ', $where);
        $total    = $db->prepare("
            SELECT COUNT(*) FROM sales s
            LEFT JOIN customers c ON c.id = s.customer_id
            WHERE {$whereStr}
        ");
        $total->execute($binds);
        $total = (int)$total->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt   = $db->prepare("
            SELECT s.*, c.name as customer_name, c.phone as customer_phone, u.name as cashier_name
            FROM sales s
            LEFT JOIN customers c ON c.id = s.customer_id
            LEFT JOIN users u ON u.id = s.user_id
            WHERE {$whereStr}
            ORDER BY s.sale_date DESC, s.id DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([...$binds, $perPage, $offset]);

        Response::paginated($stmt->fetchAll(), $total, $page, $perPage);
    }

    public function show(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'sales.view');

        $id   = (int)$params['id'];
        $db   = Database::getInstance();
        $sale = $this->getById($db, $id);

        if (!$sale) {
            Response::notFound('Sale not found');
        }

        Response::success($sale);
    }

    public function destroy(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'sales.delete');

        $id = (int)$params['id'];
        $db = Database::getInstance();

        $stmt = $db->prepare("SELECT * FROM sales WHERE id = ?");
        $stmt->execute([$id]);
        $sale = $stmt->fetch();

        if (!$sale) {
            Response::notFound('Sale not found');
        }

        if ($sale['status'] === 'completed') {
            Response::error('Cannot delete a completed sale. Process a refund instead.', 409);
        }

        $db->prepare("DELETE FROM sales WHERE id = ?")->execute([$id]);
        Logger::activity($user['id'], 'delete', 'sales', $id, "Deleted sale #{$id}");
        Response::success(null, 'Sale deleted');
    }

    public function print(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'sales.view');

        $id   = (int)$params['id'];
        $db   = Database::getInstance();
        $sale = $this->getById($db, $id);

        if (!$sale) {
            Response::notFound('Sale not found');
        }

        $settings = $db->query("SELECT `key`, `value` FROM settings")->fetchAll(PDO::FETCH_KEY_PAIR);
        $sale['settings'] = $settings;

        Response::success($sale);
    }

    public function refund(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'pos.refund');

        $id   = (int)$params['id'];
        $body = $_POST;
        $db   = Database::getInstance();

        $sale = $this->getById($db, $id);
        if (!$sale) {
            Response::notFound('Sale not found');
        }

        if (!in_array($sale['status'], ['completed', 'partial_refund'], true)) {
            Response::error('This sale cannot be refunded', 409);
        }

        $items = is_string($body['items'] ?? '') ? json_decode($body['items'], true) : ($body['items'] ?? []);
        if (empty($items)) {
            Response::error('Refund items are required');
        }

        $totalRefund = 0;
        Database::beginTransaction();
        try {
            $returnNum = 'RTN-' . date('Ymd') . '-' . str_pad((string)($db->query("SELECT COUNT(*) + 1 FROM returns")->fetchColumn()), 4, '0', STR_PAD_LEFT);

            $returnStmt = $db->prepare("
                INSERT INTO returns (return_number, type, reference_id, user_id, customer_id, reason, status)
                VALUES (?, 'sale', ?, ?, ?, ?, 'completed')
            ");
            $returnStmt->execute([
                $returnNum, $id, $user['id'],
                $sale['customer_id'] ?? null,
                trim($body['reason'] ?? 'Customer return'),
            ]);
            $returnId = (int)$db->lastInsertId();

            foreach ($items as $item) {
                $saleItemId = (int)($item['sale_item_id'] ?? 0);
                $qty        = (int)($item['quantity'] ?? 0);

                if ($saleItemId <= 0 || $qty <= 0) continue;

                $saleItem = $db->prepare("SELECT * FROM sale_items WHERE id = ? AND sale_id = ?");
                $saleItem->execute([$saleItemId, $id]);
                $saleItem = $saleItem->fetch();

                if (!$saleItem) continue;

                $maxRefundable = (int)$saleItem['quantity'] - (int)$saleItem['returned_quantity'];
                $qty           = min($qty, $maxRefundable);

                if ($qty <= 0) continue;

                $refundAmt = round($qty * (float)$saleItem['unit_price'], 3);
                $totalRefund += $refundAmt;

                // Return stock to batch
                if ($saleItem['batch_id']) {
                    $db->prepare("UPDATE medicine_batches SET quantity = quantity + ? WHERE id = ?")
                       ->execute([$qty, $saleItem['batch_id']]);
                }

                $db->prepare("UPDATE sale_items SET returned_quantity = returned_quantity + ? WHERE id = ?")
                   ->execute([$qty, $saleItemId]);

                $db->prepare("
                    INSERT INTO return_items (return_id, medicine_id, batch_id, quantity, unit_price, subtotal)
                    VALUES (?, ?, ?, ?, ?, ?)
                ")->execute([$returnId, $saleItem['medicine_id'], $saleItem['batch_id'], $qty, $saleItem['unit_price'], $refundAmt]);
            }

            // Update return total
            $db->prepare("UPDATE returns SET total_amount = ? WHERE id = ?")->execute([round($totalRefund, 3), $returnId]);

            // Check if fully refunded
            $allItems = $db->prepare("SELECT SUM(quantity), SUM(returned_quantity) FROM sale_items WHERE sale_id = ?");
            $allItems->execute([$id]);
            [$totalQty, $totalReturned] = array_values($allItems->fetch(PDO::FETCH_NUM));
            $newStatus = ($totalQty == $totalReturned) ? 'refunded' : 'partial_refund';
            $db->prepare("UPDATE sales SET status = ? WHERE id = ?")->execute([$newStatus, $id]);

            // Deduct loyalty points if they were earned
            if ($sale['customer_id'] && $sale['loyalty_points_earned'] > 0 && $newStatus === 'refunded') {
                $db->prepare("UPDATE customers SET loyalty_points = GREATEST(0, loyalty_points - ?) WHERE id = ?")
                   ->execute([$sale['loyalty_points_earned'], $sale['customer_id']]);
            }

            Database::commit();
        } catch (Exception $e) {
            Database::rollBack();
            Logger::error('Refund failed: ' . $e->getMessage());
            Response::error('Refund failed: ' . $e->getMessage(), 500);
        }

        Logger::activity($user['id'], 'refund', 'sales', $id, "Refunded {$totalRefund} from sale #{$id}");
        Response::success(['return_number' => $returnNum, 'refund_amount' => round($totalRefund, 3)], 'Refund processed successfully');
    }

    public function cancel(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'sales.cancel');

        $id = (int)$params['id'];
        $db = Database::getInstance();

        $stmt = $db->prepare("SELECT * FROM sales WHERE id = ?");
        $stmt->execute([$id]);
        $sale = $stmt->fetch();

        if (!$sale) Response::notFound('Sale not found');
        if ($sale['status'] !== 'completed') Response::error('Only completed sales can be cancelled', 409);

        Database::beginTransaction();
        try {
            // Restore stock for each item
            $items = $db->prepare("SELECT * FROM sale_items WHERE sale_id = ?")->execute([$id]);
            $items = $db->query("SELECT * FROM sale_items WHERE sale_id = {$id}")->fetchAll();

            foreach ($items as $item) {
                if ($item['batch_id']) {
                    $db->prepare("UPDATE medicine_batches SET quantity = quantity + ? WHERE id = ?")
                       ->execute([$item['quantity'], $item['batch_id']]);
                }
            }

            // Update sale status
            $db->prepare("UPDATE sales SET status = 'cancelled' WHERE id = ?")->execute([$id]);

            // Reverse loyalty points earned
            if ($sale['customer_id'] && $sale['loyalty_points_earned'] > 0) {
                $db->prepare("UPDATE customers SET loyalty_points = GREATEST(0, loyalty_points - ?) WHERE id = ?")
                   ->execute([$sale['loyalty_points_earned'], $sale['customer_id']]);
            }

            Database::commit();
        } catch (Exception $e) {
            Database::rollBack();
            Response::error('Cancellation failed: ' . $e->getMessage(), 500);
        }

        Logger::activity($user['id'], 'cancel', 'sales', $id, "Cancelled sale #{$id}");
        Response::success(null, 'Sale cancelled and stock restored');
    }

    public function byInvoice(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'sales.view');

        $invoice = trim($params['invoice'] ?? '');
        $db      = Database::getInstance();

        $stmt = $db->prepare("SELECT id FROM sales WHERE invoice_number = ?");
        $stmt->execute([$invoice]);
        $row = $stmt->fetch();

        if (!$row) Response::notFound('Invoice not found');

        $sale = $this->getById($db, (int)$row['id']);
        Response::success($sale);
    }

    private function getById(PDO $db, int $id): ?array
    {
        $stmt = $db->prepare("
            SELECT s.*, c.name as customer_name, c.phone as customer_phone,
                   c.loyalty_points, u.name as cashier_name
            FROM sales s
            LEFT JOIN customers c ON c.id = s.customer_id
            LEFT JOIN users u ON u.id = s.user_id
            WHERE s.id = ?
        ");
        $stmt->execute([$id]);
        $sale = $stmt->fetch();

        if ($sale) {
            $items = $db->prepare("
                SELECT si.*, m.name as medicine_name, m.name_ar, m.unit, m.barcode,
                       b.batch_number, b.expiry_date
                FROM sale_items si
                JOIN medicines m ON m.id = si.medicine_id
                LEFT JOIN medicine_batches b ON b.id = si.batch_id
                WHERE si.sale_id = ?
            ");
            $items->execute([$id]);
            $sale['items'] = $items->fetchAll();
        }

        return $sale ?: null;
    }
}
