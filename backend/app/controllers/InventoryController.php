<?php

declare(strict_types=1);

class InventoryController
{
    public function index(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.view');

        $db      = Database::getInstance();
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(100, max(10, (int)($_GET['per_page'] ?? 20)));
        $search  = trim($_GET['search'] ?? '');
        $catId   = (int)($_GET['category_id'] ?? 0);
        $filter  = trim($_GET['filter'] ?? '');

        $where = ['m.is_active = 1'];
        $binds = [];

        if ($search !== '') {
            $where[] = '(m.name LIKE ? OR m.barcode LIKE ? OR m.sku LIKE ?)';
            $binds   = array_merge($binds, ["%{$search}%", "%{$search}%", "%{$search}%"]);
        }

        if ($catId > 0) {
            $where[] = 'm.category_id = ?';
            $binds[] = $catId;
        }

        $whereStr = implode(' AND ', $where);

        $havingClause = '';
        if ($filter === 'low_stock') {
            $havingClause = 'HAVING current_stock <= m.minimum_stock';
        } elseif ($filter === 'out_of_stock') {
            $havingClause = 'HAVING current_stock = 0';
        } elseif ($filter === 'in_stock') {
            $havingClause = 'HAVING current_stock > m.minimum_stock';
        } elseif ($filter === 'expired') {
            $havingClause = 'HAVING expired_batches > 0';
        } elseif ($filter === 'near_expiry') {
            $havingClause = 'HAVING near_expiry_batches > 0';
        }

        $total = $db->prepare("
            SELECT COUNT(*) FROM (
                SELECT m.id, m.minimum_stock,
                       COALESCE((SELECT SUM(b.quantity) FROM medicine_batches b
                                 WHERE b.medicine_id = m.id AND b.quantity > 0 AND b.expiry_date >= CURDATE()), 0) as current_stock,
                       (SELECT COUNT(*) FROM medicine_batches b WHERE b.medicine_id = m.id AND b.expiry_date < CURDATE() AND b.quantity > 0) as expired_batches,
                       (SELECT COUNT(*) FROM medicine_batches b WHERE b.medicine_id = m.id
                        AND b.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND b.quantity > 0) as near_expiry_batches
                FROM medicines m
                WHERE {$whereStr}
                {$havingClause}
            ) sub
        ");
        $total->execute($binds);
        $total = (int)$total->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt   = $db->prepare("
            SELECT m.id, m.name, m.name_ar, m.barcode, m.sku, m.unit,
                   m.purchase_price, m.selling_price, m.public_price, m.minimum_stock,
                   c.name as category_name, co.name as company_name,
                   COALESCE((SELECT SUM(b.quantity) FROM medicine_batches b
                             WHERE b.medicine_id = m.id AND b.quantity > 0 AND b.expiry_date >= CURDATE()), 0) as current_stock,
                   (SELECT COUNT(*) FROM medicine_batches b WHERE b.medicine_id = m.id AND b.expiry_date < CURDATE() AND b.quantity > 0) as expired_batches,
                   (SELECT COUNT(*) FROM medicine_batches b WHERE b.medicine_id = m.id
                    AND b.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND b.quantity > 0) as near_expiry_batches,
                   (SELECT MIN(b.expiry_date) FROM medicine_batches b WHERE b.medicine_id = m.id AND b.quantity > 0) as nearest_expiry
            FROM medicines m
            LEFT JOIN categories c ON c.id = m.category_id
            LEFT JOIN companies co ON co.id = m.company_id
            WHERE {$whereStr}
            {$havingClause}
            ORDER BY m.name ASC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([...$binds, $perPage, $offset]);

        Response::paginated($stmt->fetchAll(), $total, $page, $perPage);
    }

    public function movements(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.view');

        $db         = Database::getInstance();
        $page       = max(1, (int)($_GET['page'] ?? 1));
        $perPage    = min(100, max(10, (int)($_GET['per_page'] ?? 20)));
        $medicineId = (int)($_GET['medicine_id'] ?? 0);
        $dateFrom   = trim($_GET['date_from'] ?? '');
        $dateTo     = trim($_GET['date_to'] ?? '');

        // Combine sales, purchases, and adjustments into a unified movement view
        $conditions = ['1=1'];
        $binds      = [];

        if ($medicineId > 0) {
            $conditions[] = 'medicine_id = ?';
            $binds[]      = $medicineId;
        }

        if ($dateFrom !== '') {
            $conditions[] = 'DATE(created_at) >= ?';
            $binds[]      = $dateFrom;
        }

        if ($dateTo !== '') {
            $conditions[] = 'DATE(created_at) <= ?';
            $binds[]      = $dateTo;
        }

        $condStr = implode(' AND ', $conditions);
        $offset  = ($page - 1) * $perPage;

        $stmt = $db->prepare("
            SELECT * FROM (
                SELECT 'sale' as type, si.medicine_id, si.quantity * -1 as quantity,
                       si.unit_price as price, s.invoice_number as reference, s.sale_date as created_at,
                       m.name as medicine_name, u.name as user_name
                FROM sale_items si
                JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
                JOIN medicines m ON m.id = si.medicine_id
                LEFT JOIN users u ON u.id = s.user_id

                UNION ALL

                SELECT 'purchase' as type, pi.medicine_id, pi.quantity,
                       pi.purchase_price as price, p.invoice_number as reference, p.created_at,
                       m.name as medicine_name, u.name as user_name
                FROM purchase_items pi
                JOIN purchases p ON p.id = pi.purchase_id AND p.status = 'received'
                JOIN medicines m ON m.id = pi.medicine_id
                LEFT JOIN users u ON u.id = p.user_id

                UNION ALL

                SELECT CONCAT('adj_', ia.type) as type, ia.medicine_id, ia.quantity_change,
                       0 as price, ia.reference_number as reference, ia.created_at,
                       m.name as medicine_name, u.name as user_name
                FROM inventory_adjustments ia
                JOIN medicines m ON m.id = ia.medicine_id
                LEFT JOIN users u ON u.id = ia.user_id
            ) movements
            WHERE {$condStr}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([...$binds, $perPage, $offset]);

        $total = $db->prepare("
            SELECT COUNT(*) FROM (
                SELECT si.medicine_id, s.sale_date as created_at
                FROM sale_items si JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
                UNION ALL
                SELECT pi.medicine_id, p.created_at FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id AND p.status = 'received'
                UNION ALL
                SELECT ia.medicine_id, ia.created_at FROM inventory_adjustments ia
            ) movements WHERE {$condStr}
        ");
        $total->execute($binds);

        Response::paginated($stmt->fetchAll(), (int)$total->fetchColumn(), $page, $perPage);
    }

    public function adjust(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.adjust');

        $body = $_POST;

        $validator = Validator::make($body, [
            'medicine_id' => 'required|integer|min:1',
            'type'        => 'required|in:add,remove,correction',
            'quantity'    => 'required|integer|min:1',
            'reason'      => 'required|string|maxlength:255',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
        }

        $db         = Database::getInstance();
        $medicineId = (int)$body['medicine_id'];
        $qty        = (int)$body['quantity'];
        $type       = $body['type'];

        // Get current stock
        $stock = $db->prepare("
            SELECT COALESCE(SUM(quantity), 0) FROM medicine_batches
            WHERE medicine_id = ? AND quantity > 0 AND expiry_date >= CURDATE()
        ");
        $stock->execute([$medicineId]);
        $currentStock = (int)$stock->fetchColumn();

        if ($type === 'remove' && $qty > $currentStock) {
            Response::error("Cannot remove {$qty} units. Current stock: {$currentStock}");
        }

        $qtyChange = match ($type) {
            'add'        => $qty,
            'remove'     => -$qty,
            'correction' => $qty - $currentStock,
        };

        $qtyAfter  = $currentStock + $qtyChange;
        $refNum    = 'ADJ-' . date('Ymd') . '-' . str_pad((string)($db->query("SELECT COUNT(*) + 1 FROM inventory_adjustments")->fetchColumn()), 4, '0', STR_PAD_LEFT);

        Database::beginTransaction();
        try {
            $db->prepare("
                INSERT INTO inventory_adjustments (reference_number, medicine_id, batch_id, user_id,
                    type, quantity_before, quantity_change, quantity_after, reason, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ")->execute([
                $refNum,
                $medicineId,
                !empty($body['batch_id']) ? (int)$body['batch_id'] : null,
                $user['id'],
                $type,
                $currentStock,
                $qtyChange,
                $qtyAfter,
                trim($body['reason']),
                trim($body['notes'] ?? ''),
            ]);

            if (!empty($body['batch_id'])) {
                $batchId = (int)$body['batch_id'];
                if ($type === 'add') {
                    $db->prepare("UPDATE medicine_batches SET quantity = quantity + ? WHERE id = ?")->execute([$qty, $batchId]);
                } elseif ($type === 'remove') {
                    $db->prepare("UPDATE medicine_batches SET quantity = GREATEST(0, quantity - ?) WHERE id = ?")->execute([$qty, $batchId]);
                } elseif ($type === 'correction') {
                    $db->prepare("UPDATE medicine_batches SET quantity = ? WHERE id = ?")->execute([$qty, $batchId]);
                }
            } else {
                $expiryDate = trim($body['expiry_date'] ?? '');

                if ($type === 'add' && $expiryDate !== '') {
                    // User selected an expiry date: merge into a batch with that
                    // expiry, or create a new one
                    $existBatch = $db->prepare("
                        SELECT id FROM medicine_batches
                        WHERE medicine_id = ? AND expiry_date = ?
                        ORDER BY id DESC LIMIT 1
                    ");
                    $existBatch->execute([$medicineId, $expiryDate]);
                    $b = $existBatch->fetch();

                    if ($b) {
                        $db->prepare("UPDATE medicine_batches SET quantity = quantity + ? WHERE id = ?")
                           ->execute([$qty, $b['id']]);
                    } else {
                        $med = $db->prepare("SELECT purchase_price, selling_price, public_price FROM medicines WHERE id = ?");
                        $med->execute([$medicineId]);
                        $m = $med->fetch();
                        $batchNum = 'ADJ-' . date('Ymd-His') . '-' . $medicineId;
                        $db->prepare("
                            INSERT INTO medicine_batches
                                (medicine_id, batch_number, manufacturing_date, expiry_date,
                                 purchase_price, selling_price, public_price, quantity, initial_quantity, created_by)
                            VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?)
                        ")->execute([
                            $medicineId, $batchNum, $expiryDate,
                            $m['purchase_price'] ?? 0, $m['selling_price'] ?? 0, $m['public_price'] ?? 0,
                            $qty, $qty, $user['id'],
                        ]);
                    }
                } else {
                    // Apply to most recent non-expired batch (include qty=0 so 'add' works on empty stock)
                    $batch = $db->prepare("
                        SELECT id, quantity FROM medicine_batches
                        WHERE medicine_id = ? AND expiry_date >= CURDATE()
                        ORDER BY quantity DESC, expiry_date DESC LIMIT 1
                    ");
                    $batch->execute([$medicineId]);
                    $b = $batch->fetch();

                    if ($b) {
                        $newQty = max(0, (int)$b['quantity'] + $qtyChange);
                        $db->prepare("UPDATE medicine_batches SET quantity = ? WHERE id = ?")->execute([$newQty, $b['id']]);
                    } elseif ($type === 'add') {
                        // No batch exists — create one automatically
                        $med = $db->prepare("SELECT purchase_price, selling_price, public_price FROM medicines WHERE id = ?");
                        $med->execute([$medicineId]);
                        $m = $med->fetch();
                        $batchNum = 'ADJ-' . date('Ymd-His') . '-' . $medicineId;
                        $db->prepare("
                            INSERT INTO medicine_batches
                                (medicine_id, batch_number, manufacturing_date, expiry_date,
                                 purchase_price, selling_price, public_price, quantity, initial_quantity, created_by)
                            VALUES (?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 2 YEAR),
                                    ?, ?, ?, ?, ?, ?)
                        ")->execute([
                            $medicineId, $batchNum,
                            $m['purchase_price'] ?? 0, $m['selling_price'] ?? 0, $m['public_price'] ?? 0,
                            $qty, $qty, $user['id'],
                        ]);
                    }
                }
            }

            Database::commit();
        } catch (Exception $e) {
            Database::rollBack();
            Response::error('Adjustment failed: ' . $e->getMessage(), 500);
        }

        Logger::activity($user['id'], 'adjust', 'inventory', $medicineId, "Stock adjustment: {$type} {$qty} units");
        Response::success(['reference' => $refNum, 'quantity_after' => $qtyAfter], 'Stock adjusted successfully');
    }

    public function adjustments(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.view');

        $db      = Database::getInstance();
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(100, max(10, (int)($_GET['per_page'] ?? 20)));

        $total  = (int)$db->query("SELECT COUNT(*) FROM inventory_adjustments")->fetchColumn();
        $offset = ($page - 1) * $perPage;

        $stmt = $db->prepare("
            SELECT ia.*, m.name as medicine_name, m.sku, u.name as adjusted_by
            FROM inventory_adjustments ia
            JOIN medicines m ON m.id = ia.medicine_id
            LEFT JOIN users u ON u.id = ia.user_id
            ORDER BY ia.created_at DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([$perPage, $offset]);

        Response::paginated($stmt->fetchAll(), $total, $page, $perPage);
    }
}
