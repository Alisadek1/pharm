<?php
// PharmaCare v2.0 Database Migration — run once then delete.
declare(strict_types=1);

$envFile = dirname(__DIR__) . '/.env';
if (file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (str_starts_with(trim($line), '#') || !str_contains($line, '=')) continue;
        [$k, $v] = explode('=', $line, 2);
        $_ENV[trim($k)] = trim($v);
    }
}

require dirname(__DIR__) . '/config/database.php';
$db = Database::getInstance();

$migrations = [
    "CREATE TABLE IF NOT EXISTS supplier_payments (
        id INT PRIMARY KEY AUTO_INCREMENT,
        supplier_id INT NOT NULL,
        user_id INT NOT NULL,
        amount DECIMAL(10,3) NOT NULL,
        payment_date DATE NOT NULL,
        payment_method VARCHAR(50) DEFAULT 'cash',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_supplier (supplier_id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

    "ALTER TABLE purchase_items
        ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER public_price,
        ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10,3) NOT NULL DEFAULT 0 AFTER tax_rate,
        ADD COLUMN IF NOT EXISTS remaining_quantity INT NOT NULL DEFAULT 0 AFTER tax_amount",

    "UPDATE purchase_items SET remaining_quantity = quantity WHERE remaining_quantity = 0",

    "ALTER TABLE return_items ADD COLUMN IF NOT EXISTS purchase_item_id INT NULL AFTER batch_id",
];

header('Content-Type: application/json');
$results = [];
foreach ($migrations as $i => $sql) {
    try {
        $db->exec($sql);
        $results[] = ['step' => $i + 1, 'status' => 'OK'];
    } catch (\Exception $e) {
        $results[] = ['step' => $i + 1, 'status' => 'ERROR', 'message' => $e->getMessage()];
    }
}
echo json_encode(['ok' => true, 'results' => $results], JSON_PRETTY_PRINT);
