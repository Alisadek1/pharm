<?php
/**
 * v3 migration runner — executed once via `railway run`.
 * Uses PDO (php8.2-mysql) — no mysql CLI needed.
 */

$host = getenv('DB_HOST') ?: '127.0.0.1';
$port = getenv('DB_PORT') ?: '3306';
$name = getenv('DB_NAME') ?: 'railway';
$user = getenv('DB_USER') ?: 'root';
$pass = getenv('DB_PASS') ?: '';

$dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";
$pdo = new PDO($dsn, $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

echo "Connected to {$name}@{$host}:{$port}\n";

// ── 1. Tables ────────────────────────────────────────────────────────────────
$stmts = [
"CREATE TABLE IF NOT EXISTS `expense_categories` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`       VARCHAR(100) NOT NULL,
  `name_ar`    VARCHAR(100),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS `shifts` (
  `id`             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`        INT UNSIGNED NOT NULL,
  `opened_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `closed_at`      DATETIME,
  `closed_by`      INT UNSIGNED,
  `opening_cash`   DECIMAL(12,3) NOT NULL DEFAULT 0,
  `closing_cash`   DECIMAL(12,3),
  `sales_total`    DECIMAL(12,3) NOT NULL DEFAULT 0,
  `expenses_total` DECIMAL(12,3) NOT NULL DEFAULT 0,
  `status`         ENUM('open','closed') NOT NULL DEFAULT 'open',
  `notes`          TEXT,
  `created_at`     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS `expenses` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `category_id`     INT UNSIGNED NOT NULL,
  `shift_id`        INT UNSIGNED,
  `user_id`         INT UNSIGNED NOT NULL,
  `amount`          DECIMAL(12,3) NOT NULL,
  `expense_date`    DATE NOT NULL,
  `payment_method`  ENUM('cash','visa','bank_transfer') NOT NULL DEFAULT 'cash',
  `notes`           TEXT,
  `created_at`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS `medicine_price_history` (
  `id`                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `medicine_id`       INT UNSIGNED NOT NULL,
  `old_purchase_price` DECIMAL(12,3),
  `new_purchase_price` DECIMAL(12,3),
  `old_public_price`   DECIMAL(12,3),
  `new_public_price`   DECIMAL(12,3),
  `changed_by`         INT UNSIGNED,
  `reason`             TEXT,
  `created_at`         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
];

foreach ($stmts as $sql) {
    $pdo->exec($sql);
    echo "  OK: " . substr(trim($sql), 0, 60) . "...\n";
}

// ── 2. ALTER TABLE sales — add shift_id if missing ───────────────────────────
$cols = $pdo->query("SHOW COLUMNS FROM sales LIKE 'shift_id'")->fetchAll();
if (!$cols) {
    $pdo->exec("ALTER TABLE sales ADD COLUMN `shift_id` INT UNSIGNED DEFAULT NULL AFTER `id`");
    echo "  OK: ALTER TABLE sales ADD COLUMN shift_id\n";
} else {
    echo "  SKIP: sales.shift_id already exists\n";
}

// ── 3. Seed expense categories ───────────────────────────────────────────────
$cats = [
    ['Rent',           'إيجار'],
    ['Utilities',      'مرافق'],
    ['Salaries',       'رواتب'],
    ['Maintenance',    'صيانة'],
    ['Office Supplies','مستلزمات مكتبية'],
    ['Marketing',      'تسويق'],
    ['Transport',      'نقل وتوصيل'],
    ['Other',          'أخرى'],
];
$ins = $pdo->prepare("INSERT IGNORE INTO expense_categories (name, name_ar) VALUES (?, ?)");
foreach ($cats as [$en, $ar]) {
    $ins->execute([$en, $ar]);
}
echo "  OK: seeded expense_categories\n";

// ── 4. Seed permissions ──────────────────────────────────────────────────────
$perms = [
    ['expenses.view',   'View Expenses'],
    ['expenses.create', 'Create Expenses'],
    ['expenses.edit',   'Edit Expenses'],
    ['expenses.delete', 'Delete Expenses'],
    ['shifts.view',     'View Shifts'],
    ['shifts.manage',   'Open & Close Shifts'],
];
// Check if description column exists
$cols = array_column($pdo->query("SHOW COLUMNS FROM permissions")->fetchAll(PDO::FETCH_ASSOC), 'Field');
if (in_array('description', $cols)) {
    $insPerm = $pdo->prepare("INSERT IGNORE INTO permissions (name, description) VALUES (?, ?)");
    foreach ($perms as [$name_, $desc]) { $insPerm->execute([$name_, $desc]); }
} else {
    $insPerm = $pdo->prepare("INSERT IGNORE INTO permissions (name) VALUES (?)");
    foreach ($perms as [$name_, $desc]) { $insPerm->execute([$name_]); }
}
echo "  OK: seeded permissions\n";

// ── 5. Grant to roles ────────────────────────────────────────────────────────
$rolePerms = [
    ['owner',      'expenses.view'],
    ['owner',      'expenses.create'],
    ['owner',      'expenses.edit'],
    ['owner',      'expenses.delete'],
    ['owner',      'shifts.view'],
    ['owner',      'shifts.manage'],
    ['admin',      'expenses.view'],
    ['admin',      'expenses.create'],
    ['admin',      'expenses.edit'],
    ['admin',      'expenses.delete'],
    ['admin',      'shifts.view'],
    ['admin',      'shifts.manage'],
    ['pharmacist', 'expenses.view'],
    ['pharmacist', 'expenses.create'],
    ['pharmacist', 'shifts.view'],
    ['cashier',    'expenses.view'],
    ['cashier',    'expenses.create'],
    ['cashier',    'shifts.view'],
];

$getRoleId = $pdo->prepare("SELECT id FROM roles WHERE name = ?");
$getPermId = $pdo->prepare("SELECT id FROM permissions WHERE name = ?");
$insRP     = $pdo->prepare("INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)");

foreach ($rolePerms as [$role, $perm]) {
    $getRoleId->execute([$role]);
    $rId = $getRoleId->fetchColumn();
    $getPermId->execute([$perm]);
    $pId = $getPermId->fetchColumn();
    if ($rId && $pId) $insRP->execute([$rId, $pId]);
}
echo "  OK: granted role_permissions\n";

echo "\nv3 migration complete!\n";
