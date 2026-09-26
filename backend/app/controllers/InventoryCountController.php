<?php

declare(strict_types=1);

class InventoryCountController
{
    public function index(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.count');

        $db      = Database::getInstance();
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(100, max(10, (int)($_GET['per_page'] ?? 20)));
        $status  = trim($_GET['status'] ?? '');

        $where = ['1=1'];
        $binds = [];
        if ($status !== '') {
            $where[] = 'ic.status = ?';
            $binds[] = $status;
        }
        $whereStr = implode(' AND ', $where);

        $cntStmt = $db->prepare("SELECT COUNT(*) FROM inventory_counts ic WHERE {$whereStr}");
        $cntStmt->execute($binds);
        $total = (int)$cntStmt->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt   = $db->prepare("
            SELECT ic.id, ic.count_number, ic.status, ic.notes, ic.snapshot_at,
                   ic.created_at, ic.submitted_at, ic.approved_at, ic.applied_at,
                   uc.name AS created_by_name,
                   us.name AS submitted_by_name,
                   ua.name AS approved_by_name,
                   (SELECT COUNT(*)
                    FROM inventory_count_items ici WHERE ici.count_id = ic.id) AS total_items,
                   (SELECT COUNT(*)
                    FROM inventory_count_items ici WHERE ici.count_id = ic.id AND ici.counted_qty IS NOT NULL) AS counted_items
            FROM inventory_counts ic
            LEFT JOIN users uc ON uc.id = ic.created_by
            LEFT JOIN users us ON us.id = ic.submitted_by
            LEFT JOIN users ua ON ua.id = ic.approved_by
            WHERE {$whereStr}
            ORDER BY ic.created_at DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([...$binds, $perPage, $offset]);

        Response::paginated($stmt->fetchAll(), $total, $page, $perPage);
    }

    public function show(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.count');

        $id = (int)$params['id'];
        $db = Database::getInstance();

        $countStmt = $db->prepare("
            SELECT ic.*, uc.name AS created_by_name, us.name AS submitted_by_name,
                   ua.name AS approved_by_name, uap.name AS applied_by_name
            FROM inventory_counts ic
            LEFT JOIN users uc  ON uc.id  = ic.created_by
            LEFT JOIN users us  ON us.id  = ic.submitted_by
            LEFT JOIN users ua  ON ua.id  = ic.approved_by
            LEFT JOIN users uap ON uap.id = ic.applied_by
            WHERE ic.id = ?
        ");
        $countStmt->execute([$id]);
        $count = $countStmt->fetch();
        if (!$count) {
            Response::notFound('Count not found');
        }

        // Include current batch qty so UI can detect stock movements since snapshot
        $items = $db->prepare("
            SELECT ici.id, ici.medicine_id, ici.batch_id, ici.expected_qty,
                   ici.counted_qty, ici.difference, ici.notes, ici.counted_at,
                   m.name AS medicine_name, m.name_ar AS medicine_name_ar, m.sku,
                   mb.batch_number, mb.expiry_date,
                   COALESCE(mb.quantity, 0) AS current_batch_qty,
                   pu.unit_name AS default_unit_name, pu.unit_name_ar AS default_unit_name_ar,
                   u.name AS counted_by_name
            FROM inventory_count_items ici
            JOIN medicines m ON m.id = ici.medicine_id
            LEFT JOIN medicine_batches mb ON mb.id = ici.batch_id
            LEFT JOIN product_units pu ON pu.medicine_id = ici.medicine_id
                AND pu.is_default_purchase = 1 AND pu.is_active = 1
            LEFT JOIN users u ON u.id = ici.counted_by
            WHERE ici.count_id = ?
            ORDER BY m.name ASC, ici.id ASC
        ");
        $items->execute([$id]);

        $count['items'] = $items->fetchAll();
        Response::success($count);
    }

    public function create(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.count');

        $db   = Database::getInstance();
        $body = $_POST;

        $populateAll = !empty($body['populate_all']) && $body['populate_all'] !== '0';

        Database::beginTransaction();
        try {
            // Use INSERT → lastInsertId → format to avoid COUNT(*)+1 race
            $db->prepare("
                INSERT INTO inventory_counts (count_number, notes, status, created_by, snapshot_at)
                VALUES ('TEMP', ?, 'draft', ?, NOW())
            ")->execute([trim($body['notes'] ?? ''), $user['id']]);

            $countId     = (int)$db->lastInsertId();
            $countNumber = 'CNT-' . date('Ymd') . '-' . str_pad((string)$countId, 4, '0', STR_PAD_LEFT);
            $db->prepare("UPDATE inventory_counts SET count_number = ? WHERE id = ?")->execute([$countNumber, $countId]);

            if ($populateAll) {
                $batches = $db->query("
                    SELECT mb.id AS batch_id, mb.medicine_id, mb.quantity AS expected_qty
                    FROM medicine_batches mb
                    JOIN medicines m ON m.id = mb.medicine_id AND m.is_active = 1
                    WHERE mb.quantity > 0 AND mb.expiry_date >= CURDATE()
                    ORDER BY mb.medicine_id ASC, mb.expiry_date ASC, mb.id ASC
                ")->fetchAll();

                if (!empty($batches)) {
                    $placeholders = implode(', ', array_fill(0, count($batches), '(?,?,?,?)'));
                    $values       = [];
                    foreach ($batches as $b) {
                        $values[] = $countId;
                        $values[] = (int)$b['medicine_id'];
                        $values[] = (int)$b['batch_id'];
                        $values[] = (int)$b['expected_qty'];
                    }
                    $db->prepare("INSERT INTO inventory_count_items (count_id, medicine_id, batch_id, expected_qty) VALUES {$placeholders}")
                       ->execute($values);
                }
            }

            Database::commit();
        } catch (Exception $e) {
            Database::rollBack();
            Response::error('Could not create count: ' . $e->getMessage(), 500);
        }

        Logger::activity($user['id'], 'create', 'inventory_counts', $countId, "Created count {$countNumber}");
        Response::success(['id' => $countId, 'count_number' => $countNumber], 'Count created', 201);
    }

    /**
     * Search medicines/batches to add to a count (for populate_all=0 workflow).
     */
    public function searchMedicines(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.count');

        $db     = Database::getInstance();
        $search = trim($_GET['q'] ?? '');

        if (strlen($search) < 2) {
            Response::success([]);
            return;
        }

        $stmt = $db->prepare("
            SELECT mb.id AS batch_id, mb.medicine_id, mb.batch_number, mb.expiry_date, mb.quantity AS current_qty,
                   m.name AS medicine_name, m.name_ar AS medicine_name_ar, m.sku
            FROM medicine_batches mb
            JOIN medicines m ON m.id = mb.medicine_id AND m.is_active = 1
            WHERE mb.expiry_date >= CURDATE()
              AND (m.name LIKE ? OR m.sku LIKE ? OR mb.batch_number LIKE ?)
            ORDER BY m.name ASC, mb.expiry_date ASC
            LIMIT 30
        ");
        $like = "%{$search}%";
        $stmt->execute([$like, $like, $like]);
        Response::success($stmt->fetchAll());
    }

    public function upsertItem(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.count');

        $countId = (int)$params['id'];
        $db      = Database::getInstance();
        $body    = $_POST;

        $countRow = $this->getCount($db, $countId);
        if (!$countRow) {
            Response::notFound('Count not found');
        }
        if (!in_array($countRow['status'], ['draft', 'counting'], true)) {
            Response::error('Can only edit items on a draft count', 409);
        }

        $medicineId = (int)($body['medicine_id'] ?? 0);
        $batchId    = !empty($body['batch_id']) ? (int)$body['batch_id'] : null;
        $countedQty = isset($body['counted_qty']) && $body['counted_qty'] !== '' ? (int)$body['counted_qty'] : null;
        $notes      = trim($body['notes'] ?? '');

        if ($medicineId < 1) {
            Response::error('medicine_id is required');
        }

        $existStmt = $db->prepare(
            "SELECT id, expected_qty FROM inventory_count_items WHERE count_id = ? AND medicine_id = ? AND " .
            ($batchId !== null ? "batch_id = ?" : "batch_id IS NULL")
        );
        $binds = [$countId, $medicineId];
        if ($batchId !== null) {
            $binds[] = $batchId;
        }
        $existStmt->execute($binds);
        $existing = $existStmt->fetch();

        if ($existing) {
            $db->prepare("
                UPDATE inventory_count_items
                SET counted_qty = ?, notes = ?, counted_by = ?, counted_at = NOW()
                WHERE id = ?
            ")->execute([$countedQty, $notes, $user['id'], (int)$existing['id']]);
            $itemId = (int)$existing['id'];
        } else {
            $expectedQty = (int)($body['expected_qty'] ?? 0);
            if ($expectedQty === 0 && $batchId) {
                $row = $db->prepare("SELECT quantity FROM medicine_batches WHERE id = ? AND medicine_id = ?");
                $row->execute([$batchId, $medicineId]);
                $expectedQty = (int)($row->fetchColumn() ?: 0);
            }
            $db->prepare("
                INSERT INTO inventory_count_items
                    (count_id, medicine_id, batch_id, expected_qty, counted_qty, notes, counted_by, counted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            ")->execute([$countId, $medicineId, $batchId, $expectedQty, $countedQty, $notes, $user['id']]);
            $itemId = (int)$db->lastInsertId();
        }

        Response::success(['item_id' => $itemId]);
    }

    public function submit(array $params): void
    {
        $this->transition($params, 'draft', 'submitted', 'inventory.count', function ($db, $countId, $user) {
            $db->prepare("UPDATE inventory_counts SET status='submitted', submitted_by=?, submitted_at=NOW() WHERE id=?")
               ->execute([$user['id'], $countId]);
        });
    }

    public function approve(array $params): void
    {
        $this->transition($params, 'submitted', 'approved', 'inventory.count.approve', function ($db, $countId, $user) {
            $db->prepare("UPDATE inventory_counts SET status='approved', approved_by=?, approved_at=NOW() WHERE id=?")
               ->execute([$user['id'], $countId]);
        });
    }

    public function apply(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.count.approve');

        $countId = (int)$params['id'];
        $db      = Database::getInstance();
        $count   = $this->getCount($db, $countId);
        if (!$count) {
            Response::notFound('Count not found');
        }
        if ($count['status'] !== 'approved') {
            Response::error("Count must be in 'approved' status to apply; current: {$count['status']}", 409);
        }

        $items = $db->prepare("
            SELECT ici.id AS item_id, ici.medicine_id, ici.batch_id,
                   ici.expected_qty, ici.counted_qty,
                   m.name AS medicine_name
            FROM inventory_count_items ici
            JOIN medicines m ON m.id = ici.medicine_id
            WHERE ici.count_id = ? AND ici.counted_qty IS NOT NULL
        ");
        $items->execute([$countId]);
        $allItems = $items->fetchAll();

        Database::beginTransaction();
        try {
            // Lock the count row to prevent concurrent double-apply
            $db->prepare("SELECT id FROM inventory_counts WHERE id = ? FOR UPDATE")->execute([$countId]);
            $recheckStmt = $db->prepare("SELECT status FROM inventory_counts WHERE id = ?");
            $recheckStmt->execute([$countId]);
            if ($recheckStmt->fetchColumn() !== 'approved') {
                Database::rollBack();
                Response::error('Count was already applied or changed; please refresh', 409);
            }

            $adjNum           = 0;
            $movementWarnings = [];

            foreach ($allItems as $item) {
                // Always lock the batch with FOR UPDATE (prevents TOCTOU on concurrent applies)
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
                    $batchStmt->execute([(int)$item['medicine_id']]);
                    $b = $batchStmt->fetch();
                    $before  = $b ? (int)$b['quantity'] : 0;
                    $batchId = $b ? (int)$b['id'] : null;
                }

                // Movement warning: stock changed since snapshot (sale, purchase, or other adjustment)
                $movementSinceSnapshot = $before - (int)$item['expected_qty'];
                if ($movementSinceSnapshot !== 0) {
                    $movementWarnings[] = [
                        'medicine'                => $item['medicine_name'],
                        'expected_at_snapshot'    => $item['expected_qty'],
                        'current_before_apply'    => $before,
                        'counted'                 => $item['counted_qty'],
                        'movement_since_snapshot' => $movementSinceSnapshot,
                    ];
                }

                // Physical discrepancy: counted vs current locked stock (not vs snapshot)
                // Optimistic model: a sale of 10 after snapshot means expected=100, current=90, counted=90 → no error
                $actualDiff = (int)$item['counted_qty'] - $before;
                if ($actualDiff === 0) {
                    // Counted matches current stock — no inventory discrepancy
                    continue;
                }
                if ($actualDiff < 0 && !$batchId) {
                    // Nothing to reduce
                    continue;
                }

                $after = max(0, $before + $actualDiff);

                if ($batchId) {
                    $db->prepare("UPDATE medicine_batches SET quantity = ? WHERE id = ?")->execute([$after, $batchId]);
                }

                // INSERT with TEMP reference, then update to atomic reference from lastInsertId
                $idemKey = "CNT-{$countId}-ITEM-{$item['item_id']}";
                $db->prepare("
                    INSERT INTO inventory_adjustments
                        (reference_number, medicine_id, batch_id, user_id, type,
                         quantity_before, quantity_change, quantity_after, reason, notes,
                         idempotency_key, source_count_id)
                    VALUES ('TEMP', ?, ?, ?, 'correction', ?, ?, ?, ?, '', ?, ?)
                ")->execute([
                    (int)$item['medicine_id'],
                    $batchId,
                    $user['id'],
                    $before,
                    $actualDiff,
                    $after,
                    "Inventory count #{$count['count_number']}",
                    $idemKey,
                    $countId,
                ]);
                $adjId  = (int)$db->lastInsertId();
                $refNum = 'CNT-ADJ-' . date('Ymd') . '-' . str_pad((string)$adjId, 4, '0', STR_PAD_LEFT);
                $db->prepare("UPDATE inventory_adjustments SET reference_number = ? WHERE id = ?")->execute([$refNum, $adjId]);
                $adjNum++;
            }

            $db->prepare("UPDATE inventory_counts SET status='applied', applied_by=?, applied_at=NOW() WHERE id=?")
               ->execute([$user['id'], $countId]);

            Database::commit();
        } catch (Exception $e) {
            Database::rollBack();
            if (str_contains($e->getMessage(), 'uk_ia_idempotency')) {
                Response::error('Count was already applied (duplicate idempotency key)', 409);
            }
            Response::error('Apply failed: ' . $e->getMessage(), 500);
        }

        Logger::activity($user['id'], 'apply', 'inventory_counts', $countId,
            "Applied count #{$count['count_number']}, {$adjNum} adjustments");
        Response::success([
            'adjustments_made'  => $adjNum,
            'movement_warnings' => $movementWarnings,
        ], 'Count applied successfully');
    }

    public function destroy(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'inventory.count');

        $countId = (int)$params['id'];
        $db      = Database::getInstance();
        $count   = $this->getCount($db, $countId);
        if (!$count) {
            Response::notFound('Count not found');
        }
        if ($count['status'] !== 'draft') {
            Response::error('Only draft counts can be deleted', 409);
        }

        $db->prepare("DELETE FROM inventory_counts WHERE id = ?")->execute([$countId]);
        Response::success(null, 'Count deleted');
    }

    // ── helpers ────────────────────────────────────────────────────────────────

    private function getCount(PDO $db, int $id): array|false
    {
        $stmt = $db->prepare("SELECT id, count_number, status FROM inventory_counts WHERE id = ?");
        $stmt->execute([$id]);
        return $stmt->fetch();
    }

    private function transition(array $params, string $fromStatus, string $toStatus, string $permission, callable $fn): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, $permission);

        $countId = (int)$params['id'];
        $db      = Database::getInstance();
        $count   = $this->getCount($db, $countId);
        if (!$count) {
            Response::notFound('Count not found');
        }
        if ($count['status'] !== $fromStatus) {
            Response::error("Count must be in '{$fromStatus}' status; current: {$count['status']}", 409);
        }

        $fn($db, $countId, $user);
        Response::success(['status' => $toStatus]);
    }
}
