<?php

declare(strict_types=1);

class ReturnController
{
    public function index(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'returns.view');

        $db      = Database::getInstance();
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(100, max(10, (int)($_GET['per_page'] ?? 20)));
        $type    = trim($_GET['type'] ?? '');

        $where = ['1=1'];
        $binds = [];

        if ($type !== '') {
            $where[] = 'r.type = ?';
            $binds[] = $type;
        }

        $whereStr = implode(' AND ', $where);
        $total    = $db->prepare("SELECT COUNT(*) FROM returns r WHERE {$whereStr}");
        $total->execute($binds);
        $total = (int)$total->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt   = $db->prepare("
            SELECT r.*,
                   r.type as return_type,
                   u.name as created_by_name,
                   COALESCE(s.invoice_number, p.invoice_number) as reference_invoice,
                   (SELECT COUNT(*) FROM return_items ri WHERE ri.return_id = r.id) as items_count
            FROM returns r
            LEFT JOIN users u ON u.id = r.user_id
            LEFT JOIN sales s ON s.id = r.reference_id AND r.type = 'sale'
            LEFT JOIN purchases p ON p.id = r.reference_id AND r.type = 'purchase'
            WHERE {$whereStr}
            ORDER BY r.created_at DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([...$binds, $perPage, $offset]);

        Response::paginated($stmt->fetchAll(), $total, $page, $perPage);
    }

    public function store(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'returns.create');

        $body = $_POST;

        // Support both 'type' and 'return_type' keys from frontend
        if (!isset($body['type']) && isset($body['return_type'])) {
            $body['type'] = $body['return_type'];
        }

        $validator = Validator::make($body, [
            'type'         => 'required|in:sale,purchase',
            'reference_id' => 'required|integer|min:1',
            'items'        => 'required',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        $items = is_string($body['items'] ?? '') ? json_decode($body['items'], true) : ($body['items'] ?? []);
        if (empty($items)) {
            Response::error('Return items are required');
        }

        $db     = Database::getInstance();
        $type   = $body['type'];
        $refId  = (int)$body['reference_id'];

        // Validate reference exists
        if ($type === 'sale') {
            $ref = $db->prepare("SELECT * FROM sales WHERE id = ?");
        } else {
            $ref = $db->prepare("SELECT * FROM purchases WHERE id = ?");
        }
        $ref->execute([$refId]);
        if (!$ref->fetch()) {
            Response::notFound("Referenced {$type} not found");
        }

        $totalAmount = 0;
        $returnNum   = 'RTN-' . date('Ymd') . '-' . str_pad((string)($db->query("SELECT COUNT(*) + 1 FROM returns")->fetchColumn()), 4, '0', STR_PAD_LEFT);

        // Payment method processing
        $paymentMethod     = trim($body['payment_method'] ?? 'cash');
        $cashAmount        = (float)($body['cash_amount']           ?? 0);
        $visaAmount        = (float)($body['visa_amount']           ?? 0);
        $walletAmount      = (float)($body['wallet_amount']         ?? 0);
        $bankAmount        = (float)($body['bank_transfer_amount']  ?? 0);

        Database::beginTransaction();
        try {
            $stmt = $db->prepare("
                INSERT INTO returns (return_number, type, reference_id, user_id, reason, status,
                    payment_method, cash_amount, visa_amount, wallet_amount, bank_transfer_amount)
                VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $returnNum, $type, $refId, $user['id'], trim($body['reason'] ?? ''),
                $paymentMethod, $cashAmount, $visaAmount, $walletAmount, $bankAmount,
            ]);
            $returnId = (int)$db->lastInsertId();

            foreach ($items as $item) {
                $medicineId     = (int)($item['medicine_id'] ?? 0);
                $qty            = (int)($item['quantity'] ?? 0);
                $unitPrice      = (float)($item['unit_price'] ?? 0);
                $batchId        = !empty($item['batch_id']) ? (int)$item['batch_id'] : null;
                $purchItemId    = !empty($item['purchase_item_id']) ? (int)$item['purchase_item_id'] : null;

                if ($medicineId <= 0 || $qty <= 0) continue;

                $subtotal    = round($qty * $unitPrice, 3);
                $totalAmount += $subtotal;

                if ($type === 'sale') {
                    // Sale return: customer returns goods to pharmacy — stock increases
                    if ($batchId) {
                        $db->prepare("UPDATE medicine_batches SET quantity = quantity + ? WHERE id = ?")
                           ->execute([$qty, $batchId]);
                    }
                } else {
                    // Purchase return: pharmacy returns goods to supplier — stock decreases
                    // Deduct from the earliest non-empty batch (FIFO)
                    $batchStmt = $db->prepare("
                        SELECT id, quantity FROM medicine_batches
                        WHERE medicine_id = ? AND quantity > 0
                        ORDER BY expiry_date ASC, id ASC
                        LIMIT 1
                    ");
                    $batchStmt->execute([$medicineId]);
                    $batchRow = $batchStmt->fetch();
                    if ($batchRow) {
                        $deduct = min($qty, (int)$batchRow['quantity']);
                        $db->prepare("UPDATE medicine_batches SET quantity = quantity - ? WHERE id = ?")
                           ->execute([$deduct, $batchRow['id']]);
                        $batchId = $batchRow['id'];
                    }
                    // Reduce remaining_quantity on the purchase item
                    if ($purchItemId) {
                        $db->prepare("UPDATE purchase_items SET remaining_quantity = GREATEST(0, remaining_quantity - ?) WHERE id = ?")
                           ->execute([$qty, $purchItemId]);
                    }
                }

                $db->prepare("
                    INSERT INTO return_items (return_id, medicine_id, batch_id, purchase_item_id, quantity, unit_price, subtotal)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ")->execute([$returnId, $medicineId, $batchId, $purchItemId, $qty, $unitPrice, $subtotal]);
            }

            $db->prepare("UPDATE returns SET total_amount = ? WHERE id = ?")->execute([round($totalAmount, 3), $returnId]);

            Database::commit();
        } catch (Exception $e) {
            Database::rollBack();
            Response::error('Return failed: ' . $e->getMessage(), 500);
        }

        Logger::activity($user['id'], 'create', 'returns', $returnId, "Created return: {$returnNum}");
        Response::created(['return_number' => $returnNum, 'total_amount' => round($totalAmount, 3)], 'Return processed successfully');
    }

    public function show(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'returns.view');

        $id   = (int)$params['id'];
        $db   = Database::getInstance();

        $stmt = $db->prepare("
            SELECT r.*, u.name as created_by_name
            FROM returns r
            LEFT JOIN users u ON u.id = r.user_id
            WHERE r.id = ?
        ");
        $stmt->execute([$id]);
        $return = $stmt->fetch();

        if (!$return) {
            Response::notFound('Return not found');
        }

        $items = $db->prepare("
            SELECT ri.*, m.name as medicine_name, m.unit
            FROM return_items ri
            JOIN medicines m ON m.id = ri.medicine_id
            WHERE ri.return_id = ?
        ");
        $items->execute([$id]);
        $return['items'] = $items->fetchAll();

        Response::success($return);
    }
}
