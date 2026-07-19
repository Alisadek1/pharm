<?php

declare(strict_types=1);

class PurchaseController
{
    public function index(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'purchases.view');

        $db         = Database::getInstance();
        $page       = max(1, (int)($_GET['page'] ?? 1));
        $perPage    = min(100, max(10, (int)($_GET['per_page'] ?? 20)));
        $supplierId = (int)($_GET['supplier_id'] ?? 0);
        $status     = trim($_GET['status'] ?? '');
        $dateFrom   = trim($_GET['date_from'] ?? '');
        $dateTo     = trim($_GET['date_to'] ?? '');
        $search     = trim($_GET['search'] ?? '');

        $where = ['1=1'];
        $binds = [];

        if ($supplierId > 0) {
            $where[] = 'p.supplier_id = ?';
            $binds[] = $supplierId;
        }

        if ($status !== '') {
            $where[] = 'p.status = ?';
            $binds[] = $status;
        }

        if ($dateFrom !== '') {
            $where[] = 'p.purchase_date >= ?';
            $binds[] = $dateFrom;
        }

        if ($dateTo !== '') {
            $where[] = 'p.purchase_date <= ?';
            $binds[] = $dateTo;
        }

        if ($search !== '') {
            $where[] = 'p.invoice_number LIKE ?';
            $binds[] = "%{$search}%";
        }

        $whereStr = implode(' AND ', $where);
        $total    = $db->prepare("SELECT COUNT(*) FROM purchases p WHERE {$whereStr}");
        $total->execute($binds);
        $total = (int)$total->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt   = $db->prepare("
            SELECT p.*, s.name as supplier_name, u.name as created_by_name
            FROM purchases p
            LEFT JOIN suppliers s ON s.id = p.supplier_id
            LEFT JOIN users u ON u.id = p.user_id
            WHERE {$whereStr}
            ORDER BY p.purchase_date DESC, p.id DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([...$binds, $perPage, $offset]);

        Response::paginated($stmt->fetchAll(), $total, $page, $perPage);
    }

    public function store(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'purchases.create');

        $body = $_POST;

