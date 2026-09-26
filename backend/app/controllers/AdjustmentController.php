<?php

declare(strict_types=1);

class AdjustmentController
{
    // ─── List ─────────────────────────────────────────────────────────────────

    public function index(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.adjustment');

        $db      = Database::getInstance();
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(100, max(10, (int)($_GET['per_page'] ?? 20)));
        $status  = trim($_GET['status'] ?? '');

        $where = ['1=1'];
        $binds = [];
        if ($status !== '') {
            $where[] = 'iar.status = ?';
            $binds[] = $status;
        }
        $w = implode(' AND ', $where);

        $cntStmt = $db->prepare("SELECT COUNT(*) FROM inventory_adjustment_requests iar WHERE {$w}");
        $cntStmt->execute($binds);
        $total = (int)$cntStmt->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt   = $db->prepare("
            SELECT iar.id, iar.request_number, iar.reason_code, iar.reason_text, iar.status,
                   iar.notes, iar.rejection_reason,
                   iar.created_at, iar.submitted_at, iar.approved_at, iar.rejected_at, iar.applied_at,
                   uc.name  AS created_by_name,
                   us.name  AS submitted_by_name,
                   ua.name  AS approved_by_name,
                   ur.name  AS rejected_by_name,
                   uap.name AS applied_by_name,
                   (SELECT COUNT(*) FROM inventory_adjustment_request_items i WHERE i.request_id = iar.id) AS item_count
            FROM inventory_adjustment_requests iar
            LEFT JOIN users uc  ON uc.id  = iar.created_by
            LEFT JOIN users us  ON us.id  = iar.submitted_by
            LEFT JOIN users ua  ON ua.id  = iar.approved_by
            LEFT JOIN users ur  ON ur.id  = iar.rejected_by
            LEFT JOIN users uap ON uap.id = iar.applied_by
            WHERE {$w}
            ORDER BY iar.created_at DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([...$binds, $perPage, $offset]);

        Response::paginated($stmt->fetchAll(), $total, $page, $perPage);
    }

    // ─── Show ─────────────────────────────────────────────────────────────────

    public function show(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.adjustment');

        $id = (int)$params['id'];
        $db = Database::getInstance();

        $fullStmt = $db->prepare("
            SELECT iar.*,
                   uc.name  AS created_by_name,
                   us.name  AS submitted_by_name,
                   ua.name  AS approved_by_name,
                   ur.name  AS rejected_by_name,
                   uap.name AS applied_by_name
            FROM inventory_adjustment_requests iar
            LEFT JOIN users uc  ON uc.id  = iar.created_by
            LEFT JOIN users us  ON us.id  = iar.submitted_by
            LEFT JOIN users ua  ON ua.id  = iar.approved_by
            LEFT JOIN users ur  ON ur.id  = iar.rejected_by
            LEFT JOIN users uap ON uap.id = iar.applied_by
            WHERE iar.id = ?
        ");
        $fullStmt->execute([$id]);
        $rec = $fullStmt->fetch();
        if (!$rec) {
            Response::notFound('Adjustment request not found');
        }

        $itemsStmt = $db->prepare("
            SELECT i.id, i.medicine_id, i.batch_id, i.adjust_type, i.quantity, i.reason_note,
                   m.name AS medicine_name, m.name_ar AS medicine_name_ar, m.sku,
                   mb.batch_number, mb.expiry_date,
                   COALESCE(mb.quantity, 0) AS current_batch_qty
            FROM inventory_adjustment_request_items i
            JOIN medicines m ON m.id = i.medicine_id
            LEFT JOIN medicine_batches mb ON mb.id = i.batch_id
            WHERE i.request_id = ?
            ORDER BY m.name ASC
        ");
        $itemsStmt->execute([$id]);
        $rec['items'] = $itemsStmt->fetchAll();

        // If applied, also list the resulting inventory_adjustments
        if ($rec['status'] === 'applied') {
            $adjStmt = $db->prepare("
                SELECT ia.reference_number, ia.type, ia.quantity_before, ia.quantity_change, ia.quantity_after,
                       ia.created_at, ia.reversal_of, ia.reversed_at,
                       m.name AS medicine_name, mb.batch_number
                FROM inventory_adjustments ia
                JOIN medicines m ON m.id = ia.medicine_id
                LEFT JOIN medicine_batches mb ON mb.id = ia.batch_id
                WHERE ia.source_request_id = ?
                ORDER BY ia.created_at ASC
            ");
            $adjStmt->execute([$id]);
            $rec['applied_adjustments'] = $adjStmt->fetchAll();
        }

        Response::success($rec);
    }

    // ─── Create draft ─────────────────────────────────────────────────────────

    public function create(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.adjustment');

        $db   = Database::getInstance();
        $body = $_POST;

        $reasonCode = trim($body['reason_code'] ?? 'correction');
        $reasonText = trim($body['reason_text'] ?? '');
        $notes      = trim($body['notes'] ?? '');

        $validCodes = ['damage', 'theft', 'expiry', 'correction', 'stocktake', 'donation', 'other'];
        if (!in_array($reasonCode, $validCodes, true)) {
            Response::error('Invalid reason_code', 422);
        }

        Database::beginTransaction();
        try {
            // INSERT → lastInsertId → format (no COUNT race)
            $db->prepare("
                INSERT INTO inventory_adjustment_requests
                    (request_number, reason_code, reason_text, notes, status, created_by)
                VALUES ('TEMP', ?, ?, ?, 'draft', ?)
            ")->execute([$reasonCode, $reasonText, $notes, $user['id']]);

            $reqId  = (int)$db->lastInsertId();
            $reqNum = 'IAR-' . date('Ymd') . '-' . str_pad((string)$reqId, 4, '0', STR_PAD_LEFT);
            $db->prepare("UPDATE inventory_adjustment_requests SET request_number = ? WHERE id = ?")
               ->execute([$reqNum, $reqId]);

            Database::commit();
        } catch (Exception $e) {
            Database::rollBack();
            Response::error('Could not create adjustment request: ' . $e->getMessage(), 500);
        }

        Logger::activity($user['id'], 'create', 'inventory_adjustment_requests', $reqId,
            "Created adjustment request {$reqNum}");
        Response::success(['id' => $reqId, 'request_number' => $reqNum], 'Adjustment request created', 201);
    }

    // ─── Item management ──────────────────────────────────────────────────────

    public function addItem(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.adjustment');

        $reqId = (int)$params['id'];
        $db    = Database::getInstance();
        $body  = $_POST;

        $req = $this->getRequest($db, $reqId);
        if (!$req) {
            Response::notFound('Adjustment request not found');
        }
        if ($req['status'] !== 'draft') {
            Response::error('Items can only be edited on a draft request', 409);
        }

        $medicineId = (int)($body['medicine_id'] ?? 0);
        $batchId    = !empty($body['batch_id']) ? (int)$body['batch_id'] : null;
        $adjustType = trim($body['adjust_type'] ?? 'add');
        $quantity   = (int)($body['quantity'] ?? 0);
        $reasonNote = trim($body['reason_note'] ?? '');

        if ($medicineId < 1) {
            Response::error('medicine_id is required', 422);
        }
        if (!in_array($adjustType, ['add', 'remove', 'correction'], true)) {
            Response::error('Invalid adjust_type', 422);
        }
        if ($quantity < 1) {
            Response::error('quantity must be ≥ 1', 422);
        }

        $existStmt = $db->prepare(
            "SELECT id FROM inventory_adjustment_request_items
             WHERE request_id = ? AND medicine_id = ? AND " .
            ($batchId !== null ? "batch_id = ?" : "batch_id IS NULL")
        );
        $binds = [$reqId, $medicineId];
        if ($batchId !== null) {
            $binds[] = $batchId;
        }
        $existStmt->execute($binds);
        $ex = $existStmt->fetch();

        if ($ex) {
            $db->prepare("
                UPDATE inventory_adjustment_request_items
                SET adjust_type = ?, quantity = ?, reason_note = ?
                WHERE id = ?
            ")->execute([$adjustType, $quantity, $reasonNote, (int)$ex['id']]);
            $itemId = (int)$ex['id'];
        } else {
            $db->prepare("
                INSERT INTO inventory_adjustment_request_items
                    (request_id, medicine_id, batch_id, adjust_type, quantity, reason_note)
                VALUES (?, ?, ?, ?, ?, ?)
            ")->execute([$reqId, $medicineId, $batchId, $adjustType, $quantity, $reasonNote]);
            $itemId = (int)$db->lastInsertId();
        }

        Response::success(['item_id' => $itemId]);
    }

    public function removeItem(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.adjustment');

        $reqId  = (int)$params['id'];
        $itemId = (int)$params['item_id'];
        $db     = Database::getInstance();

        $req = $this->getRequest($db, $reqId);
        if (!$req) {
            Response::notFound('Request not found');
        }
        if ($req['status'] !== 'draft') {
            Response::error('Items can only be removed from a draft request', 409);
        }

        $db->prepare("DELETE FROM inventory_adjustment_request_items WHERE id = ? AND request_id = ?")
           ->execute([$itemId, $reqId]);
        Response::success(null, 'Item removed');
    }

    // ─── Workflow: submit / approve / reject / apply / reverse ────────────────

    public function submit(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.adjustment');

        $reqId = (int)$params['id'];
        $db    = Database::getInstance();

        $req = $this->getRequest($db, $reqId);
        if (!$req) {
            Response::notFound('Request not found');
        }
        if ($req['status'] !== 'draft') {
            Response::error("Request must be in 'draft' status; current: {$req['status']}", 409);
        }

        $cntStmt = $db->prepare("SELECT COUNT(*) FROM inventory_adjustment_request_items WHERE request_id = ?");
        $cntStmt->execute([$reqId]);
        if ((int)$cntStmt->fetchColumn() < 1) {
            Response::error('Cannot submit an empty adjustment request; add at least one item first', 422);
        }

        $db->prepare("UPDATE inventory_adjustment_requests SET status='submitted', submitted_by=?, submitted_at=NOW() WHERE id=?")
           ->execute([$user['id'], $reqId]);

        Logger::activity($user['id'], 'submit', 'inventory_adjustment_requests', $reqId,
            "Submitted request #{$req['request_number']}");
        Response::success(['status' => 'submitted']);
    }

    public function reject(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.adjustment.approve');

        $reqId  = (int)$params['id'];
        $db     = Database::getInstance();
        $reason = trim($_POST['rejection_reason'] ?? '');

        $req = $this->getRequest($db, $reqId);
        if (!$req) {
            Response::notFound('Request not found');
        }
        if ($req['status'] !== 'submitted') {
            Response::error("Request must be in 'submitted' status; current: {$req['status']}", 409);
        }

        $db->prepare("
            UPDATE inventory_adjustment_requests
            SET status='rejected', rejected_by=?, rejected_at=NOW(), rejection_reason=?
            WHERE id=?
        ")->execute([$user['id'], $reason, $reqId]);

        Logger::activity($user['id'], 'reject', 'inventory_adjustment_requests', $reqId,
            "Rejected request #{$req['request_number']}");
        Response::success(['status' => 'rejected']);
    }

    public function approve(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.adjustment.approve');

        $reqId = (int)$params['id'];
        $db    = Database::getInstance();

        $req = $this->getRequest($db, $reqId);
        if (!$req) {
            Response::notFound('Request not found');
        }
        if ($req['status'] !== 'submitted') {
            Response::error("Request must be in 'submitted' status; current: {$req['status']}", 409);
        }

        $db->prepare("UPDATE inventory_adjustment_requests SET status='approved', approved_by=?, approved_at=NOW() WHERE id=?")
           ->execute([$user['id'], $reqId]);

        Logger::activity($user['id'], 'approve', 'inventory_adjustment_requests', $reqId,
            "Approved request #{$req['request_number']}");
        Response::success(['status' => 'approved']);
    }

    public function apply(array $params): void
    {
        $user    = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.adjustment.approve');

        $reqId   = (int)$params['id'];
        $db      = Database::getInstance();
        $idemKey = trim($_POST['idempotency_key'] ?? '');

        $req = $this->getRequest($db, $reqId);
        if (!$req) {
            Response::notFound('Request not found');
        }
        if ($req['status'] !== 'approved') {
            Response::error("Request must be in 'approved' status; current: {$req['status']}", 409);
        }

        if ($idemKey !== '') {
            $dupStmt = $db->prepare("SELECT id FROM inventory_adjustment_requests WHERE idempotency_key = ? AND id != ?");
            $dupStmt->execute([$idemKey, $reqId]);
            if ($dupStmt->fetch()) {
                Response::error('Duplicate idempotency key — adjustment already applied', 409);
            }
        }

        // Fetch full request for naming
        $fullStmt = $db->prepare("SELECT * FROM inventory_adjustment_requests WHERE id = ?");
        $fullStmt->execute([$reqId]);
        $fullReq = $fullStmt->fetch();

        $rowsStmt = $db->prepare("
            SELECT i.id AS item_id, i.medicine_id, i.batch_id, i.adjust_type, i.quantity,
                   i.reason_note, m.name AS medicine_name
            FROM inventory_adjustment_request_items i
            JOIN medicines m ON m.id = i.medicine_id
            WHERE i.request_id = ?
        ");
        $rowsStmt->execute([$reqId]);
        $rows = $rowsStmt->fetchAll();

        Database::beginTransaction();
        try {
            // Lock request row to prevent concurrent apply
            $db->prepare("SELECT id FROM inventory_adjustment_requests WHERE id = ? FOR UPDATE")->execute([$reqId]);
            $recheckStmt = $db->prepare("SELECT status FROM inventory_adjustment_requests WHERE id = ?");
            $recheckStmt->execute([$reqId]);
            if ($recheckStmt->fetchColumn() !== 'approved') {
                Database::rollBack();
                Response::error('Request was already applied or changed; please refresh', 409);
            }

            foreach ($rows as $item) {
                $medicineId = (int)$item['medicine_id'];
                $adjustType = $item['adjust_type'];
                $qty        = (int)$item['quantity'];

                if ($item['batch_id']) {
                    $batchStmt = $db->prepare("SELECT id, quantity FROM medicine_batches WHERE id = ? FOR UPDATE");
                    $batchStmt->execute([(int)$item['batch_id']]);
                    $b = $batchStmt->fetch();
                    if (!$b) {
                        continue;
                    }
                    $before  = (int)$b['quantity'];
                    $batchId = (int)$b['id'];
                } else {
                    $batchStmt = $db->prepare("
                        SELECT id, quantity FROM medicine_batches
                        WHERE medicine_id = ? AND expiry_date >= CURDATE()
                        ORDER BY quantity DESC, expiry_date DESC LIMIT 1 FOR UPDATE
                    ");
                    $batchStmt->execute([$medicineId]);
                    $b       = $batchStmt->fetch();
                    $before  = $b ? (int)$b['quantity'] : 0;
                    $batchId = $b ? (int)$b['id'] : null;
                }

                $qtyChange = match ($adjustType) {
                    'add'        => $qty,
                    'remove'     => -$qty,
                    'correction' => $qty - $before,
                };
                $after = max(0, $before + $qtyChange);

                if ($batchId) {
                    $db->prepare("UPDATE medicine_batches SET quantity = ? WHERE id = ?")->execute([$after, $batchId]);
                } elseif ($adjustType === 'add') {
                    $medStmt = $db->prepare("SELECT purchase_price, selling_price, public_price FROM medicines WHERE id = ?");
                    $medStmt->execute([$medicineId]);
                    $m        = $medStmt->fetch();
                    $batchNum = 'IAR-' . date('Ymd-His') . '-' . $medicineId;
                    $db->prepare("
                        INSERT INTO medicine_batches
                            (medicine_id, batch_number, manufacturing_date, expiry_date,
                             purchase_price, selling_price, public_price, quantity, initial_quantity, created_by)
                        VALUES (?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 2 YEAR), ?, ?, ?, ?, ?, ?)
                    ")->execute([
                        $medicineId, $batchNum,
                        $m['purchase_price'] ?? 0, $m['selling_price'] ?? 0, $m['public_price'] ?? 0,
                        $qty, $qty, $user['id'],
                    ]);
                    $batchId = (int)$db->lastInsertId();
                    $after   = $qty;
                }

                $db->prepare("
                    INSERT INTO inventory_adjustments
                        (reference_number, medicine_id, batch_id, user_id, type,
                         quantity_before, quantity_change, quantity_after, reason, notes,
                         source_request_id)
                    VALUES ('TEMP', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ")->execute([
                    $medicineId, $batchId, $user['id'], $adjustType,
                    $before, $qtyChange, $after,
                    ($item['reason_note'] ?: $item['medicine_name']),
                    $fullReq['reason_text'] ?: $fullReq['reason_code'],
                    $reqId,
                ]);
                $adjId  = (int)$db->lastInsertId();
                $refNum = 'ADJ-' . date('Ymd') . '-' . str_pad((string)$adjId, 4, '0', STR_PAD_LEFT);
                $db->prepare("UPDATE inventory_adjustments SET reference_number = ? WHERE id = ?")->execute([$refNum, $adjId]);
            }

            $db->prepare("
                UPDATE inventory_adjustment_requests
                SET status='applied', applied_by=?, applied_at=NOW(), idempotency_key=?
                WHERE id=?
            ")->execute([$user['id'], $idemKey ?: null, $reqId]);

            Database::commit();
        } catch (Exception $e) {
            Database::rollBack();
            Response::error('Apply failed: ' . $e->getMessage(), 500);
        }

        Logger::activity($user['id'], 'apply', 'inventory_adjustment_requests', $reqId,
            "Applied adjustment request #{$fullReq['request_number']}");
        Response::success(['request_number' => $fullReq['request_number']], 'Adjustment request applied');
    }

    public function reverse(array $params): void
    {
        $user  = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.adjustment.approve');

        $reqId = (int)$params['id'];
        $db    = Database::getInstance();

        $req = $this->getRequest($db, $reqId);
        if (!$req) {
            Response::notFound('Request not found');
        }
        if ($req['status'] !== 'applied') {
            Response::error("Only applied requests can be reversed; current: {$req['status']}", 409);
        }

        // Fetch source adjustments
        $adjStmt = $db->prepare("
            SELECT ia.id, ia.medicine_id, ia.batch_id, ia.quantity_change, ia.reversed_at
            FROM inventory_adjustments ia
            WHERE ia.source_request_id = ?
        ");
        $adjStmt->execute([$reqId]);
        $adjs = $adjStmt->fetchAll();

        if (empty($adjs)) {
            Response::error('No inventory adjustments found for this request', 422);
        }

        // Check none already reversed
        foreach ($adjs as $adj) {
            if (!empty($adj['reversed_at'])) {
                Response::error("Request #{$req['request_number']} has already been reversed", 409);
            }
        }

        Database::beginTransaction();
        try {
            foreach ($adjs as $adj) {
                $medicineId    = (int)$adj['medicine_id'];
                $batchId       = $adj['batch_id'] ? (int)$adj['batch_id'] : null;
                $reverseChange = -(int)$adj['quantity_change'];

                if ($batchId) {
                    $batchStmt = $db->prepare("SELECT id, quantity FROM medicine_batches WHERE id = ? FOR UPDATE");
                    $batchStmt->execute([$batchId]);
                    $b      = $batchStmt->fetch();
                    $before = $b ? (int)$b['quantity'] : 0;
                    $after  = max(0, $before + $reverseChange);
                    if ($b) {
                        $db->prepare("UPDATE medicine_batches SET quantity = ? WHERE id = ?")->execute([$after, $batchId]);
                    }
                } else {
                    $before = 0;
                    $after  = 0;
                }

                $db->prepare("
                    INSERT INTO inventory_adjustments
                        (reference_number, medicine_id, batch_id, user_id, type,
                         quantity_before, quantity_change, quantity_after, reason, notes,
                         source_request_id, reversal_of)
                    VALUES ('TEMP', ?, ?, ?, 'correction', ?, ?, ?, ?, '', ?, ?)
                ")->execute([
                    $medicineId, $batchId, $user['id'],
                    $before, $reverseChange, $after,
                    "Reversal of #{$req['request_number']}",
                    $reqId,
                    (int)$adj['id'],
                ]);
                $newAdjId = (int)$db->lastInsertId();
                $refNum   = 'REV-' . date('Ymd') . '-' . str_pad((string)$newAdjId, 4, '0', STR_PAD_LEFT);
                $db->prepare("UPDATE inventory_adjustments SET reference_number = ? WHERE id = ?")->execute([$refNum, $newAdjId]);

                $db->prepare("UPDATE inventory_adjustments SET reversed_by=?, reversed_at=NOW() WHERE id=?")
                   ->execute([$user['id'], (int)$adj['id']]);
            }

            Database::commit();
        } catch (Exception $e) {
            Database::rollBack();
            Response::error('Reversal failed: ' . $e->getMessage(), 500);
        }

        Logger::activity($user['id'], 'reverse', 'inventory_adjustment_requests', $reqId,
            "Reversed adjustment request #{$req['request_number']}");
        Response::success(null, "Request #{$req['request_number']} reversed successfully");
    }

    // ─── Reports ──────────────────────────────────────────────────────────────

    public function report(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.view');

        $db     = Database::getInstance();
        $type   = trim($_GET['type'] ?? 'adjustments');
        $from   = trim($_GET['date_from'] ?? date('Y-m-01'));
        $to     = trim($_GET['date_to'] ?? date('Y-m-d'));
        $page   = max(1, (int)($_GET['page'] ?? 1));
        $perPg  = min(200, max(10, (int)($_GET['per_page'] ?? 50)));
        $offset = ($page - 1) * $perPg;

        if ($type === 'adjustments') {
            $cntStmt = $db->prepare("SELECT COUNT(*) FROM inventory_adjustments WHERE DATE(created_at) BETWEEN ? AND ?");
            $cntStmt->execute([$from, $to]);
            $total = (int)$cntStmt->fetchColumn();

            $stmt = $db->prepare("
                SELECT ia.id, ia.reference_number, ia.type,
                       ia.quantity_before, ia.quantity_change, ia.quantity_after,
                       ia.reason, ia.notes, ia.created_at,
                       ia.source_count_id,  ic.count_number,
                       ia.source_request_id, iar.request_number,
                       ia.reversal_of, ia.reversed_at,
                       m.name AS medicine_name, m.sku,
                       mb.batch_number, mb.expiry_date,
                       u.name AS adjusted_by
                FROM inventory_adjustments ia
                JOIN medicines m ON m.id = ia.medicine_id
                LEFT JOIN medicine_batches mb ON mb.id = ia.batch_id
                LEFT JOIN users u ON u.id = ia.user_id
                LEFT JOIN inventory_counts ic ON ic.id = ia.source_count_id
                LEFT JOIN inventory_adjustment_requests iar ON iar.id = ia.source_request_id
                WHERE DATE(ia.created_at) BETWEEN ? AND ?
                ORDER BY ia.created_at DESC
                LIMIT ? OFFSET ?
            ");
            $stmt->execute([$from, $to, $perPg, $offset]);
            Response::paginated($stmt->fetchAll(), $total, $page, $perPg);

        } elseif ($type === 'count_discrepancy') {
            $cntStmt = $db->prepare("
                SELECT COUNT(*)
                FROM inventory_count_items ici
                JOIN inventory_counts ic ON ic.id = ici.count_id
                WHERE ici.counted_qty IS NOT NULL AND ici.counted_qty != ici.expected_qty
                  AND DATE(ic.created_at) BETWEEN ? AND ?
            ");
            $cntStmt->execute([$from, $to]);
            $total = (int)$cntStmt->fetchColumn();

            $stmt = $db->prepare("
                SELECT ic.id AS count_id, ic.count_number, ic.status, ic.snapshot_at, ic.created_at,
                       ici.medicine_id, ici.expected_qty, ici.counted_qty,
                       (ici.counted_qty - ici.expected_qty) AS difference,
                       m.name AS medicine_name, m.sku,
                       mb.batch_number, mb.expiry_date
                FROM inventory_count_items ici
                JOIN inventory_counts ic ON ic.id = ici.count_id
                JOIN medicines m ON m.id = ici.medicine_id
                LEFT JOIN medicine_batches mb ON mb.id = ici.batch_id
                WHERE ici.counted_qty IS NOT NULL AND ici.counted_qty != ici.expected_qty
                  AND DATE(ic.created_at) BETWEEN ? AND ?
                ORDER BY ic.created_at DESC, ABS(ici.counted_qty - ici.expected_qty) DESC
                LIMIT ? OFFSET ?
            ");
            $stmt->execute([$from, $to, $perPg, $offset]);
            Response::paginated($stmt->fetchAll(), $total, $page, $perPg);

        } elseif ($type === 'reconciliation') {
            $cntStmt = $db->prepare("SELECT COUNT(*) FROM medicines WHERE is_active = 1");
            $cntStmt->execute();
            $total = (int)$cntStmt->fetchColumn();

            $stmt = $db->prepare("
                SELECT m.id, m.name, m.sku,
                       COALESCE(SUM(CASE WHEN mov.mtype='purchase' THEN mov.qty ELSE 0 END), 0) AS purchased,
                       COALESCE(SUM(CASE WHEN mov.mtype='sale'     THEN mov.qty ELSE 0 END), 0) AS sold,
                       COALESCE(SUM(CASE WHEN mov.mtype='adj_in'   THEN mov.qty ELSE 0 END), 0) AS adjusted_in,
                       COALESCE(SUM(CASE WHEN mov.mtype='adj_out'  THEN mov.qty ELSE 0 END), 0) AS adjusted_out,
                       COALESCE((
                           SELECT SUM(mb2.quantity) FROM medicine_batches mb2
                           WHERE mb2.medicine_id = m.id AND mb2.quantity > 0 AND mb2.expiry_date >= CURDATE()
                       ), 0) AS current_stock
                FROM medicines m
                LEFT JOIN (
                    SELECT pi.medicine_id, 'purchase' AS mtype, pi.quantity AS qty
                    FROM purchase_items pi
                    JOIN purchases p ON p.id = pi.purchase_id AND p.status = 'received'
                    WHERE DATE(p.created_at) BETWEEN ? AND ?

                    UNION ALL

                    SELECT si.medicine_id, 'sale' AS mtype, si.quantity AS qty
                    FROM sale_items si
                    JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
                    WHERE DATE(s.sale_date) BETWEEN ? AND ?

                    UNION ALL

                    SELECT ia.medicine_id,
                           CASE WHEN ia.quantity_change > 0 THEN 'adj_in' ELSE 'adj_out' END AS mtype,
                           ABS(ia.quantity_change) AS qty
                    FROM inventory_adjustments ia
                    WHERE DATE(ia.created_at) BETWEEN ? AND ?
                ) mov ON mov.medicine_id = m.id
                WHERE m.is_active = 1
                GROUP BY m.id, m.name, m.sku
                ORDER BY m.name ASC
                LIMIT ? OFFSET ?
            ");
            $stmt->execute([$from, $to, $from, $to, $from, $to, $perPg, $offset]);
            Response::paginated($stmt->fetchAll(), $total, $page, $perPg);

        } else {
            Response::error('Invalid report type. Valid values: adjustments, count_discrepancy, reconciliation', 400);
        }
    }

    // ─── Integrity check ──────────────────────────────────────────────────────

    public function integrityCheck(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.count.approve');

        $db     = Database::getInstance();
        $issues = [];

        // 1. Negative batch quantities
        $stmt = $db->query("
            SELECT mb.id, mb.batch_number, mb.quantity, m.name AS medicine_name
            FROM medicine_batches mb
            JOIN medicines m ON m.id = mb.medicine_id
            WHERE mb.quantity < 0
        ");
        $neg = $stmt->fetchAll();
        if ($neg) {
            $issues[] = ['type' => 'negative_stock', 'count' => count($neg), 'records' => $neg];
        }

        // 2. Orphaned count items (batch_id points to non-existent batch)
        $stmt = $db->query("
            SELECT ici.id, ici.batch_id, ici.count_id
            FROM inventory_count_items ici
            WHERE ici.batch_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM medicine_batches mb WHERE mb.id = ici.batch_id)
        ");
        $orphans = $stmt->fetchAll();
        if ($orphans) {
            $issues[] = ['type' => 'orphaned_count_items', 'count' => count($orphans), 'records' => $orphans];
        }

        // 3. product_units.conversion_factor inconsistency with parent
        $stmt = $db->query("
            SELECT pu.id, pu.unit_name, pu.medicine_id,
                   pu.conversion_factor, pu.contains_quantity, pu.parent_unit_id,
                   p.conversion_factor AS parent_factor,
                   ROUND(p.conversion_factor * pu.contains_quantity, 6) AS expected_factor
            FROM product_units pu
            JOIN product_units p ON p.id = pu.parent_unit_id
            WHERE ABS(pu.conversion_factor - ROUND(p.conversion_factor * pu.contains_quantity, 6)) > 0.000001
        ");
        $badFactors = $stmt->fetchAll();
        if ($badFactors) {
            $issues[] = ['type' => 'bad_conversion_factor', 'count' => count($badFactors), 'records' => $badFactors];
        }

        // 4. Applied adjustments referencing non-existent batches
        $stmt = $db->query("
            SELECT ia.id, ia.reference_number, ia.batch_id
            FROM inventory_adjustments ia
            WHERE ia.batch_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM medicine_batches mb WHERE mb.id = ia.batch_id)
        ");
        $orphanAdjs = $stmt->fetchAll();
        if ($orphanAdjs) {
            $issues[] = ['type' => 'orphaned_adjustments', 'count' => count($orphanAdjs), 'records' => $orphanAdjs];
        }

        Response::success([
            'issues_found' => count($issues),
            'all_ok'       => empty($issues),
            'checked_at'   => date('c'),
            'issues'       => $issues,
        ]);
    }

    // ─── Private helper ───────────────────────────────────────────────────────

    private function getRequest(PDO $db, int $id): array|false
    {
        $stmt = $db->prepare("SELECT id, request_number, status FROM inventory_adjustment_requests WHERE id = ?");
        $stmt->execute([$id]);
        return $stmt->fetch();
    }
}
