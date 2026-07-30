-- PharmaCare v3.0 Migration
-- Safe to run multiple times (CREATE TABLE IF NOT EXISTS + INSERT IGNORE)
-- Run once against the pharmacy database before deploying v3.0

-- ============================================================
-- 1. Expense Categories
-- ============================================================
CREATE TABLE IF NOT EXISTS `expense_categories` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `name_ar` VARCHAR(100) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `expense_categories` (`id`, `name`, `name_ar`) VALUES
(1, 'Salaries',           'الرواتب'),
(2, 'Rent',               'الإيجار'),
(3, 'Electricity',        'الكهرباء'),
(4, 'Internet & Utilities','الإنترنت والمرافق'),
(5, 'Maintenance',        'الصيانة'),
(6, 'Transportation',     'المواصلات'),
(7, 'Office Supplies',    'المستلزمات المكتبية'),
(8, 'Miscellaneous',      'متنوع');

-- ============================================================
-- 2. Shifts
-- ============================================================
CREATE TABLE IF NOT EXISTS `shifts` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `opening_cash` DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `closing_cash` DECIMAL(12,3) DEFAULT NULL,
  `cash_sales` DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `card_sales` DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `wallet_sales` DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `refunds_total` DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `expenses_total` DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `notes` TEXT DEFAULT NULL,
  `sales_total` DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `status` ENUM('open','closed') NOT NULL DEFAULT 'open',
  `opened_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `closed_at` TIMESTAMP NULL DEFAULT NULL,
  `closed_by` INT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_shifts_user` (`user_id`),
  KEY `idx_shifts_status` (`status`),
  CONSTRAINT `fk_shifts_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_shifts_closed_by` FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. Expenses
-- ============================================================
CREATE TABLE IF NOT EXISTS `expenses` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `category_id` INT UNSIGNED NOT NULL,
  `amount` DECIMAL(12,3) NOT NULL,
  `expense_date` DATE NOT NULL,
  `payment_method` ENUM('cash','visa','bank_transfer') NOT NULL DEFAULT 'cash',
  `notes` TEXT DEFAULT NULL,
  `created_by` INT UNSIGNED NOT NULL,
  `shift_id` INT UNSIGNED DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_expenses_date` (`expense_date`),
  KEY `idx_expenses_category` (`category_id`),
  KEY `idx_expenses_shift` (`shift_id`),
  CONSTRAINT `fk_expenses_category` FOREIGN KEY (`category_id`) REFERENCES `expense_categories`(`id`),
  CONSTRAINT `fk_expenses_user` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. Medicine Price History
-- ============================================================
CREATE TABLE IF NOT EXISTS `medicine_price_history` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `medicine_id` INT UNSIGNED NOT NULL,
  `old_purchase_price` DECIMAL(10,3) DEFAULT NULL,
  `new_purchase_price` DECIMAL(10,3) DEFAULT NULL,
  `old_public_price` DECIMAL(10,3) DEFAULT NULL,
  `new_public_price` DECIMAL(10,3) DEFAULT NULL,
  `changed_by` INT UNSIGNED NOT NULL,
  `reason` VARCHAR(255) DEFAULT NULL,
  `changed_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_price_history_medicine` (`medicine_id`),
  CONSTRAINT `fk_price_history_medicine` FOREIGN KEY (`medicine_id`) REFERENCES `medicines`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_price_history_user` FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. Add shift_id to sales table (skipped if already exists)
-- ============================================================
DROP PROCEDURE IF EXISTS `pharm_v3_migrate`;
DELIMITER $$
CREATE PROCEDURE `pharm_v3_migrate`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sales'
      AND COLUMN_NAME = 'shift_id'
  ) THEN
    ALTER TABLE `sales` ADD COLUMN `shift_id` INT UNSIGNED DEFAULT NULL AFTER `user_id`;
    ALTER TABLE `sales` ADD KEY `idx_sales_shift` (`shift_id`);
  END IF;
END$$
DELIMITER ;
CALL `pharm_v3_migrate`();
DROP PROCEDURE IF EXISTS `pharm_v3_migrate`;

-- ============================================================
-- 6. New permissions
-- ============================================================
INSERT IGNORE INTO `permissions` (`name`, `display_name`, `module`) VALUES
('expenses.view',   'View Expenses',         'expenses'),
('expenses.create', 'Create Expenses',        'expenses'),
('expenses.edit',   'Edit Expenses',          'expenses'),
('expenses.delete', 'Delete Expenses',        'expenses'),
('shifts.view',     'View Shifts',            'shifts'),
('shifts.manage',   'Manage All Shifts',      'shifts');

-- Grant all expense + shift permissions to owner and admin
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN (
  'expenses.view','expenses.create','expenses.edit','expenses.delete',
  'shifts.view','shifts.manage'
)
WHERE r.name IN ('owner', 'admin');

-- Grant view + create expenses and view shifts to pharmacist and cashier
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN ('expenses.view','expenses.create','shifts.view')
WHERE r.name IN ('pharmacist', 'cashier');

-- Grant view shifts and expenses to inventory_manager
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN ('expenses.view','shifts.view')
WHERE r.name = 'inventory_manager';
