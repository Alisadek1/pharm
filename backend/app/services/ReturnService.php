<?php

declare(strict_types=1);

class ReturnService
{
    /**
     * Process a sale return atomically with full safety guarantees:
     *
     * - Idempotency: duplicate submits with the same key return the first result
     * - SELECT ... FOR UPDATE: prevents TOCTOU race on quantity caps
     * - DB-stored unit_price and conversion_factor: never trusts client data
     * - Atomic return number: INSERT → lastInsertId → format → UPDATE (no COUNT race)
     * - sale_item_id written to return_items for auditability
     * - sales.status updated to partial_refund or refunded
     * - Loyalty points deducted only on full refund
     *
     * @throws RuntimeException with HTTP-appropriate code on validation failure
     */
    public static function processSaleReturn(
        PDO     $db,
        int     $saleId,
        int     $userId,
        array   $items,
        string  $reason,
        string  $paymentMethod  = 'cash',
        float   $cashAmount     = 0.0,
        float   $visaAmount     = 0.0,
        float   $walletAmount   = 0.0,
        float   $bankAmount     = 0.0,
        ?string $idempotencyKey = null
    ): array {
        // Fast-path idempotency check before acquiring any locks
        if ($idempotencyKey !== null) {
            $chk = $db->prepare("SELECT id, return_number, total_amount FROM returns WHERE idempotency_key = ?");
            $chk->execute([$idempotencyKey]);
            $existing = $chk->fetch();
            if ($existing) {
                return [
                    'return_number' => $existing['return_number'],
                    'total_amount'  => (float)$existing['total_amount'],
                    'return_id'     => (int)$existing['id'],
                    'idempotent'    => true,
                ];
            }
        }

        Database::beginTransaction();
        try {
            // Lock sale row — serializes all concurrent return attempts for this sale
            $saleStmt = $db->prepare("SELECT * FROM sales WHERE id = ? FOR UPDATE");
            $saleStmt->execute([$saleId]);
            $sale = $saleStmt->fetch();

            if (!$sale) {
                throw new RuntimeException('Sale not found', 404);
            }

            if (!in_array($sale['status'], ['completed', 'partial_refund'], true)) {
                throw new RuntimeException(
                    'Sale cannot be refunded (status: ' . $sale['status'] . ')',
                    409
                );
            }

            // Second idempotency check inside lock — concurrent requests serialize here
            if ($idempotencyKey !== null) {
                $chk2 = $db->prepare("SELECT id, return_number, total_amount FROM returns WHERE idempotency_key = ?");
                $chk2->execute([$idempotencyKey]);
                $existing2 = $chk2->fetch();
                if ($existing2) {
                    Database::rollBack();
                    return [
                        'return_number' => $existing2['return_number'],
                        'total_amount'  => (float)$existing2['total_amount'],
                        'return_id'     => (int)$existing2['id'],
                        'idempotent'    => true,
                    ];
                }
            }

            // Insert return header with placeholder; auto-increment ID is globally unique
            $insertReturn = $db->prepare("
                INSERT INTO returns (return_number, type, reference_id, user_id, customer_id,
                    reason, status, payment_method, cash_amount, visa_amount,
                    wallet_amount, bank_transfer_amount, idempotency_key)
                VALUES ('RTN-TEMP', 'sale', ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?)
            ");
            $insertReturn->execute([
                $saleId,
                $userId,
                $sale['customer_id'] ?? null,
                $reason,
                $paymentMethod,
                $cashAmount,
                $visaAmount,
                $walletAmount,
                $bankAmount,
                $idempotencyKey,
            ]);
            $returnId = (int)$db->lastInsertId();

            // Atomic return number — lastInsertId never collides; no COUNT(*)+1 race
            $returnNum = 'RTN-' . date('Ymd') . '-' . str_pad((string)$returnId, 4, '0', STR_PAD_LEFT);
            $db->prepare("UPDATE returns SET return_number = ? WHERE id = ?")->execute([$returnNum, $returnId]);

            $totalAmount = 0.0;

            foreach ($items as $item) {
                // Frontend sends item_id; SaleController API sends sale_item_id
                $saleItemId = (int)($item['item_id'] ?? $item['sale_item_id'] ?? 0);
                $qty        = (int)($item['quantity'] ?? 0);

                if ($saleItemId <= 0 || $qty <= 0) continue;

                // Lock sale_item row — prevents TOCTOU on returned_quantity
                $siStmt = $db->prepare("
                    SELECT * FROM sale_items WHERE id = ? AND sale_id = ? FOR UPDATE
                ");
                $siStmt->execute([$saleItemId, $saleId]);
                $si = $siStmt->fetch();

                if (!$si) continue;

                $remaining = (int)$si['quantity'] - (int)$si['returned_quantity'];
                if ($remaining <= 0) continue;
                $qty = min($qty, $remaining);

                // DB-stored unit_price — never use client-supplied price
                $unitPrice   = (float)$si['unit_price'];
                $subtotal    = round($qty * $unitPrice, 3);
                $totalAmount += $subtotal;

                // Restore stock using frozen conversion_factor from sale_items
                $batchId = !empty($si['batch_id']) ? (int)$si['batch_id'] : null;
                if ($batchId) {
                    $factor  = (float)($si['conversion_factor'] ?? 1.0);
                    $baseQty = (int)round($qty * $factor);

                    // Lock batch row before updating
                    $db->prepare("SELECT id FROM medicine_batches WHERE id = ? FOR UPDATE")
                       ->execute([$batchId]);

                    $db->prepare("UPDATE medicine_batches SET quantity = quantity + ? WHERE id = ?")
                       ->execute([$baseQty, $batchId]);
                }

                // Increment returned_quantity (safe — row is locked above)
                $db->prepare("UPDATE sale_items SET returned_quantity = returned_quantity + ? WHERE id = ?")
                   ->execute([$qty, $saleItemId]);

                // Insert return_item with sale_item_id for full audit trail
                $db->prepare("
                    INSERT INTO return_items (return_id, medicine_id, batch_id, sale_item_id,
                        quantity, unit_price, subtotal)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ")->execute([
                    $returnId,
                    (int)$si['medicine_id'],
                    $batchId,
                    $saleItemId,
                    $qty,
                    $unitPrice,
                    $subtotal,
                ]);
            }

            $db->prepare("UPDATE returns SET total_amount = ? WHERE id = ?")
               ->execute([round($totalAmount, 3), $returnId]);

            // Determine new sale status from the DB (authoritative source)
            $srStmt = $db->prepare("
                SELECT SUM(quantity) as tq, SUM(returned_quantity) as tr
                FROM sale_items WHERE sale_id = ?
            ");
            $srStmt->execute([$saleId]);
            $sr        = $srStmt->fetch();
            $newStatus = ((int)$sr['tq'] === (int)$sr['tr']) ? 'refunded' : 'partial_refund';
            $db->prepare("UPDATE sales SET status = ? WHERE id = ?")->execute([$newStatus, $saleId]);

            // Loyalty: deduct earned points only when fully refunded
            if ($sale['customer_id'] && (int)($sale['loyalty_points_earned'] ?? 0) > 0 && $newStatus === 'refunded') {
                $db->prepare("
                    UPDATE customers SET loyalty_points = GREATEST(0, loyalty_points - ?) WHERE id = ?
                ")->execute([(int)$sale['loyalty_points_earned'], $sale['customer_id']]);
            }

            Database::commit();
        } catch (Exception $e) {
            Database::rollBack();
            throw $e;
        }

        return [
            'return_number' => $returnNum,
            'total_amount'  => round($totalAmount, 3),
            'return_id'     => $returnId,
            'idempotent'    => false,
        ];
    }
}
