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

        // ── Phase A: Resolve all items — IDOR-safe, factor+price from DB ─────
        // The client supplies unit_price but we NEVER trust it as authoritative.
        // conversion_factor is ALWAYS resolved from DB via medicine_id+unit_id.
        // price_override = true lets the cashier set a sale-level price; the master
        // medicine price is NEVER modified.
        $resolvedItems   = [];
        $medicineBaseQty = []; // medicine_id => total base units needed (aggregated)

        foreach ($items as $index => $item) {
            $medicineId = (int)($item['medicine_id'] ?? 0);
            $qty        = (int)($item['quantity']    ?? 0);

            if ($medicineId <= 0 || $qty <= 0) {
                Response::error("Invalid item at position " . ($index + 1));
            }

            $unitId        = (int)($item['unit_id'] ?? 0);
            $priceOverride = !empty($item['price_override']) && (float)($item['unit_price'] ?? 0) > 0;
            $clientPrice   = $priceOverride ? (float)$item['unit_price'] : 0.0;
            $unitData      = $this->resolveUnitData($db, $unitId, $medicineId, $priceOverride, $clientPrice);

            $baseQty = (int)round($qty * $unitData['factor']);

            // Aggregate base qty per medicine for the cross-unit stock check below
            $medicineBaseQty[$medicineId] = ($medicineBaseQty[$medicineId] ?? 0) + $baseQty;

            $itemDisc  = max(0.0, (float)($item['discount_amount'] ?? 0));
            $lineTotal = round($unitData['unit_price'] * $qty, 3);
            if ($itemDisc > $lineTotal) {
                Response::error("Discount exceeds item total at position " . ($index + 1));
            }

            $resolvedItems[] = [
                'medicine_id'     => $medicineId,
                'quantity'        => $qty,
                'unit_id'         => $unitData['unit_id'],
                'unit_name'       => $unitData['unit_name'],
                'unit_price'      => $unitData['unit_price'],
                'discount_amount' => $itemDisc,
                'factor'          => $unitData['factor'],
                'base_qty'        => $baseQty,
            ];
        }

        // ── Phase B: Aggregated stock check — one check per medicine ─────────
        // We sum ALL unit-lines for the same medicine before comparing to stock,
        // so selling 1 Box + 2 Strips is validated as one combined base-unit demand.
        foreach ($medicineBaseQty as $medicineId => $totalBaseQty) {
            $avail = $db->prepare("
                SELECT COALESCE(SUM(quantity), 0) AS stock
                FROM   medicine_batches
                WHERE  medicine_id = ? AND quantity > 0 AND expiry_date >= CURDATE()
            ");
            $avail->execute([$medicineId]);
            $stock = (int)$avail->fetchColumn();

            if ($stock < $totalBaseQty) {
                $med = $db->prepare("SELECT name FROM medicines WHERE id = ?");
                $med->execute([$medicineId]);
                $medName = $med->fetchColumn();
                Response::error(
                    "Insufficient stock for '{$medName}'. " .
                    "Available: {$stock} base units, Requested: {$totalBaseQty} base units"
                );
            }
        }

        // ── Phase C: Calculate totals ──────────────────────────────────────────
        $subtotal = 0;
        foreach ($resolvedItems as $ri) {
            $subtotal += ($ri['unit_price'] * $ri['quantity']) - $ri['discount_amount'];
        }

        $discountType   = $body['discount_type'] ?? 'fixed';
        $discountValue  = (float)($body['discount_value'] ?? 0);
        $discountAmount = $discountType === 'percentage'
            ? round($subtotal * $discountValue / 100, 3)
            : $discountValue;

        // Tax rate always from settings — client-submitted value is ignored
        $taxSettings = $db->query("SELECT `key`, `value` FROM settings WHERE `key` IN ('tax_enabled', 'tax_rate')")
                          ->fetchAll(\PDO::FETCH_KEY_PAIR);
        $taxRate     = ($taxSettings['tax_enabled'] ?? '0') === '1'
            ? (float)($taxSettings['tax_rate'] ?? 0)
            : 0.0;
        $afterDisc = $subtotal - $discountAmount;
        $taxAmount = round($afterDisc * $taxRate / 100, 3);

        $loyaltyDiscount   = 0.0;
        $loyaltyPointsUsed = (int)($body['loyalty_points_used'] ?? 0);
        if ($loyaltyPointsUsed > 0 && !empty($body['customer_id'])) {
            $custStmt = $db->prepare("SELECT loyalty_points FROM customers WHERE id = ?");
            $custStmt->execute([(int)$body['customer_id']]);
            $custLoyalty = (int)$custStmt->fetchColumn();
            if ($loyaltyPointsUsed > $custLoyalty) {
                Response::error("Customer only has {$custLoyalty} loyalty points");
            }
            $settings        = $db->query("SELECT `key`, value FROM settings WHERE `key` = 'loyalty_points_value'")->fetchAll(PDO::FETCH_KEY_PAIR);
            $pointValue      = (float)($settings['loyalty_points_value'] ?? 0.01);
            $loyaltyDiscount = round($loyaltyPointsUsed * $pointValue, 3);
        }

        $total      = max(0.0, $afterDisc + $taxAmount - $loyaltyDiscount);
        $cashAmount = (float)($body['cash_amount'] ?? 0);
        $visaAmount = (float)($body['visa_amount'] ?? 0);
        $walletAmt  = (float)($body['wallet_amount'] ?? 0);
        $change     = max(0.0, ($cashAmount + $visaAmount + $walletAmt) - $total);

        if ($total > 0.001 && ($cashAmount + $visaAmount + $walletAmt) < $total - 0.001) {
            Response::error('Payment amount is less than the total due', 422);
        }

        $settings2    = $db->query("SELECT `key`, value FROM settings WHERE `key` = 'loyalty_points_rate'")->fetchAll(PDO::FETCH_KEY_PAIR);
        $pointsRate   = (float)($settings2['loyalty_points_rate'] ?? 1);
        $pointsEarned = (int)floor($total * $pointsRate / 10);

        $invoiceNum = $this->generateInvoiceNumber($db);

        $shiftRow = $db->prepare("SELECT id FROM shifts WHERE user_id = ? AND status = 'open' LIMIT 1");
        $shiftRow->execute([$user['id']]);
        $shiftId = ($shiftRow->fetchColumn()) ?: null;

        // ── Phase D: Persist — FIFO once per medicine, snapshot per unit-line ─
        // Grouping by medicine lets us deduct all unit-lines (Box+Strip+Tablet) in
        // a single FIFO pass, which is correct and prevents double-counting.
        // Each unit-line still gets its own sale_items row so historical invoices
        // can reconstruct the exact units sold (unit_name_snapshot + conversion_factor
        // are frozen at sale time and never modified by future packaging changes).
        Database::beginTransaction();
        try {
            $paymentMethod = $this->determinePaymentMethod($cashAmount, $visaAmount, $walletAmt);
            $saleStmt = $db->prepare("
                INSERT INTO sales (invoice_number, customer_id, user_id, shift_id, subtotal, discount_type,
                    discount_value, discount_amount, tax_rate, tax_amount, total,
                    loyalty_points_used, loyalty_discount, loyalty_points_earned,
                    payment_method, cash_amount, visa_amount, wallet_amount, change_amount,
                    status, notes, sale_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ");
            $saleStmt->execute([
                $invoiceNum,
                !empty($body['customer_id']) ? (int)$body['customer_id'] : null,
                $user['id'],
                $shiftId,
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

            // Group resolved items by medicine_id for a single FIFO pass per medicine
            $byMedicine = [];
            foreach ($resolvedItems as $ri) {
                $byMedicine[$ri['medicine_id']][] = $ri;
            }

            $insertItem = $db->prepare("
                INSERT INTO sale_items
                    (sale_id, medicine_id, batch_id, quantity,
                     unit_price, discount_amount, subtotal,
                     unit_id, unit_name_snapshot, conversion_factor)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");

            foreach ($byMedicine as $medicineId => $medicineItems) {
                // FIFO: deduct total base units for this medicine in one pass
                $remaining = array_sum(array_column($medicineItems, 'base_qty'));
                $batchId   = null;

                $batches = $db->prepare("
                    SELECT id, quantity FROM medicine_batches
                    WHERE  medicine_id = ? AND quantity > 0 AND expiry_date >= CURDATE()
                    ORDER  BY expiry_date ASC, id ASC
                ");
                $batches->execute([$medicineId]);

                foreach ($batches->fetchAll() as $batch) {
                    if ($remaining <= 0) break;
                    $take       = min($remaining, (int)$batch['quantity']);
                    $remaining -= $take;
                    $db->prepare("UPDATE medicine_batches SET quantity = quantity - ? WHERE id = ?")
                       ->execute([$take, $batch['id']]);
                    if ($batchId === null) {
                        $batchId = $batch['id'];
                    }
                }

                // Insert one row per unit-line — each carries its own snapshot
                foreach ($medicineItems as $ri) {
                    $insertItem->execute([
                        $saleId,
                        $ri['medicine_id'],
                        $batchId,
                        $ri['quantity'],
                        $ri['unit_price'],
                        $ri['discount_amount'],
                        round(($ri['unit_price'] * $ri['quantity']) - $ri['discount_amount'], 3),
                        $ri['unit_id'] ?: null,
                        $ri['unit_name'],
                        $ri['factor'],
                    ]);
                }
            }

            if (!empty($body['customer_id'])) {
                $customerId = (int)$body['customer_id'];
                $db->prepare("
                    UPDATE customers SET
                        loyalty_points  = loyalty_points - ? + ?,
                        total_purchases = total_purchases + ?
                    WHERE id = ?
                ")->execute([$loyaltyPointsUsed, $pointsEarned, round($total, 3), $customerId]);
            }

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
        // Delegate to the unit-aware barcode endpoint
        (new ProductUnitController())->barcodeLookup($params);
    }

    /**
     * Resolve unit data (factor, name, authoritative price) from DB.
     * Enforces medicine_id ownership on unit_id — prevents IDOR.
     *
     * Price resolution order:
     *   1. POS price override (cashier adjusts price for this sale only) — if $priceOverride = true
     *   2. Explicit price set on the product_unit row
     *   3. Derived price: master_price × (unit_factor / ref_factor)
     *      where ref_factor = conversion_factor of the is_default_purchase unit
     *      (fallback ref_factor = 1.0 for legacy single-unit medicines)
     *
     * The price override is SALE-LEVEL only. It never modifies medicines master pricing.
     * conversion_factor is ALWAYS resolved from DB — the client-supplied value is ignored.
     */
    private function resolveUnitData(
        PDO $db, int $unitId, int $medicineId,
        bool $priceOverride = false, float $clientPrice = 0.0
    ): array {
        if ($unitId > 0) {
            $stmt = $db->prepare("
                SELECT pu.id             AS unit_id,
                       pu.unit_name,
                       pu.conversion_factor,
                       pu.public_price   AS unit_public_price,
                       m.public_price    AS master_public_price,
                       m.selling_price   AS master_selling_price
                FROM   product_units pu
                JOIN   medicines m ON m.id = pu.medicine_id
                WHERE  pu.id = ? AND pu.medicine_id = ? AND pu.is_active = 1 AND m.is_active = 1
            ");
            $stmt->execute([$unitId, $medicineId]);
            $row = $stmt->fetch();

            if ($row) {
                $factor      = (float)$row['conversion_factor'];
                $masterPrice = (float)$row['master_public_price'] > 0
                    ? (float)$row['master_public_price']
                    : (float)$row['master_selling_price'];

                if ($priceOverride && $clientPrice > 0) {
                    $price = $clientPrice;
                } elseif ($row['unit_public_price'] !== null && (float)$row['unit_public_price'] > 0) {
                    $price = (float)$row['unit_public_price'];
                } else {
                    $refFactor = $this->getDefaultPurchaseFactor($db, $medicineId);
                    $price     = $refFactor > 0 ? round($masterPrice * $factor / $refFactor, 3) : $masterPrice;
                }

                return [
                    'unit_id'    => (int)$row['unit_id'],
                    'unit_name'  => $row['unit_name'],
                    'factor'     => $factor,
                    'unit_price' => $price,
                ];
            }
            // unit_id invalid for this medicine — fall through to base unit (IDOR guard)
        }

        // No unit_id or IDOR attempt: use base unit price from medicine master
        $stmt = $db->prepare("SELECT selling_price, public_price FROM medicines WHERE id = ? AND is_active = 1");
        $stmt->execute([$medicineId]);
        $med   = $stmt->fetch();
        $price = 0.0;
        if ($med) {
            $price = (float)$med['public_price'] > 0
                ? (float)$med['public_price']
                : (float)$med['selling_price'];
        }
        if ($priceOverride && $clientPrice > 0) {
            $price = $clientPrice;
        }
        return [
            'unit_id'    => 0,
            'unit_name'  => null,
            'factor'     => 1.0,
            'unit_price' => $price,
        ];
    }

    /**
     * Return the conversion_factor of the is_default_purchase unit for a medicine.
     * This is the "reference factor" used in derived price calculations.
     * Returns 1.0 for legacy medicines with no default purchase unit.
     */
    private function getDefaultPurchaseFactor(PDO $db, int $medicineId): float
    {
        $stmt = $db->prepare(
            "SELECT conversion_factor FROM product_units
             WHERE medicine_id = ? AND is_default_purchase = 1 AND is_active = 1 LIMIT 1"
        );
        $stmt->execute([$medicineId]);
        $row = $stmt->fetch();
        return $row ? (float)$row['conversion_factor'] : 1.0;
    }

    private function resolveUnitFactor(PDO $db, int $unitId, int $medicineId): float
    {
        return $this->resolveUnitData($db, $unitId, $medicineId)['factor'];
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
            SELECT s.*, c.name as customer_name, c.loyalty_points as customer_loyalty_points,
                   c.phone as customer_phone, u.name as cashier_name
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
