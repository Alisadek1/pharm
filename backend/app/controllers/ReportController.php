<?php

declare(strict_types=1);

class ReportController
{
    public function dailySales(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'reports.view');

        $db       = Database::getInstance();
        $dateFrom = $_GET['date_from'] ?? date('Y-m-01');
        $dateTo   = $_GET['date_to'] ?? date('Y-m-d');

        // Daily rows
        $rowsStmt = $db->prepare("
            SELECT DATE(sale_date) as date,
                   COUNT(*) as invoices,
                   (SELECT COUNT(*) FROM sale_items si2 JOIN sales s2 ON s2.id=si2.sale_id
                    WHERE DATE(s2.sale_date)=DATE(s.sale_date) AND s2.status='completed') as items_sold,
                   COALESCE(SUM(total),0) as revenue,
                   COALESCE(SUM(discount_amount),0) as discount,
                   COALESCE(SUM(tax_amount),0) as tax,
                   COALESCE(SUM(total - discount_amount - tax_amount),0) as profit
            FROM sales s
            WHERE DATE(sale_date) BETWEEN ? AND ? AND status = 'completed'
            GROUP BY DATE(sale_date)
            ORDER BY date ASC
        ");
        $rowsStmt->execute([$dateFrom, $dateTo]);
        $rows = $rowsStmt->fetchAll();

        // Summary
        $sumStmt = $db->prepare("
            SELECT COUNT(*) as total_sales,
                   COALESCE(SUM(total),0) as revenue,
                   COALESCE(SUM(total-discount_amount-tax_amount),0) as profit,
                   (SELECT COUNT(*) FROM returns r WHERE DATE(r.created_at) BETWEEN ? AND ?) as returns
            FROM sales WHERE DATE(sale_date) BETWEEN ? AND ? AND status='completed'
        ");
        $sumStmt->execute([$dateFrom, $dateTo, $dateFrom, $dateTo]);
        $summary = $sumStmt->fetch();

        // Chart data
        $chart = array_map(fn($r) => ['date' => $r['date'], 'revenue' => (float)$r['revenue']], $rows);

        Response::success(compact('summary', 'rows', 'chart'));
    }

    public function monthlySales(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'reports.view');

        $db       = Database::getInstance();
        $dateFrom = $_GET['date_from'] ?? date('Y-01-01');
        $dateTo   = $_GET['date_to'] ?? date('Y-m-d');

        // Monthly rows
        $rowsStmt = $db->prepare("
            SELECT DATE_FORMAT(sale_date,'%Y-%m') as month,
                   COUNT(*) as invoices,
                   COALESCE(SUM(total),0) as revenue,
                   COALESCE(SUM(si_cost.cost),0) as cost,
                   COALESCE(SUM(total),0) - COALESCE(SUM(si_cost.cost),0) as profit,
                   CASE WHEN COALESCE(SUM(total),0) > 0
                        THEN ROUND((COALESCE(SUM(total),0) - COALESCE(SUM(si_cost.cost),0)) / COALESCE(SUM(total),0) * 100, 2)
                        ELSE 0 END as margin
            FROM sales s
            LEFT JOIN (
                SELECT si.sale_id, SUM(si.quantity * COALESCE(mb.purchase_price, m.purchase_price)) as cost
                FROM sale_items si
                JOIN medicines m ON m.id = si.medicine_id
                LEFT JOIN medicine_batches mb ON mb.id = si.batch_id
                GROUP BY si.sale_id
            ) si_cost ON si_cost.sale_id = s.id
            WHERE DATE(sale_date) BETWEEN ? AND ? AND s.status = 'completed'
            GROUP BY DATE_FORMAT(sale_date,'%Y-%m')
            ORDER BY month ASC
        ");
        $rowsStmt->execute([$dateFrom, $dateTo]);
        $rows = $rowsStmt->fetchAll();

        $sumStmt = $db->prepare("
            SELECT COUNT(*) as total_sales, COALESCE(SUM(total),0) as revenue,
                   COALESCE(SUM(total),0) - COALESCE(SUM(si_cost.cost),0) as profit
            FROM sales s
            LEFT JOIN (
                SELECT si.sale_id, SUM(si.quantity * COALESCE(mb.purchase_price, m.purchase_price)) as cost
                FROM sale_items si JOIN medicines m ON m.id = si.medicine_id
                LEFT JOIN medicine_batches mb ON mb.id = si.batch_id GROUP BY si.sale_id
            ) si_cost ON si_cost.sale_id = s.id
            WHERE DATE(sale_date) BETWEEN ? AND ? AND s.status='completed'
        ");
        $sumStmt->execute([$dateFrom, $dateTo]);
        $summary = $sumStmt->fetch();

        Response::success(compact('summary', 'rows'));
    }

    public function profit(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'reports.view');

        $db       = Database::getInstance();
        $dateFrom = $_GET['date_from'] ?? date('Y-m-01');
        $dateTo   = $_GET['date_to'] ?? date('Y-m-d');

        $stmt = $db->prepare("
            SELECT
                DATE(s.sale_date) as date,
                SUM(si.subtotal) as revenue,
                COALESCE(SUM(si.quantity * COALESCE(mb.purchase_price, m.purchase_price)), 0) as cost,
                SUM(si.subtotal) - COALESCE(SUM(si.quantity * COALESCE(mb.purchase_price, m.purchase_price)), 0) as profit
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
            JOIN medicines m ON m.id = si.medicine_id
            LEFT JOIN medicine_batches mb ON mb.id = si.batch_id
            WHERE DATE(s.sale_date) BETWEEN ? AND ?
            GROUP BY DATE(s.sale_date)
            ORDER BY date ASC
        ");
        $stmt->execute([$dateFrom, $dateTo]);
        $daily = $stmt->fetchAll();

        $summaryStmt = $db->prepare("
            SELECT
                COALESCE(SUM(si.subtotal), 0) as revenue,
                COALESCE(SUM(si.quantity * COALESCE(mb.purchase_price, m.purchase_price)), 0) as cost,
                COALESCE(SUM(si.subtotal), 0) - COALESCE(SUM(si.quantity * COALESCE(mb.purchase_price, m.purchase_price)), 0) as profit
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
            JOIN medicines m ON m.id = si.medicine_id
            LEFT JOIN medicine_batches mb ON mb.id = si.batch_id
            WHERE DATE(s.sale_date) BETWEEN ? AND ?
        ");
        $summaryStmt->execute([$dateFrom, $dateTo]);
        $s = $summaryStmt->fetch();
        $summary = [
            'revenue' => (float)$s['revenue'],
            'cost'    => (float)$s['cost'],
            'profit'  => (float)$s['profit'],
            'margin'  => $s['revenue'] > 0 ? round(($s['profit'] / $s['revenue']) * 100, 2) : 0,
        ];

        $rows = array_map(fn($r) => array_merge($r, [
            'margin' => $r['revenue'] > 0 ? round(($r['profit'] / $r['revenue']) * 100, 2) : 0
        ]), $daily);

        Response::success(compact('summary', 'rows'));
    }

    public function inventory(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'reports.view');

        $db   = Database::getInstance();
        $stmt = $db->query("
            SELECT m.id, m.name, m.name_ar, m.sku, m.barcode, m.unit,
                   m.purchase_price, m.selling_price, m.minimum_stock,
                   c.name as category_name,
                   COALESCE((SELECT SUM(b.quantity) FROM medicine_batches b
                             WHERE b.medicine_id = m.id AND b.quantity > 0 AND b.expiry_date >= CURDATE()), 0) as current_stock,
                   COALESCE((SELECT SUM(b.quantity * b.purchase_price) FROM medicine_batches b
                             WHERE b.medicine_id = m.id AND b.quantity > 0 AND b.expiry_date >= CURDATE()), 0) as stock_value
            FROM medicines m
            LEFT JOIN categories c ON c.id = m.category_id
            WHERE m.is_active = 1
            ORDER BY m.name ASC
        ");

        $rows    = $stmt->fetchAll();
        $summary = $db->query("
            SELECT
                COUNT(*) as total_skus,
                COALESCE(SUM(stock_val), 0) as total_value,
                SUM(CASE WHEN stock_val = 0 THEN 1 ELSE 0 END) as out_of_stock,
                SUM(CASE WHEN stock_val > 0 AND low_flag = 1 THEN 1 ELSE 0 END) as low_stock
            FROM (
                SELECT m.id,
                       COALESCE((SELECT SUM(b.quantity * b.purchase_price) FROM medicine_batches b
                                 WHERE b.medicine_id = m.id AND b.quantity > 0 AND b.expiry_date >= CURDATE()), 0) as stock_val,
                       CASE WHEN COALESCE((SELECT SUM(b.quantity) FROM medicine_batches b
                                 WHERE b.medicine_id = m.id AND b.quantity > 0 AND b.expiry_date >= CURDATE()), 0) <= m.minimum_stock
                            THEN 1 ELSE 0 END as low_flag
                FROM medicines m WHERE m.is_active = 1
            ) t
        ")->fetch();

        Response::success(compact('summary', 'rows'));
    }

    public function purchases(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'reports.view');

        $db         = Database::getInstance();
        $dateFrom   = $_GET['date_from'] ?? date('Y-m-01');
        $dateTo     = $_GET['date_to'] ?? date('Y-m-d');
        $supplierId = (int)($_GET['supplier_id'] ?? 0);

        $where = ['DATE(p.purchase_date) BETWEEN ? AND ? AND p.status = ?'];
        $binds = [$dateFrom, $dateTo, 'received'];

        if ($supplierId > 0) {
            $where[] = 'p.supplier_id = ?';
            $binds[] = $supplierId;
        }

        $whereStr = implode(' AND ', $where);
        $stmt     = $db->prepare("
            SELECT p.*, s.name as supplier_name, u.name as created_by_name
            FROM purchases p
            LEFT JOIN suppliers s ON s.id = p.supplier_id
            LEFT JOIN users u ON u.id = p.user_id
            WHERE {$whereStr}
            ORDER BY p.purchase_date DESC
        ");
        $stmt->execute($binds);

        $summary = $db->prepare("
            SELECT COUNT(*) as total_orders, COALESCE(SUM(total), 0) as total_amount,
                   COALESCE(SUM(paid_amount), 0) as total_paid, COALESCE(SUM(due_amount), 0) as total_due
            FROM purchases p WHERE {$whereStr}
        ");
        $summary->execute($binds);

        $summary = $summary->fetch();
        $rows    = $stmt->fetchAll();
        Response::success(compact('summary', 'rows'));
    }

    public function returns(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'reports.view');

        $db       = Database::getInstance();
        $dateFrom = $_GET['date_from'] ?? date('Y-m-01');
        $dateTo   = $_GET['date_to'] ?? date('Y-m-d');
        $type     = trim($_GET['type'] ?? '');

        $where = ["DATE(r.created_at) BETWEEN '{$dateFrom}' AND '{$dateTo}'"];
        if ($type !== '') {
            $where[] = "r.type = '{$type}'";
        }
        $whereStr = implode(' AND ', $where);

        $stmt = $db->prepare("
            SELECT r.*, r.type as return_type, u.name as created_by_name FROM returns r
            LEFT JOIN users u ON u.id = r.user_id
            WHERE {$whereStr}
            ORDER BY r.created_at DESC
        ");
        $stmt->execute();
        $rows    = $stmt->fetchAll();
        $summary = ['total_returns' => count($rows), 'total_amount' => array_sum(array_column($rows, 'total_amount'))];

        Response::success(compact('summary', 'rows'));
    }

    public function cash(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'reports.view');

        $db   = Database::getInstance();
        $date = $_GET['date'] ?? date('Y-m-d');

        $stmt = $db->prepare("
            SELECT
                COALESCE(SUM(cash_amount), 0) as total_cash,
                COALESCE(SUM(visa_amount), 0) as total_visa,
                COALESCE(SUM(wallet_amount), 0) as total_wallet,
                COALESCE(SUM(change_amount), 0) as total_change,
                COALESCE(SUM(total), 0) as total_sales,
                COUNT(*) as invoice_count
            FROM sales
            WHERE DATE(sale_date) = ? AND status = 'completed'
        ");
        $stmt->execute([$date]);

        $row     = $stmt->fetch();
        $rows    = [['date' => $_GET['date'] ?? date('Y-m-d'), 'cash_in' => $row['total_sales'], 'cash_out' => 0, 'net' => $row['total_cash'] - $row['total_change']]];
        $summary = $row;
        Response::success(compact('summary', 'rows'));
    }

    public function supplier(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'reports.view');

        $db       = Database::getInstance();
        $dateFrom = $_GET['date_from'] ?? date('Y-m-01');
        $dateTo   = $_GET['date_to'] ?? date('Y-m-d');

        $stmt = $db->prepare("
            SELECT s.id, s.name, s.phone, s.email, s.balance,
                   COUNT(p.id) as transactions,
                   COALESCE(SUM(p.total), 0) as total_purchases,
                   COALESCE(SUM(p.paid_amount), 0) as paid_amount,
                   COALESCE(SUM(p.due_amount), 0) as total_due
            FROM suppliers s
            LEFT JOIN purchases p ON p.supplier_id = s.id AND DATE(p.purchase_date) BETWEEN ? AND ?
            GROUP BY s.id
            ORDER BY total_purchases DESC
        ");
        $stmt->execute([$dateFrom, $dateTo]);
        $rows    = $stmt->fetchAll();
        $summary = ['total_suppliers' => count($rows), 'total_purchases' => array_sum(array_column($rows, 'total_purchases')), 'total_due' => array_sum(array_column($rows, 'total_due'))];
        Response::success(compact('summary', 'rows'));
    }

    public function customer(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'reports.view');

        $db       = Database::getInstance();
        $dateFrom = $_GET['date_from'] ?? date('Y-m-01');
        $dateTo   = $_GET['date_to'] ?? date('Y-m-d');

        $stmt = $db->prepare("
            SELECT c.id, c.name, c.phone, c.email, c.loyalty_points, c.total_purchases,
                   COUNT(s.id) as visits,
                   COALESCE(SUM(s.total), 0) as total_purchases
            FROM customers c
            LEFT JOIN sales s ON s.customer_id = c.id
                AND DATE(s.sale_date) BETWEEN ? AND ? AND s.status = 'completed'
            GROUP BY c.id
            ORDER BY total_purchases DESC
        ");
        $stmt->execute([$dateFrom, $dateTo]);
        $rows    = $stmt->fetchAll();
        $summary = ['total_customers' => count($rows), 'total_revenue' => array_sum(array_column($rows, 'total_purchases'))];
        Response::success(compact('summary', 'rows'));
    }

    public function bestSelling(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'reports.view');

        $db       = Database::getInstance();
        $dateFrom = $_GET['date_from'] ?? date('Y-m-01');
        $dateTo   = $_GET['date_to'] ?? date('Y-m-d');
        $limit    = min(50, max(10, (int)($_GET['limit'] ?? 20)));

        $stmt = $db->prepare("
            SELECT m.id, m.name, m.name_ar, m.sku, m.unit, c.name as category,
                   SUM(si.quantity) as total_qty,
                   SUM(si.subtotal) as total_revenue,
                   COUNT(DISTINCT si.sale_id) as invoice_count
            FROM sale_items si
            JOIN medicines m ON m.id = si.medicine_id
            JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
            LEFT JOIN categories c ON c.id = m.category_id
            WHERE DATE(s.sale_date) BETWEEN ? AND ?
            GROUP BY si.medicine_id
            ORDER BY total_qty DESC
            LIMIT ?
        ");
        $stmt->execute([$dateFrom, $dateTo, $limit]);
        $rows    = $stmt->fetchAll();
        $summary = ['total_items' => count($rows), 'total_revenue' => array_sum(array_column($rows, 'total_revenue'))];
        foreach ($rows as $i => &$r) {
            $r['rank']          = $i + 1;
            $r['medicine_name'] = $r['name'];
            $r['total_sold']    = $r['total_qty'];
            $r['transactions']  = $r['invoice_count'];
            $r['revenue']       = $r['total_revenue'];
            $r['profit']        = null; // not calculated per-medicine in this report
        }
        Response::success(compact('summary', 'rows'));
    }

    public function slowMoving(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'reports.view');

        $db    = Database::getInstance();
        $days  = (int)($_GET['days'] ?? 30);
        $limit = min(50, max(10, (int)($_GET['limit'] ?? 20)));

        $stmt = $db->prepare("
            SELECT m.id, m.name, m.name_ar, m.sku,
                   c.name as category_name,
                   COALESCE((SELECT SUM(b.quantity) FROM medicine_batches b
                             WHERE b.medicine_id = m.id AND b.quantity > 0 AND b.expiry_date >= CURDATE()), 0) as current_stock,
                   COALESCE((SELECT SUM(si.quantity) FROM sale_items si
                              JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
                              WHERE si.medicine_id = m.id AND s.sale_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)), 0) as qty_sold
            FROM medicines m
            LEFT JOIN categories c ON c.id = m.category_id
            WHERE m.is_active = 1
            HAVING qty_sold < 5 AND current_stock > 0
            ORDER BY qty_sold ASC, current_stock DESC
            LIMIT ?
        ");
        $stmt->execute([$days, $limit]);
        $rows    = $stmt->fetchAll();
        $summary = ['total_items' => count($rows)];
        foreach ($rows as &$r) { $r['total_sold'] = $r['qty_sold']; $r['last_sold'] = null; $r['stock_value'] = (float)$r['current_stock'] * 0; }
        Response::success(compact('summary', 'rows'));
    }

    public function expired(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'reports.view');

        $db   = Database::getInstance();
        $stmt = $db->query("
            SELECT m.id, m.name as medicine_name, m.name_ar, m.sku, b.batch_number,
                   b.expiry_date, b.quantity, b.purchase_price,
                   b.quantity * b.purchase_price as loss_value,
                   DATEDIFF(CURDATE(), b.expiry_date) as days_expired,
                   s.name as supplier_name
            FROM medicine_batches b
            JOIN medicines m ON m.id = b.medicine_id
            LEFT JOIN suppliers s ON s.id = b.supplier_id
            WHERE b.expiry_date < CURDATE() AND b.quantity > 0
            ORDER BY b.expiry_date ASC
        ");

        $rows       = $stmt->fetchAll();
        $totalValue = array_sum(array_column($rows, 'loss_value'));
        $summary    = ['total_batches' => count($rows), 'total_loss' => round($totalValue, 3)];

        Response::success(compact('summary', 'rows'));
    }

    public function salesVat(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'reports.view');

        $db            = Database::getInstance();
        $dateFrom      = $_GET['date_from']      ?? date('Y-m-01');
        $dateTo        = $_GET['date_to']        ?? date('Y-m-d');
        $cashierId     = (int)($_GET['cashier_id']    ?? 0);
        $customerId    = (int)($_GET['customer_id']   ?? 0);
        $paymentMethod = trim($_GET['payment_method'] ?? '');

        $where  = ["DATE(s.sale_date) BETWEEN ? AND ?", "s.status = 'completed'"];
        $binds  = [$dateFrom, $dateTo];

        if ($cashierId > 0)     { $where[] = 's.user_id = ?';          $binds[] = $cashierId; }
        if ($customerId > 0)    { $where[] = 's.customer_id = ?';      $binds[] = $customerId; }
        if ($paymentMethod !== '') { $where[] = 's.payment_method = ?'; $binds[] = $paymentMethod; }

        $whereStr = implode(' AND ', $where);

        $rowsStmt = $db->prepare("
            SELECT
                s.invoice_number,
                COALESCE(c.name, 'Walk-in')          AS customer_name,
                DATE(s.sale_date)                    AS date,
                s.payment_method,
                COALESCE(u.name, '')                 AS cashier_name,
                ROUND(s.subtotal - s.discount_amount, 3)   AS total_before_vat,
                ROUND(s.tax_amount, 3)               AS vat_amount,
                ROUND(s.total, 3)                    AS total_including_vat,
                ROUND(s.tax_rate, 2)                 AS vat_rate
            FROM sales s
            LEFT JOIN customers c ON c.id = s.customer_id
            LEFT JOIN users u ON u.id = s.user_id
            WHERE {$whereStr}
            ORDER BY s.sale_date DESC
        ");
        $rowsStmt->execute($binds);
        $rows = $rowsStmt->fetchAll();

        $summaryStmt = $db->prepare("
            SELECT
                COUNT(*)                                       AS total_invoices,
                ROUND(SUM(s.subtotal - s.discount_amount), 3) AS total_before_vat,
                ROUND(SUM(s.tax_amount), 3)                   AS total_vat,
                ROUND(SUM(s.total), 3)                        AS grand_total
            FROM sales s
            WHERE {$whereStr}
        ");
        $summaryStmt->execute($binds);
        $summary = $summaryStmt->fetch();

        Response::success(compact('summary', 'rows'));
    }

    public function inventoryValue(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'reports.view');

        $db         = Database::getInstance();
        $catId      = (int)($_GET['category_id']  ?? 0);
        $supplierId = (int)($_GET['supplier_id']  ?? 0);
        $companyId  = (int)($_GET['company_id']   ?? 0);
        $lowStock   = (int)($_GET['low_stock']    ?? 0);

        $where = ['m.is_active = 1'];
        $binds = [];

        if ($catId > 0)      { $where[] = 'm.category_id = ?'; $binds[] = $catId; }
        if ($companyId > 0)  { $where[] = 'm.company_id = ?';  $binds[] = $companyId; }
        if ($supplierId > 0) {
            $where[] = 'EXISTS (SELECT 1 FROM medicine_batches mb WHERE mb.medicine_id = m.id AND mb.supplier_id = ?)';
            $binds[] = $supplierId;
        }

        $whereStr = implode(' AND ', $where);

        $stmt = $db->prepare("
            SELECT
                m.id, m.name, m.name_ar, m.barcode, m.sku, m.unit,
                m.purchase_price  AS pharmacist_price,
                m.selling_price,
                m.public_price,
                m.minimum_stock,
                c.name            AS category_name,
                co.name           AS company_name,
                COALESCE((
                    SELECT SUM(b.quantity)
                    FROM medicine_batches b
                    WHERE b.medicine_id = m.id AND b.quantity > 0 AND b.expiry_date >= CURDATE()
                ), 0)             AS current_stock,
                COALESCE((
                    SELECT SUM(b.quantity * m.selling_price)
                    FROM medicine_batches b
                    WHERE b.medicine_id = m.id AND b.quantity > 0 AND b.expiry_date >= CURDATE()
                ), 0)             AS total_value
            FROM medicines m
            LEFT JOIN categories c  ON c.id = m.category_id
            LEFT JOIN companies co  ON co.id = m.company_id
            WHERE {$whereStr}
            HAVING (? = 0 OR current_stock <= m.minimum_stock)
            ORDER BY total_value DESC
        ");
        $stmt->execute([...$binds, $lowStock]);
        $rows = $stmt->fetchAll();

        $summary = [
            'total_products'         => count($rows),
            'total_stock_qty'        => (int) array_sum(array_column($rows, 'current_stock')),
            'total_inventory_value'  => round(array_sum(array_column($rows, 'total_value')), 3),
        ];

        Response::success(compact('summary', 'rows'));
    }

    // Alias methods for renamed routes
    public function inventoryReport(array $params): void  { $this->inventory($params); }
    public function purchasesReport(array $params): void  { $this->purchases($params); }
    public function returnsReport(array $params): void    { $this->returns($params); }
    public function suppliers(array $params): void        { $this->supplier($params); }
    public function customers(array $params): void        { $this->customer($params); }
    public function expiredReport(array $params): void    { $this->expired($params); }

    // Dynamic dispatcher — resolves frontend type strings to methods
    public function dispatch(array $params): void
    {
        $type = $params['type'] ?? '';
        $map  = [
            'sales_daily'       => 'dailySales',
            'sales_monthly'     => 'monthlySales',
            'profit'            => 'profit',
            'inventory'         => 'inventoryReport',
            'purchases'         => 'purchasesReport',
            'returns'           => 'returnsReport',
            'cash'              => 'cash',
            'suppliers'         => 'suppliers',
            'customers'         => 'customers',
            'best_selling'      => 'bestSelling',
            'slow_moving'       => 'slowMoving',
            'expired'           => 'expiredReport',
            'sales_vat'         => 'salesVat',
            'inventory_value'   => 'inventoryValue',
        ];
        $method = $map[$type] ?? null;
        if (!$method) {
            Response::notFound("Unknown report type: {$type}");
        }
        $this->{$method}($params);
    }

    // Wrapper to normalise report responses into {summary, rows, chart} shape
    private function report(array $summary, array $rows, array $chart = []): void
    {
        Response::success(compact('summary', 'rows', 'chart'));
    }

    public function export(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'reports.view');

        $type     = $params['type'] ?? 'sales_daily';
        $dateFrom = $_GET['date_from'] ?? date('Y-m-01');
        $dateTo   = $_GET['date_to'] ?? date('Y-m-d');
        $db       = Database::getInstance();

        header('Content-Type: text/csv; charset=utf-8');
        header("Content-Disposition: attachment; filename=\"{$type}-report-{$dateFrom}-{$dateTo}.csv\"");
        // BOM for Excel Arabic support
        echo "\xEF\xBB\xBF";

        $out = fopen('php://output', 'w');

        switch ($type) {
            case 'sales_daily':
            case 'sales':
                fputcsv($out, ['Invoice', 'Date', 'Customer', 'Cashier', 'Subtotal', 'Discount', 'Tax', 'Total', 'Payment', 'Status']);
                $stmt = $db->prepare("
                    SELECT s.invoice_number, DATE(s.sale_date), COALESCE(c.name,'Walk-in'), COALESCE(u.name,''),
                           s.subtotal, s.discount_amount, s.tax_amount, s.total, s.payment_method, s.status
                    FROM sales s
                    LEFT JOIN customers c ON c.id = s.customer_id
                    LEFT JOIN users u ON u.id = s.user_id
                    WHERE DATE(s.sale_date) BETWEEN ? AND ? AND s.status = 'completed'
                    ORDER BY s.sale_date ASC
                ");
                $stmt->execute([$dateFrom, $dateTo]);
                foreach ($stmt->fetchAll() as $row) fputcsv($out, $row);
                break;

            case 'sales_monthly':
                fputcsv($out, ['Month', 'Invoices', 'Revenue', 'Cost', 'Profit', 'Margin %']);
                $stmt = $db->prepare("
                    SELECT DATE_FORMAT(sale_date,'%Y-%m'),COUNT(*),COALESCE(SUM(total),0),
                           COALESCE(SUM(si_cost.cost),0),
                           COALESCE(SUM(total),0)-COALESCE(SUM(si_cost.cost),0),
                           ROUND(CASE WHEN SUM(total)>0 THEN (SUM(total)-COALESCE(SUM(si_cost.cost),0))/SUM(total)*100 ELSE 0 END,2)
                    FROM sales s
                    LEFT JOIN (SELECT si.sale_id, SUM(si.quantity*COALESCE(mb.purchase_price,m.purchase_price)) as cost
                               FROM sale_items si JOIN medicines m ON m.id=si.medicine_id
                               LEFT JOIN medicine_batches mb ON mb.id=si.batch_id GROUP BY si.sale_id) si_cost ON si_cost.sale_id=s.id
                    WHERE DATE(sale_date) BETWEEN ? AND ? AND s.status='completed'
                    GROUP BY DATE_FORMAT(sale_date,'%Y-%m') ORDER BY 1 ASC
                ");
                $stmt->execute([$dateFrom, $dateTo]);
                foreach ($stmt->fetchAll() as $row) fputcsv($out, $row);
                break;

            case 'profit':
                fputcsv($out, ['Date', 'Revenue', 'Cost', 'Profit', 'Margin %']);
                $stmt = $db->prepare("
                    SELECT DATE(s.sale_date), SUM(si.subtotal),
                           COALESCE(SUM(si.quantity*COALESCE(mb.purchase_price,m.purchase_price)),0),
                           SUM(si.subtotal)-COALESCE(SUM(si.quantity*COALESCE(mb.purchase_price,m.purchase_price)),0),
                           ROUND(CASE WHEN SUM(si.subtotal)>0 THEN (SUM(si.subtotal)-COALESCE(SUM(si.quantity*COALESCE(mb.purchase_price,m.purchase_price)),0))/SUM(si.subtotal)*100 ELSE 0 END,2)
                    FROM sale_items si JOIN sales s ON s.id=si.sale_id AND s.status='completed'
                    JOIN medicines m ON m.id=si.medicine_id LEFT JOIN medicine_batches mb ON mb.id=si.batch_id
                    WHERE DATE(s.sale_date) BETWEEN ? AND ?
                    GROUP BY DATE(s.sale_date) ORDER BY 1 ASC
                ");
                $stmt->execute([$dateFrom, $dateTo]);
                foreach ($stmt->fetchAll() as $row) fputcsv($out, $row);
                break;

            case 'inventory':
            case 'inventory_report':
                fputcsv($out, ['Name', 'Name (AR)', 'SKU', 'Category', 'Pharmacist Price', 'Public Price', 'Current Stock', 'Stock Value', 'Min Stock', 'Status']);
                $stmt = $db->query("
                    SELECT m.name, m.name_ar, m.sku, COALESCE(c.name,''), m.purchase_price, m.selling_price,
                           COALESCE((SELECT SUM(b.quantity) FROM medicine_batches b WHERE b.medicine_id=m.id AND b.quantity>0 AND b.expiry_date>=CURDATE()),0) as stk,
                           COALESCE((SELECT SUM(b.quantity*b.purchase_price) FROM medicine_batches b WHERE b.medicine_id=m.id AND b.quantity>0 AND b.expiry_date>=CURDATE()),0),
                           m.minimum_stock,
                           CASE WHEN COALESCE((SELECT SUM(b.quantity) FROM medicine_batches b WHERE b.medicine_id=m.id AND b.quantity>0 AND b.expiry_date>=CURDATE()),0) <= m.minimum_stock THEN 'Low' ELSE 'OK' END
                    FROM medicines m LEFT JOIN categories c ON c.id=m.category_id
                    WHERE m.is_active=1 ORDER BY m.name
                ");
                foreach ($stmt->fetchAll() as $row) fputcsv($out, $row);
                break;

            case 'inventory_value':
                fputcsv($out, ['Name', 'Name (AR)', 'SKU', 'Category', 'Company', 'Pharmacist Price', 'Public Price', 'Stock', 'Total Value']);
                $stmt = $db->query("
                    SELECT m.name, m.name_ar, m.sku, COALESCE(c.name,''), COALESCE(co.name,''),
                           m.purchase_price, m.selling_price,
                           COALESCE((SELECT SUM(b.quantity) FROM medicine_batches b WHERE b.medicine_id=m.id AND b.quantity>0 AND b.expiry_date>=CURDATE()),0),
                           COALESCE((SELECT SUM(b.quantity*m.selling_price) FROM medicine_batches b WHERE b.medicine_id=m.id AND b.quantity>0 AND b.expiry_date>=CURDATE()),0)
                    FROM medicines m LEFT JOIN categories c ON c.id=m.category_id LEFT JOIN companies co ON co.id=m.company_id
                    WHERE m.is_active=1 ORDER BY m.name
                ");
                foreach ($stmt->fetchAll() as $row) fputcsv($out, $row);
                break;

            case 'purchases':
            case 'purchases_report':
                fputcsv($out, ['Invoice', 'Date', 'Supplier', 'Total', 'Paid', 'Due', 'Status']);
                $stmt = $db->prepare("
                    SELECT p.invoice_number, DATE(p.purchase_date), COALESCE(s.name,''),
                           p.total, p.paid_amount, p.due_amount, p.status
                    FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id
                    WHERE DATE(p.purchase_date) BETWEEN ? AND ?
                    ORDER BY p.purchase_date ASC
                ");
                $stmt->execute([$dateFrom, $dateTo]);
                foreach ($stmt->fetchAll() as $row) fputcsv($out, $row);
                break;

            case 'returns':
            case 'returns_report':
                fputcsv($out, ['Return #', 'Type', 'Reference Invoice', 'Total', 'Reason', 'Date']);
                $stmt = $db->prepare("
                    SELECT CONCAT('RET-',LPAD(r.id,5,'0')), r.return_type, COALESCE(r.reference_invoice,''),
                           r.total_amount, r.reason, DATE(r.created_at)
                    FROM returns r WHERE DATE(r.created_at) BETWEEN ? AND ?
                    ORDER BY r.created_at ASC
                ");
                $stmt->execute([$dateFrom, $dateTo]);
                foreach ($stmt->fetchAll() as $row) fputcsv($out, $row);
                break;

            case 'suppliers':
                fputcsv($out, ['Supplier', 'Phone', 'Email', 'Transactions', 'Total Purchases', 'Paid', 'Due']);
                $stmt = $db->prepare("
                    SELECT s.name, COALESCE(s.phone,''), COALESCE(s.email,''),
                           COUNT(p.id), COALESCE(SUM(p.total),0), COALESCE(SUM(p.paid_amount),0), COALESCE(SUM(p.due_amount),0)
                    FROM suppliers s LEFT JOIN purchases p ON p.supplier_id=s.id AND DATE(p.purchase_date) BETWEEN ? AND ?
                    GROUP BY s.id ORDER BY s.name
                ");
                $stmt->execute([$dateFrom, $dateTo]);
                foreach ($stmt->fetchAll() as $row) fputcsv($out, $row);
                break;

            case 'customers':
                fputcsv($out, ['Customer', 'Phone', 'Email', 'Visits', 'Total Purchases', 'Loyalty Points']);
                $stmt = $db->prepare("
                    SELECT c.name, COALESCE(c.phone,''), COALESCE(c.email,''),
                           COUNT(s.id), COALESCE(SUM(s.total),0), c.loyalty_points
                    FROM customers c LEFT JOIN sales s ON s.customer_id=c.id
                         AND DATE(s.sale_date) BETWEEN ? AND ? AND s.status='completed'
                    GROUP BY c.id ORDER BY c.name
                ");
                $stmt->execute([$dateFrom, $dateTo]);
                foreach ($stmt->fetchAll() as $row) fputcsv($out, $row);
                break;

            case 'best_selling':
                fputcsv($out, ['Rank', 'Medicine', 'SKU', 'Category', 'Qty Sold', 'Revenue', 'Invoices']);
                $stmt = $db->prepare("
                    SELECT ROW_NUMBER() OVER (ORDER BY SUM(si.quantity) DESC),
                           m.name, m.sku, COALESCE(c.name,''),
                           SUM(si.quantity), SUM(si.subtotal), COUNT(DISTINCT si.sale_id)
                    FROM sale_items si JOIN medicines m ON m.id=si.medicine_id
                    JOIN sales s ON s.id=si.sale_id AND s.status='completed'
                    LEFT JOIN categories c ON c.id=m.category_id
                    WHERE DATE(s.sale_date) BETWEEN ? AND ?
                    GROUP BY si.medicine_id ORDER BY 5 DESC LIMIT 50
                ");
                $stmt->execute([$dateFrom, $dateTo]);
                foreach ($stmt->fetchAll() as $row) fputcsv($out, $row);
                break;

            case 'slow_moving':
                fputcsv($out, ['Medicine', 'SKU', 'Category', 'Current Stock', 'Qty Sold (30d)']);
                $stmt = $db->query("
                    SELECT m.name, m.sku, COALESCE(c.name,''),
                           COALESCE((SELECT SUM(b.quantity) FROM medicine_batches b WHERE b.medicine_id=m.id AND b.quantity>0 AND b.expiry_date>=CURDATE()),0),
                           COALESCE((SELECT SUM(si.quantity) FROM sale_items si JOIN sales s ON s.id=si.sale_id AND s.status='completed'
                                     WHERE si.medicine_id=m.id AND s.sale_date>=DATE_SUB(CURDATE(),INTERVAL 30 DAY)),0)
                    FROM medicines m LEFT JOIN categories c ON c.id=m.category_id WHERE m.is_active=1
                    HAVING 4 < 5 ORDER BY 5 ASC, 4 DESC LIMIT 50
                ");
                foreach ($stmt->fetchAll() as $row) fputcsv($out, $row);
                break;

            case 'expired':
                fputcsv($out, ['Medicine', 'Batch', 'Expiry Date', 'Days Expired', 'Qty', 'Pharmacist Price', 'Loss Value', 'Supplier']);
                $stmt = $db->query("
                    SELECT m.name, b.batch_number, b.expiry_date, DATEDIFF(CURDATE(),b.expiry_date),
                           b.quantity, b.purchase_price, b.quantity*b.purchase_price, COALESCE(s.name,'')
                    FROM medicine_batches b JOIN medicines m ON m.id=b.medicine_id
                    LEFT JOIN suppliers s ON s.id=b.supplier_id
                    WHERE b.expiry_date < CURDATE() AND b.quantity > 0
                    ORDER BY b.expiry_date ASC
                ");
                foreach ($stmt->fetchAll() as $row) fputcsv($out, $row);
                break;

            case 'sales_vat':
                fputcsv($out, ['Invoice', 'Date', 'Customer', 'Cashier', 'Payment', 'Before VAT', 'VAT Amount', 'Total incl. VAT', 'VAT Rate %']);
                $stmt = $db->prepare("
                    SELECT s.invoice_number, DATE(s.sale_date), COALESCE(c.name,'Walk-in'), COALESCE(u.name,''),
                           s.payment_method,
                           ROUND(s.subtotal-s.discount_amount,3), ROUND(s.tax_amount,3), ROUND(s.total,3), s.tax_rate
                    FROM sales s LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN users u ON u.id=s.user_id
                    WHERE DATE(s.sale_date) BETWEEN ? AND ? AND s.status='completed'
                    ORDER BY s.sale_date ASC
                ");
                $stmt->execute([$dateFrom, $dateTo]);
                foreach ($stmt->fetchAll() as $row) fputcsv($out, $row);
                break;

            case 'cash':
                fputcsv($out, ['Date', 'Total Sales', 'Cash', 'Visa', 'Wallet', 'Change', 'Invoices']);
                $stmt = $db->prepare("
                    SELECT DATE(sale_date), COALESCE(SUM(total),0), COALESCE(SUM(cash_amount),0),
                           COALESCE(SUM(visa_amount),0), COALESCE(SUM(wallet_amount),0),
                           COALESCE(SUM(change_amount),0), COUNT(*)
                    FROM sales WHERE DATE(sale_date) BETWEEN ? AND ? AND status='completed'
                    GROUP BY DATE(sale_date) ORDER BY 1 ASC
                ");
                $stmt->execute([$dateFrom, $dateTo]);
                foreach ($stmt->fetchAll() as $row) fputcsv($out, $row);
                break;

            default:
                fputcsv($out, ['No export available for this report type']);
        }

        fclose($out);
        exit;
    }
}