        $validator = Validator::make($body, [
            'purchase_date' => 'required|date',
            'items'         => 'required',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        $items = is_string($body['items']) ? json_decode($body['items'], true) : $body['items'];

        if (!is_array($items) || empty($items)) {
            Response::error('Purchase items are required');
        }

        $db = Database::getInstance();

        // Generate invoice number
        $invoiceNum = $this->generateInvoiceNumber($db);

        // Calculate totals
        $subtotal = 0;
        foreach ($items as $item) {
            $subtotal += (float)($item['purchase_price'] ?? 0) * (int)($item['quantity'] ?? 0);
        }

        $discountType   = $body['discount_type'] ?? 'fixed';
        $discountValue  = (float)($body['discount_value'] ?? 0);
        $discountAmount = $discountType === 'percentage'
            ? round($subtotal * $discountValue / 100, 3)
            : $discountValue;

        $taxRate   = (float)($body['tax_rate'] ?? 0);
        $afterDisc = $subtotal - $discountAmount;
        $taxAmount = round($afterDisc * $taxRate / 100, 3);
        $total     = $afterDisc + $taxAmount;
        $paid      = (float)($body['paid_amount'] ?? $total);
        $due       = max(0, $total - $paid);

        Database::beginTransaction();
        try {
            $stmt = $db->prepare("
                INSERT INTO purchases (invoice_number, supplier_id, user_id, subtotal, discount_type,
                    discount_value, discount_amount, tax_rate, tax_amount, total, paid_amount,
                    due_amount, status, payment_status, notes, purchase_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $invoiceNum,
                !empty($body['supplier_id']) ? (int)$body['supplier_id'] : null,
                $user['id'],
                round($subtotal, 3),
                $discountType,
                $discountValue,
                $discountAmount,
                $taxRate,
                $taxAmount,
                round($total, 3),
                round($paid, 3),
                round($due, 3),
                $body['status'] ?? 'received',
                $due > 0 ? ($paid > 0 ? 'partial' : 'unpaid') : 'paid',
                trim($body['notes'] ?? ''),
                $body['purchase_date'],
            ]);

            $purchaseId = (int)$db->lastInsertId();

            // Load pricing settings once for auto-pricing
            $pricingSettings = $db->query("SELECT `key`, `value` FROM settings WHERE `key` LIKE 'pricing_%'")->fetchAll(PDO::FETCH_KEY_PAIR);

            foreach ($items as $item) {
                $medicineId  = (int)($item['medicine_id'] ?? 0);
                $batchNum    = trim($item['batch_number'] ?? '');
                $qty         = (int)($item['quantity'] ?? 0);
                $purchPrice  = (float)($item['purchase_price'] ?? 0);
                $publicPrice = (float)($item['public_price'] ?? 0);
                $sellPrice   = $publicPrice;
                $expiryDate  = $item['expiry_date'] ?? null;
                $mfgDate     = $item['manufacturing_date'] ?? null;

                if ($medicineId <= 0 || $qty <= 0) {
                    continue;
                }

                // Auto-pricing: override selling price if auto-pricing is enabled
                if (($pricingSettings['pricing_auto_enabled'] ?? '0') === '1') {
                    $sellPrice = $this->applyPricingFormula($purchPrice, $pricingSettings);
                }

                $batchId = null;

                if ($body['status'] !== 'ordered') {
                    // Create or update batch
                    if (!empty($batchNum) && $expiryDate) {
                        $existBatch = $db->prepare("SELECT id, quantity FROM medicine_batches WHERE medicine_id = ? AND batch_number = ?");
                        $existBatch->execute([$medicineId, $batchNum]);
                        $existing = $existBatch->fetch();

                        if ($existing) {
                            $batchId = $existing['id'];
                            $db->prepare("UPDATE medicine_batches SET quantity = quantity + ? WHERE id = ?")
                               ->execute([$qty, $batchId]);
                        } else {
                            $batchStmt = $db->prepare("
                                INSERT INTO medicine_batches (medicine_id, supplier_id, batch_number, manufacturing_date,
                                    expiry_date, purchase_price, selling_price, public_price, quantity, initial_quantity, created_by)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ");
                            $batchStmt->execute([
                                $medicineId,
                                !empty($body['supplier_id']) ? (int)$body['supplier_id'] : null,
                                $batchNum,
                                $mfgDate,
                                $expiryDate,
                                $purchPrice,
                                $sellPrice,
                                $publicPrice,
                                $qty,
                                $qty,
                                $user['id'],
                            ]);
                            $batchId = (int)$db->lastInsertId();
                        }
                    }

                    // Update medicine default prices
                    $db->prepare("UPDATE medicines SET purchase_price = ?, selling_price = ?, public_price = ? WHERE id = ?")
                       ->execute([$purchPrice, $sellPrice, $publicPrice, $medicineId]);
                }

                $db->prepare("
                    INSERT INTO purchase_items (purchase_id, medicine_id, batch_id, batch_number,
                        expiry_date, quantity, purchase_price, selling_price, public_price, subtotal)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ")->execute([
                    $purchaseId,
                    $medicineId,
                    $batchId,
                    $batchNum ?: null,
                    $expiryDate,
                    $qty,
                    $purchPrice,
                    $sellPrice,
                    $publicPrice,
                    round($qty * $purchPrice, 3),
                ]);
            }

            // Update supplier balance
            if (!empty($body['supplier_id']) && $due > 0) {
                $db->prepare("UPDATE suppliers SET balance = balance + ? WHERE id = ?")
                   ->execute([round($due, 3), (int)$body['supplier_id']]);
            }

            Database::commit();
        } catch (Exception $e) {
            Database::rollBack();
            Logger::error('Purchase creation failed: ' . $e->getMessage());
            Response::error('Failed to create purchase: ' . $e->getMessage(), 500);
        }

        $purchase = $this->getById($db, $purchaseId);
        Logger::activity($user['id'], 'create', 'purchases', $purchaseId, "Created purchase: {$invoiceNum}");
        Response::created($purchase, 'Purchase created successfully');
    }

    public function show(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'purchases.view');

        $id       = (int)$params['id'];
        $db       = Database::getInstance();
        $purchase = $this->getById($db, $id);

        if (!$purchase) {
            Response::notFound('Purchase not found');
        }

        // Get items
        $items = $db->prepare("
            SELECT pi.*, m.name as medicine_name, m.name_ar, m.sku, m.unit
            FROM purchase_items pi
            JOIN medicines m ON m.id = pi.medicine_id
            WHERE pi.purchase_id = ?
        ");
        $items->execute([$id]);
        $purchase['items'] = $items->fetchAll();

        Response::success($purchase);
    }

    public function update(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'purchases.edit');

        $id   = (int)$params['id'];
        $body = $_POST;
        $db   = Database::getInstance();

        $purchase = $this->getById($db, $id);
        if (!$purchase) {
            Response::notFound('Purchase not found');
        }

        if ($purchase['status'] === 'received') {
            Response::error('Cannot edit a received purchase. Create a return instead.', 409);
        }

        // Only allow editing notes, paid_amount, status
        $paid = (float)($body['paid_amount'] ?? $purchase['paid_amount']);
        $due  = max(0, (float)$purchase['total'] - $paid);

        $db->prepare("
            UPDATE purchases SET notes=?, paid_amount=?, due_amount=?,
                payment_status=?, status=?
            WHERE id = ?
        ")->execute([
            trim($body['notes'] ?? $purchase['notes']),
            round($paid, 3),
            round($due, 3),
            $due > 0 ? ($paid > 0 ? 'partial' : 'unpaid') : 'paid',
            $body['status'] ?? $purchase['status'],
            $id,
        ]);

