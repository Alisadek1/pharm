<?php

declare(strict_types=1);

class POSController
{
    public function createSale(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'pos.access');

        $body  = $_POST;
        $items = is_string($body['items'] ?? '') ? json_decode($body['items'], true) : ($body['items'] ?? []);

        if (!is_array($items) || empty($items)) {
            Response::error('Cart items are required');
        }

        $db = Database::getInstance();

        // Validate each item's availability
        foreach ($items as $index => $item) {
            $medicineId = (int)($item['medicine_id'] ?? 0);
            $qty        = (int)($item['quantity'] ?? 0);

            if ($medicineId <= 0 || $qty <= 0) {
                Response::error("Invalid item at position " . ($index + 1));
            }

            // Get available stock via FIFO (non-expired, oldest first)
            $available = $db->prepare("
                SELECT COALESCE(SUM(quantity), 0) as stock
                FROM medicine_batches
                WHERE medicine_id = ? AND quantity > 0 AND expiry_date >= CURDATE()
            ");
            $available->execute([$medicineId]);
            $stock = (int)$available->fetchColumn();

            if ($stock < $qty) {
                $med = $db->prepare("SELECT name FROM medicines WHERE id = ?");
                $med->execute([$medicineId]);
                $medName = $med->fetchColumn();
                Response::error("Insufficient stock for '{$medName}'. Available: {$stock}, Requested: {$qty}");
            }
        }

        // Calculate totals
        $subtotal = 0;
        foreach ($items as $item) {
            $unitPrice = (float)($item['unit_price'] ?? 0);
            $qty       = (int)($item['quantity'] ?? 0);
            $itemDisc  = (float)($item['discount_amount'] ?? 0);
            $subtotal += ($unitPrice * $qty) - $itemDisc;
        }

        $discountType   = $body['discount_type'] ?? 'fixed';
        $discountValue  = (float)($body['discount_value'] ?? 0);
        $discountAmount = $discountType === 'percentage'
            ? round($subtotal * $discountValue / 100, 3)
            : $discountValue;

        $taxRate   = (float)($body['tax_rate'] ?? 0);
        $afterDisc = $subtotal - $discountAmount;
        $taxAmount = round($afterDisc * $taxRate / 100, 3);

        // Loyalty points
        $loyaltyDiscount = 0;
        $loyaltyPointsUsed = (int)($body['loyalty_points_used'] ?? 0);
        if ($loyaltyPointsUsed > 0 && !empty($body['customer_id'])) {
            $custStmt = $db->prepare("SELECT loyalty_points FROM customers WHERE id = ?");
            $custStmt->execute([(int)$body['customer_id']]);
            $custLoyalty = (int)$custStmt->fetchColumn();

            if ($loyaltyPointsUsed > $custLoyalty) {
                Response::error("Customer only has {$custLoyalty} loyalty points");
            }

            $settings = $db->query("SELECT `key`, value FROM settings WHERE `key` IN ('loyalty_points_value')")
                          ->fetchAll(PDO::FETCH_KEY_PAIR);
            $pointValue     = (float)($settings['loyalty_points_value'] ?? 0.01);
            $loyaltyDiscount = round($loyaltyPointsUsed * $pointValue, 3);
        }

        $total      = max(0, $afterDisc + $taxAmount - $loyaltyDiscount);
        $cashAmount = (float)($body['cash_amount'] ?? 0);
        $visaAmount = (float)($body['visa_amount'] ?? 0);
        $walletAmt  = (float)($body['wallet_amount'] ?? 0);
        $change     = max(0, ($cashAmount + $visaAmount + $walletAmt) - $total);

        // Calculate loyalty points earned
        $settings2 = $db->query("SELECT `key`, value FROM settings WHERE `key` = 'loyalty_points_rate'")
                       ->fetchAll(PDO::FETCH_KEY_PAIR);
        $pointsRate   = (float)($settings2['loyalty_points_rate'] ?? 1);
        $pointsEarned = (int)floor($total * $pointsRate / 10);

        $invoiceNum = $this->generateInvoiceNumber($db);

        Database::beginTransaction();
        try {
            $saleStmt = $db->prepare("
                INSERT INTO sales (invoice_number, customer_id, user_id, subtotal, discount_type,
                    discount_value, discount_amount, tax_rate, tax_amount, total,
                    loyalty_points_used, loyalty_discount, loyalty_points_earned,
                    payment_method, cash_amount, visa_amount, wallet_amount, change_amount,
                    status, notes, sale_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ");
            $paymentMethod = $this->determinePaymentMethod($cashAmount, $visaAmount, $walletAmt);
            $saleStmt->execute([
                $invoiceNum,
                !empty($body['customer_id']) ? (int)$body['customer_id'] : null,
                $user['id'],
                round($subtotal, 3),
                $discountType,
                $discountValue,
                $discountAmount,
                $taxRate,
                $taxAmount,
                round($total, 3),
                $loyaltyPointsUsed,
                $loyaltyDiscount,
                $pointsEarned,
                $paymentMethod,
                round($cashAmount, 3),
                round($visaAmount, 3),
                round($walletAmt, 3),
                round($change, 3),
                'completed',
                trim($body['notes'] ?? ''),
            ]);

            $saleId = (int)$db->lastInsertId();

            // Process each item using FIFO
            foreach ($items as $item) {
                $medicineId = (int)($item['medicine_id'] ?? 0);
                $qty        = (int)($item['quantity'] ?? 0);
                $unitPrice  = (float)($item['unit_price'] ?? 0);
                $itemDisc   = (float)($item['discount_amount'] ?? 0);
                $remaining  = $qty;

                // FIFO: get batches ordered by expiry date then ID
                $batches = $db->prepare("
                    SELECT id, quantity, expiry_date FROM medicine_batches
                    WHERE medicine_id = ? AND quantity > 0 AND expiry_date >= CURDATE()
                    ORDER BY expiry_date ASC, id ASC
                ");
                $batches->execute([$medicineId]);

                $batchId   = null;
                $deducted  = 0;

                foreach ($batches->fetchAll() as $batch) {
                    if ($remaining <= 0) break;

                    $take    = min($remaining, (int)$batch['quantity']);
                    $remaining -= $take;
                    $deducted += $take;

                    $db->prepare("UPDATE medicine_batches SET quantity = quantity - ? WHERE id = ?")
                       ->execute([$take, $batch['id']]);

                    if ($batchId === null) {
                        $batchId = $batch['id'];
                    }
                }

                $db->prepare("
                    INSERT INTO sale_items (sale_id, medicine_id, batch_id, quantity, unit_price, discount_amount, subtotal)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ")->execute([
                    $saleId,
                    $medicineId,
                    $batchId,
                    $qty,
                    $unitPrice,
                    $itemDisc,
                    round(($unitPrice * $qty) - $itemDisc, 3),
                ]);
            }

            // Update customer loyalty points
            if (!empty($body['customer_id'])) {
                $customerId = (int)$body['customer_id'];
                $db->prepare("
                    UPDATE customers SET
                        loyalty_points = loyalty_points - ? + ?,
                        total_purchases = total_purchases + ?
                    WHERE id = ?
                ")->execute([$loyaltyPointsUsed, $pointsEarned, round($total, 3), $customerId]);
            }

            // Delete held invoice if this came from one
            if (!empty($body['held_invoice_id'])) {
                $db->prepare("DELETE FROM held_invoices WHERE id = ? AND user_id = ?")
                   ->execute([(int)$body['held_invoice_id'], $user['id']]);
            }

            Database::commit();
        } catch (Exception $e) {
            Database::rollBack();
            Logger::error('Sale creation failed: ' . $e->getMessage());
            Response::error('Failed to process sale: ' . $e->getMessage(), 500);
        }

        // Generate notifications for low stock
        $this->checkLowStockNotifications($db, $items);

        $sale = $this->getSaleById($db, $saleId);
        Logger::activity($user['id'], 'create', 'sales', $saleId, "Sale: {$invoiceNum}, Total: {$total}");
        Response::created($sale, 'Sale completed successfully');
    }

    public function holdInvoice(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'pos.access');

        $body  = $_POST;
        $items = is_string($body['items'] ?? '') ? json_decode($body['items'], true) : ($body['items'] ?? []);

        if (empty($items)) {
            Response::error('Cart is empty');
        }

        $db   = Database::getInstance();
        $stmt = $db->prepare("
            INSERT INTO held_invoices (user_id, customer_id, label, cart_data)
            VALUES (?, ?, ?, ?)
        ");
        $stmt->execute([
            $user['id'],
            !empty($body['customer_id']) ? (int)$body['customer_id'] : null,
            trim($body['label'] ?? 'Hold #' . date('His')),
            json_encode($body),
        ]);

        Response::created(['id' => (int)$db->lastInsertId()], 'Invoice held successfully');
    }

    public function getHeldInvoices(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'pos.access');

        $db   = Database::getInstance();
        $stmt = $db->prepare("
            SELECT h.*, c.name as customer_name
            FROM held_invoices h
            LEFT JOIN customers c ON c.id = h.customer_id
            WHERE h.user_id = ?
            ORDER BY h.created_at DESC
        ");
        $stmt->execute([$user['id']]);

        $held = $stmt->fetchAll();
        foreach ($held as &$h) {
            $h['cart_data'] = json_decode($h['cart_data'], true);
        }

        Response::success($held);
    }

    public function deleteHeld(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'pos.access');

        $id = (int)$params['id'];
        $db = Database::getInstance();

        $stmt = $db->prepare("DELETE FROM held_invoices WHERE id = ? AND user_id = ?");
        $stmt->execute([$id, $user['id']]);

        Response::success(null, 'Held invoice deleted');
    }

    public function lookupBarcode(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'pos.access');

        $code = trim($params['code'] ?? '');
        $db   = Database::getInstance();

        $stmt = $db->prepare("
            SELECT m.id, m.name, m.name_ar, m.barcode, m.sku, m.selling_price, m.public_price, m.unit,
                   m.prescription_required, m.controlled_drug,
                   COALESCE((
                       SELECT SUM(b.quantity) FROM medicine_batches b
                       WHERE b.medicine_id = m.id AND b.quantity > 0 AND b.expiry_date >= CURDATE()
                   ), 0) as current_stock
            FROM medicines m
            WHERE m.is_active = 1 AND (m.barcode = ? OR m.sku = ?)
            LIMIT 1
        ");
        $stmt->execute([$code, $code]);
        $medicine = $stmt->fetch();

        if (!$medicine) {
            Response::notFound('Medicine not found for barcode: ' . htmlspecialchars($code));
        }

        Response::success($medicine);
    }

    private function generateInvoiceNumber(PDO $db): string
    {
        $prefix = $db->query("SELECT `value` FROM settings WHERE `key` = 'invoice_prefix'")->fetchColumn() ?: 'INV';
        $count  = $db->query("SELECT COUNT(*) + 1 FROM sales")->fetchColumn();
        return $prefix . '-' . date('Ymd') . '-' . str_pad((string)$count, 4, '0', STR_PAD_LEFT);
    }

    private function determinePaymentMethod(float $cash, float $visa, float $wallet): string
    {
        $methods = array_filter(['cash' => $cash, 'visa' => $visa, 'wallet' => $wallet]);
        if (count($methods) > 1) return 'split';
        if ($visa > 0) return 'visa';
        if ($wallet > 0) return 'wallet';
        return 'cash';
    }

    private function getSaleById(PDO $db, int $id): ?array
    {
        $stmt = $db->prepare("
            SELECT s.*, c.name as customer_name, u.name as cashier_name
            FROM sales s
            LEFT JOIN customers c ON c.id = s.customer_id
            LEFT JOIN users u ON u.id = s.user_id
            WHERE s.id = ?
        ");
        $stmt->execute([$id]);
        $sale = $stmt->fetch();

        if ($sale) {
            $items = $db->prepare("
                SELECT si.*, m.name as medicine_name, m.unit
                FROM sale_items si
                JOIN medicines m ON m.id = si.medicine_id
                WHERE si.sale_id = ?
            ");
            $items->execute([$id]);
            $sale['items'] = $items->fetchAll();
        }

        return $sale ?: null;
    }

    private function checkLowStockNotifications(PDO $db, array $items): void
    {
        foreach ($items as $item) {
            $medicineId = (int)($item['medicine_id'] ?? 0);
            if ($medicineId <= 0) continue;

            $row = $db->prepare("
                SELECT m.name, m.minimum_stock,
                       COALESCE((SELECT SUM(b.quantity) FROM medicine_batches b
                                 WHERE b.medicine_id = m.id AND b.quantity > 0 AND b.expiry_date >= CURDATE()), 0) as stock
                FROM medicines m WHERE m.id = ?
            ");
            $row->execute([$medicineId]);
            $med = $row->fetch();

            if ($med && (int)$med['stock'] <= (int)$med['minimum_stock']) {
                // Avoid duplicate notifications
                $exists = $db->prepare("
                    SELECT id FROM notifications WHERE type = 'low_stock' AND model = 'medicines' AND model_id = ?
                    AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
                ");
                $exists->execute([$medicineId]);
                if (!$exists->fetch()) {
                    $db->prepare("
                        INSERT INTO notifications (type, title, message, model, model_id)
                        VALUES ('low_stock', ?, ?, 'medicines', ?)
                    ")->execute([
                        'Low Stock: ' . $med['name'],
                        "{$med['name']} is running low. Current stock: {$med['stock']}, Minimum: {$med['minimum_stock']}",
                        $medicineId,
                    ]);
                }
            }
        }
    }
}
