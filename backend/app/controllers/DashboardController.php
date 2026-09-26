<?php

declare(strict_types=1);

class DashboardController
{
    public function index(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'dashboard.view');

        $db  = Database::getInstance();
        $now = date('Y-m-d');

        // Today's sales
        $todaySales = $db->query("
            SELECT COALESCE(SUM(total),0) as revenue, COUNT(*) as count
            FROM sales WHERE DATE(sale_date) = CURDATE() AND status = 'completed'
        ")->fetch();

        // Today's purchases
        $todayPurchases = $db->query("
            SELECT COALESCE(SUM(total),0) as amount, COUNT(*) as count
            FROM purchases WHERE DATE(purchase_date) = CURDATE() AND status = 'received'
        ")->fetch();

        // Today's profit (revenue - cost of goods sold)
        $todayProfit = $db->query("
            SELECT COALESCE(SUM(si.quantity * mb.purchase_price), 0) as cost
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            LEFT JOIN medicine_batches mb ON mb.id = si.batch_id
            WHERE DATE(s.sale_date) = CURDATE() AND s.status = 'completed'
        ")->fetch();

        $profit = (float)$todaySales['revenue'] - (float)($todayProfit['cost'] ?? 0);

        // Monthly sales (current month)
        $monthlySales = $db->query("
            SELECT COALESCE(SUM(total),0) as revenue, COUNT(*) as count
            FROM sales
            WHERE YEAR(sale_date) = YEAR(CURDATE())
              AND MONTH(sale_date) = MONTH(CURDATE())
              AND status = 'completed'
        ")->fetch();

        // Low stock medicines — only medicines with actual inventory activity
        $lowStock = $db->query("
            SELECT COUNT(DISTINCT m.id) as count
            FROM medicines m
            WHERE m.is_active = 1
              AND (SELECT COALESCE(SUM(b.quantity), 0) FROM medicine_batches b WHERE b.medicine_id = m.id AND b.quantity > 0 AND b.expiry_date >= CURDATE()) <= m.minimum_stock
              AND (
                  EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.medicine_id = m.id)
                  OR EXISTS (SELECT 1 FROM sale_items si WHERE si.medicine_id = m.id)
                  OR EXISTS (SELECT 1 FROM medicine_batches mb WHERE mb.medicine_id = m.id)
              )
        ")->fetchColumn();

        // Expired medicines
        $expired = $db->query("
            SELECT COUNT(DISTINCT medicine_id) as count
            FROM medicine_batches
            WHERE expiry_date < CURDATE() AND quantity > 0
        ")->fetchColumn();

        // Near expiry (within 30 days)
        $nearExpiry = $db->query("
            SELECT COUNT(DISTINCT medicine_id) as count
            FROM medicine_batches
            WHERE expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
              AND quantity > 0
        ")->fetchColumn();

        // Total customers
        $totalCustomers = $db->query("SELECT COUNT(*) FROM customers WHERE is_active = 1")->fetchColumn();

        // Total medicines
        $totalMedicines = $db->query("SELECT COUNT(*) FROM medicines WHERE is_active = 1")->fetchColumn();

        // Recent sales (last 10)
        $recentSales = $db->query("
            SELECT s.id, s.invoice_number, s.total, s.payment_method, s.sale_date,
                   s.status, c.name as customer_name, u.name as cashier_name
            FROM sales s
            LEFT JOIN customers c ON c.id = s.customer_id
            LEFT JOIN users u ON u.id = s.user_id
            ORDER BY s.created_at DESC
            LIMIT 10
        ")->fetchAll();

        // Unread notifications count
        $notifCount = $db->query("SELECT COUNT(*) FROM notifications WHERE is_read = 0")->fetchColumn();

        // Today's expenses (v3)
        $todayExpenses = 0;
        try {
            $expRow = $db->query("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE expense_date = CURDATE()");
            $todayExpenses = (float)$expRow->fetchColumn();
        } catch (Exception $e) {}

        // Net profit = revenue - COGS - expenses
        $netProfit = round($profit - $todayExpenses, 3);

        // Active shift for current user (v3)
        $activeShift = null;
        try {
            $shiftRow = $db->prepare("SELECT id, opening_cash, opened_at FROM shifts WHERE user_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1");
            $shiftRow->execute([$user['id']]);
            $activeShift = $shiftRow->fetch() ?: null;
        } catch (Exception $e) {}

        // Pending supplier payments — use suppliers.balance (updated by payments)
        $pendingPayments = 0;
        try {
            $pendingPayments = $db->query("SELECT COALESCE(SUM(balance),0) FROM suppliers WHERE balance > 0")->fetchColumn();
        } catch (Exception $e) {}

        // Outstanding customer balances (balance < 0 means customer owes money)
        $outstandingCustomers = 0;
        try {
            $outstandingCustomers = $db->query("SELECT COALESCE(SUM(balance),0) FROM customers WHERE balance < 0")->fetchColumn();
        } catch (Exception $e) {}

        Response::success([
            'today_sales'           => $todaySales,
            'today_purchases'       => $todayPurchases,
            'today_profit'          => round($profit, 3),
            'today_expenses'        => round($todayExpenses, 3),
            'net_profit'            => $netProfit,
            'monthly_sales'         => $monthlySales,
            'low_stock_count'       => (int)$lowStock,
            'expired_count'         => (int)$expired,
            'near_expiry_count'     => (int)$nearExpiry,
            'total_customers'       => (int)$totalCustomers,
            'total_medicines'       => (int)$totalMedicines,
            'recent_sales'          => $recentSales,
            'notifications_count'   => (int)$notifCount,
            'active_shift'          => $activeShift,
            'pending_payments'      => round((float)$pendingPayments, 3),
            'outstanding_customers' => round((float)$outstandingCustomers, 3),
        ]);
    }

    public function charts(array $params): void
    {
        $user = AuthMiddleware::handle();
        AuthMiddleware::require($user, 'dashboard.view');

        $db = Database::getInstance();

        // Last 12 months sales chart
        $monthlySalesChart = $db->query("
            SELECT
                DATE_FORMAT(sale_date, '%Y-%m') as month,
                DATE_FORMAT(sale_date, '%b %Y') as label,
                COALESCE(SUM(total), 0) as revenue,
                COUNT(*) as count
            FROM sales
            WHERE sale_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
              AND status = 'completed'
            GROUP BY DATE_FORMAT(sale_date, '%Y-%m')
            ORDER BY month ASC
        ")->fetchAll();

        // Last 12 months purchases chart
        $monthlyPurchasesChart = $db->query("
            SELECT
                DATE_FORMAT(purchase_date, '%Y-%m') as month,
                DATE_FORMAT(purchase_date, '%b %Y') as label,
                COALESCE(SUM(total), 0) as amount
            FROM purchases
            WHERE purchase_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
              AND status = 'received'
            GROUP BY DATE_FORMAT(purchase_date, '%Y-%m')
            ORDER BY month ASC
        ")->fetchAll();

        // Top 10 selling medicines
        $topMedicines = $db->query("
            SELECT m.name, m.name_ar, SUM(si.quantity) as total_qty, SUM(si.subtotal) as total_revenue
            FROM sale_items si
            JOIN medicines m ON m.id = si.medicine_id
            JOIN sales s ON s.id = si.sale_id
            WHERE s.status = 'completed'
              AND s.sale_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            GROUP BY si.medicine_id
            ORDER BY total_qty DESC
            LIMIT 10
        ")->fetchAll();

        // Sales by payment method (current month)
        $paymentMethodStats = $db->query("
            SELECT payment_method, COUNT(*) as count, SUM(total) as total
            FROM sales
            WHERE MONTH(sale_date) = MONTH(CURDATE())
              AND YEAR(sale_date) = YEAR(CURDATE())
              AND status = 'completed'
            GROUP BY payment_method
        ")->fetchAll();

        // Category distribution
        $categoryStats = $db->query("
            SELECT c.name, COUNT(m.id) as medicine_count
            FROM categories c
            LEFT JOIN medicines m ON m.category_id = c.id AND m.is_active = 1
            GROUP BY c.id
            ORDER BY medicine_count DESC
            LIMIT 8
        ")->fetchAll();

        // Daily sales for current month
        $dailySales = $db->query("
            SELECT
                DAY(sale_date) as day,
                COALESCE(SUM(total), 0) as revenue,
                COUNT(*) as count
            FROM sales
            WHERE YEAR(sale_date) = YEAR(CURDATE())
              AND MONTH(sale_date) = MONTH(CURDATE())
              AND status = 'completed'
            GROUP BY DAY(sale_date)
            ORDER BY day ASC
        ")->fetchAll();

        Response::success([
            'monthly_sales'          => $monthlySalesChart,
            'monthly_purchases'      => $monthlyPurchasesChart,
            'top_medicines'          => $topMedicines,
            'payment_methods'        => $paymentMethodStats,
            'category_distribution'  => $categoryStats,
            'daily_sales'            => $dailySales,
        ]);
    }
}