        $updated = $this->getById($db, $id);
        Logger::activity($user['id'], 'update', 'purchases', $id, "Updated purchase #{$id}");
        Response::success($updated, 'Purchase updated successfully');
    }

    public function destroy(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'purchases.delete');

        $id = (int)$params['id'];
        $db = Database::getInstance();

        $purchase = $this->getById($db, $id);
        if (!$purchase) {
            Response::notFound('Purchase not found');
        }

        if ($purchase['status'] === 'received') {
            Response::error('Cannot delete a received purchase. Create a return instead.', 409);
        }

        $db->prepare("DELETE FROM purchases WHERE id = ?")->execute([$id]);
        Logger::activity($user['id'], 'delete', 'purchases', $id, "Deleted purchase #{$id}");
        Response::success(null, 'Purchase deleted successfully');
    }

    public function print(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'purchases.view');

        $id       = (int)$params['id'];
        $db       = Database::getInstance();
        $purchase = $this->getById($db, $id);

        if (!$purchase) {
            Response::notFound('Purchase not found');
        }

        $items = $db->prepare("
            SELECT pi.*, m.name as medicine_name, m.unit
            FROM purchase_items pi
            JOIN medicines m ON m.id = pi.medicine_id
            WHERE pi.purchase_id = ?
        ");
        $items->execute([$id]);
        $purchase['items'] = $items->fetchAll();

        $settings = $db->query("SELECT `key`, `value` FROM settings")->fetchAll(PDO::FETCH_KEY_PAIR);
        $purchase['settings'] = $settings;

        Response::success($purchase);
    }

    public function byInvoice(array $params): void
    {
        $user    = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'purchases.view');

        $invoice = trim($params['invoice'] ?? '');
        $db      = Database::getInstance();

        $stmt = $db->prepare("SELECT id FROM purchases WHERE invoice_number = ?");
        $stmt->execute([$invoice]);
        $row  = $stmt->fetch();
        if (!$row) Response::notFound('Invoice not found');

        $purchase = $this->getById($db, (int)$row['id']);
        $items    = $db->prepare("
            SELECT pi.*, m.name as medicine_name, m.unit
            FROM purchase_items pi JOIN medicines m ON m.id = pi.medicine_id
            WHERE pi.purchase_id = ?
        ");
        $items->execute([(int)$row['id']]);
        $purchase['items'] = $items->fetchAll();
        Response::success($purchase);
    }

    private function applyPricingFormula(float $purchasePrice, array $settings): float
    {
        $mode      = $settings['pricing_mode']         ?? 'percentage';
        $fixed     = (float)($settings['pricing_fixed_amount'] ?? 0);
        $pct       = (float)($settings['pricing_percentage']   ?? 0);
        $roundTo   = (float)($settings['pricing_round_to']     ?? 0);

        $selling = $mode === 'fixed'
            ? $purchasePrice + $fixed
            : $purchasePrice * (1 + $pct / 100);

        if ($roundTo > 0) {
            $selling = ceil($selling / $roundTo) * $roundTo;
        }

        return round($selling, 3);
    }

    private function generateInvoiceNumber(PDO $db): string
    {
        $settings = $db->query("SELECT `value` FROM settings WHERE `key` = 'po_prefix'")->fetchColumn();
        $prefix   = $settings ?: 'PO';
        $last     = $db->query("SELECT COUNT(*) + 1 FROM purchases")->fetchColumn();
        return $prefix . '-' . str_pad((string)$last, 6, '0', STR_PAD_LEFT);
    }

    private function getById(PDO $db, int $id): ?array
    {
        $stmt = $db->prepare("
            SELECT p.*, s.name as supplier_name, u.name as created_by_name
            FROM purchases p
            LEFT JOIN suppliers s ON s.id = p.supplier_id
            LEFT JOIN users u ON u.id = p.user_id
            WHERE p.id = ?
        ");
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }
}
