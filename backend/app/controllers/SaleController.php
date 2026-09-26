<?php

declare(strict_types=1);

class SaleController
{
    public function index(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'sales.view');

        $db            = Database::getInstance();
        $page          = max(1, (int)($_GET['page'] ?? 1));
        $perPage       = min(100, max(10, (int)($_GET['per_page'] ?? 20)));
        $customerId    = (int)($_GET['customer_id'] ?? 0);
        $status        = trim($_GET['status'] ?? '');
        $dateFrom      = trim($_GET['date_from'] ?? '');
        $dateTo        = trim($_GET['date_to'] ?? '');
        $search        = trim($_GET['search'] ?? '');
        $payMethod     = trim($_GET['payment_method'] ?? '');
        $productSearch = trim($_GET['product_search'] ?? '');

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

        if ($productSearch !== '') {
            $where[] = 'EXISTS (
                SELECT 1 FROM sale_items si2
                JOIN medicines m2 ON m2.id = si2.medicine_id
                WHERE si2.sale_id = s.id
                  AND (m2.name LIKE ? OR m2.name_ar LIKE ? OR m2.barcode LIKE ?)
            )';
            $binds[] = "%{$productSearch}%";
            $binds[] = "%{$productSearch}%";
            $binds[] = "%{$productSearch}%";
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
            SELECT s.*,
                   c.name  AS customer_name,
                   c.phone AS customer_phone,
                   u.name  AS cashier_name,
                   (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS items_count
            FROM sales s
            LEFT JOIN customers c ON c.id = s.customer_id
            LEFT JOIN users u     ON u.id = s.user_id
            WHERE {$whereStr}
            ORDER BY s.sale_date DESC, s.id DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([...$binds, $perPage, $offset]);
        $rows = $stmt->fetchAll();

        // When searching by product, attach matched_items to each row — one batch query, no N+1
        if ($productSearch !== '' && $rows) {
            $saleIds      = array_column($rows, 'id');
            $placeholders = implode(',', array_fill(0, count($saleIds), '?'));
            $matchedStmt  = $db->prepare("
                SELECT si.sale_id,
                       m.name              AS medicine_name,
                       m.name_ar,
                       si.quantity,
                       si.unit_name_snapshot
                FROM   sale_items si
                JOIN   medicines m ON m.id = si.medicine_id
                WHERE  si.sale_id IN ({$placeholders})
                  AND  (m.name LIKE ? OR m.name_ar LIKE ? OR m.barcode LIKE ?)
                ORDER  BY si.sale_id, si.id
            ");
            $matchedStmt->execute([...$saleIds, "%{$productSearch}%", "%{$productSearch}%", "%{$productSearch}%"]);
            $grouped = [];
            foreach ($matchedStmt->fetchAll() as $mi) {
                $grouped[$mi['sale_id']][] = [
                    'medicine_name' => $mi['medicine_name'],
                    'name_ar'       => $mi['name_ar'],
                    'quantity'      => (int)$mi['quantity'],
                    'unit_name'     => $mi['unit_name_snapshot'] ?? '',
                ];
            }
            foreach ($rows as &$row) {
                $row['matched_items'] = $grouped[$row['id']] ?? [];
            }
            unset($row);
        }

        Response::paginated($rows, $total, $page, $perPage);
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

        $items = is_string($body['items'] ?? '') ? json_decode($body['items'], true) : ($body['items'] ?? []);
        if (empty($items)) {
            Response::error('Refund items are required');
        }

        $idempotencyKey = trim($body['idempotency_key'] ?? '') ?: null;

        try {
            $result = ReturnService::processSaleReturn(
                $db,
                $id,
                $user['id'],
                $items,
                trim($body['reason'] ?? 'Customer return'),
                trim($body['payment_method'] ?? 'cash'),
                (float)($body['cash_amount']         ?? 0),
                (float)($body['visa_amount']          ?? 0),
                (float)($body['wallet_amount']        ?? 0),
                (float)($body['bank_transfer_amount'] ?? 0),
                $idempotencyKey
            );
        } catch (RuntimeException $e) {
            Logger::error('Refund failed: ' . $e->getMessage());
            Response::error($e->getMessage(), (int)$e->getCode() ?: 500);
            return;
        }

        Logger::activity($user['id'], 'refund', 'sales', $id,
            "Refunded {$result['total_amount']} from sale #{$id}");
        Response::success([
            'return_number' => $result['return_number'],
            'refund_amount' => $result['total_amount'],
        ], 'Refund processed successfully');
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
            $itemStmt = $db->prepare("SELECT * FROM sale_items WHERE sale_id = ?");
            $itemStmt->execute([$id]);
            $items = $itemStmt->fetchAll();

            foreach ($items as $item) {
                if ($item['batch_id']) {
                    $factor  = (float)($item['conversion_factor'] ?? 1.0);
                    $baseQty = (int)round($item['quantity'] * $factor);
                    $db->prepare("UPDATE medicine_batches SET quantity = quantity + ? WHERE id = ?")
                       ->execute([$baseQty, $item['batch_id']]);
                }
            }

            // Update sale status
            $db->prepare("UPDATE sales SET status = 'cancelled' WHERE id = ?")->execute([$id]);

            // Reverse loyalty points earned
            if ($sale['customer_id'] && $sale['loyalty_points_earned'] > 0) {
                $db->prepare("UPDATE customers SET loyalty_points = GREATEST(0, loyalty_points - ?) WHERE id = ?")
                   ->execute([$sale['loyalty_points_earned'], $sale['customer_id']]);
            }

            // Restore loyalty points that were redeemed in this sale
            if ($sale['customer_id'] && (int)($sale['loyalty_points_used'] ?? 0) > 0) {
                $db->prepare("UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id = ?")
                   ->execute([(int)$sale['loyalty_points_used'], $sale['customer_id']]);
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
