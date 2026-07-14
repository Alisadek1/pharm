-- =============================================
-- PHARMACY MANAGEMENT SYSTEM - DATABASE SCHEMA
-- Version: 1.0.0
-- =============================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";
SET FOREIGN_KEY_CHECKS=0;

CREATE DATABASE IF NOT EXISTS `pharm_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `pharm_db`;

-- =============================================
-- SETTINGS
-- =============================================
CREATE TABLE `settings` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `key` VARCHAR(100) NOT NULL,
  `value` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_settings_key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `settings` (`key`, `value`) VALUES
('pharmacy_name', 'PharmaCare'),
('pharmacy_name_ar', 'فارماكير'),
('pharmacy_address', ''),
('pharmacy_phone', ''),
('pharmacy_email', ''),
('pharmacy_logo', ''),
('tax_enabled', '1'),
('tax_rate', '15'),
('currency', 'SAR'),
('currency_symbol', 'ر.س'),
('invoice_prefix', 'INV'),
('po_prefix', 'PO'),
('low_stock_threshold', '10'),
('near_expiry_days', '30'),
('receipt_header', ''),
('receipt_footer', 'Thank you for your visit'),
('printer_type', 'a4'),
('loyalty_points_rate', '1'),
('loyalty_points_value', '0.01');

-- =============================================
-- ROLES
-- =============================================
CREATE TABLE `roles` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL,
  `display_name` VARCHAR(100) NOT NULL,
  `description` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_roles_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `roles` (`name`, `display_name`, `description`) VALUES
('owner', 'Owner', 'Full access to all features'),
('admin', 'Administrator', 'Administrative access'),
('pharmacist', 'Pharmacist', 'Dispense medicines and manage prescriptions'),
('cashier', 'Cashier', 'Handle sales and payments'),
('inventory_manager', 'Inventory Manager', 'Manage stock and purchases');

-- =============================================
-- PERMISSIONS
-- =============================================
CREATE TABLE `permissions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `display_name` VARCHAR(150) NOT NULL,
  `module` VARCHAR(50) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_permissions_name` (`name`),
  KEY `idx_permissions_module` (`module`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `permissions` (`name`, `display_name`, `module`) VALUES
('dashboard.view', 'View Dashboard', 'dashboard'),
('categories.view', 'View Categories', 'categories'),
('categories.create', 'Create Categories', 'categories'),
('categories.edit', 'Edit Categories', 'categories'),
('categories.delete', 'Delete Categories', 'categories'),
('companies.view', 'View Companies', 'companies'),
('companies.create', 'Create Companies', 'companies'),
('companies.edit', 'Edit Companies', 'companies'),
('companies.delete', 'Delete Companies', 'companies'),
('suppliers.view', 'View Suppliers', 'suppliers'),
('suppliers.create', 'Create Suppliers', 'suppliers'),
('suppliers.edit', 'Edit Suppliers', 'suppliers'),
('suppliers.delete', 'Delete Suppliers', 'suppliers'),
('customers.view', 'View Customers', 'customers'),
('customers.create', 'Create Customers', 'customers'),
('customers.edit', 'Edit Customers', 'customers'),
('customers.delete', 'Delete Customers', 'customers'),
('medicines.view', 'View Medicines', 'medicines'),
('medicines.create', 'Create Medicines', 'medicines'),
('medicines.edit', 'Edit Medicines', 'medicines'),
('medicines.delete', 'Delete Medicines', 'medicines'),
('batches.view', 'View Batches', 'batches'),
('batches.create', 'Create Batches', 'batches'),
('batches.edit', 'Edit Batches', 'batches'),
('batches.delete', 'Delete Batches', 'batches'),
('purchases.view', 'View Purchases', 'purchases'),
('purchases.create', 'Create Purchases', 'purchases'),
('purchases.edit', 'Edit Purchases', 'purchases'),
('purchases.delete', 'Delete Purchases', 'purchases'),
('inventory.view', 'View Inventory', 'inventory'),
('inventory.adjust', 'Adjust Stock', 'inventory'),
('pos.access', 'Access POS', 'pos'),
('pos.discount', 'Apply Discount on POS', 'pos'),
('pos.refund', 'Process Refund', 'pos'),
('sales.view', 'View Sales', 'sales'),
('sales.delete', 'Delete Sales', 'sales'),
('returns.view', 'View Returns', 'returns'),
('returns.create', 'Create Returns', 'returns'),
('reports.view', 'View Reports', 'reports'),
('users.view', 'View Users', 'users'),
('users.create', 'Create Users', 'users'),
('users.edit', 'Edit Users', 'users'),
('users.delete', 'Delete Users', 'users'),
('settings.view', 'View Settings', 'settings'),
('settings.edit', 'Edit Settings', 'settings');

-- =============================================
-- ROLE PERMISSIONS
-- =============================================
CREATE TABLE `role_permissions` (
  `role_id` INT UNSIGNED NOT NULL,
  `permission_id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`),
  FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Owner gets all permissions
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 1, id FROM `permissions`;

-- Admin gets all permissions except settings.delete
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 2, id FROM `permissions`;

-- Pharmacist permissions
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 3, id FROM `permissions` WHERE `name` IN (
  'dashboard.view','medicines.view','medicines.edit','batches.view',
  'inventory.view','pos.access','pos.discount','pos.refund',
  'sales.view','returns.view','returns.create','customers.view','customers.create'
);

-- Cashier permissions
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 4, id FROM `permissions` WHERE `name` IN (
  'dashboard.view','medicines.view','pos.access','sales.view',
  'customers.view','customers.create','returns.view','returns.create'
);

-- Inventory Manager permissions
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 5, id FROM `permissions` WHERE `name` IN (
  'dashboard.view','medicines.view','medicines.create','medicines.edit',
  'batches.view','batches.create','batches.edit','purchases.view',
  'purchases.create','purchases.edit','inventory.view','inventory.adjust',
  'suppliers.view','categories.view','companies.view','reports.view'
);

-- =============================================
-- USERS
-- =============================================
CREATE TABLE `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `role_id` INT UNSIGNED NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `username` VARCHAR(50) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(20),
  `avatar` VARCHAR(255),
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `last_login` TIMESTAMP NULL,
  `password_reset_token` VARCHAR(255),
  `password_reset_expires` TIMESTAMP NULL,
  `refresh_token` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_username` (`username`),
  UNIQUE KEY `uk_users_email` (`email`),
  KEY `idx_users_role` (`role_id`),
  FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default owner account (password: Admin@123)
INSERT INTO `users` (`role_id`, `name`, `username`, `email`, `password`) VALUES
(1, 'System Owner', 'owner', 'owner@pharmacy.com', '$2y$12$lBH7s1pzJbUjpXbSRX07kuZLaCo185x/Fol7Uyfg3fOdyES88PUSe');

-- =============================================
-- USER PERMISSIONS (override)
-- =============================================
CREATE TABLE `user_permissions` (
  `user_id` INT UNSIGNED NOT NULL,
  `permission_id` INT UNSIGNED NOT NULL,
  `granted` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`user_id`, `permission_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- ACTIVITY LOG
-- =============================================
CREATE TABLE `activity_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED,
  `action` VARCHAR(100) NOT NULL,
  `model` VARCHAR(50),
  `model_id` INT UNSIGNED,
  `description` TEXT,
  `ip_address` VARCHAR(45),
  `user_agent` VARCHAR(255),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_activity_user` (`user_id`),
  KEY `idx_activity_model` (`model`, `model_id`),
  KEY `idx_activity_created` (`created_at`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- CATEGORIES
-- =============================================
CREATE TABLE `categories` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `name_ar` VARCHAR(100),
  `description` TEXT,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by` INT UNSIGNED,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_categories_name` (`name`),
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- COMPANIES (Manufacturers)
-- =============================================
CREATE TABLE `companies` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `name_ar` VARCHAR(150),
  `country` VARCHAR(100),
  `phone` VARCHAR(20),
  `email` VARCHAR(150),
  `address` TEXT,
  `website` VARCHAR(255),
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by` INT UNSIGNED,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_companies_name` (`name`),
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- SUPPLIERS
-- =============================================
CREATE TABLE `suppliers` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `company_name` VARCHAR(150),
  `phone` VARCHAR(20),
  `email` VARCHAR(150),
  `address` TEXT,
  `tax_number` VARCHAR(50),
  `credit_limit` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `balance` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `notes` TEXT,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by` INT UNSIGNED,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_suppliers_name` (`name`),
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- CUSTOMERS
-- =============================================
CREATE TABLE `customers` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `phone` VARCHAR(20),
  `email` VARCHAR(150),
  `date_of_birth` DATE,
  `gender` ENUM('male','female','other'),
  `address` TEXT,
  `id_number` VARCHAR(50),
  `loyalty_points` INT NOT NULL DEFAULT 0,
  `total_purchases` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `notes` TEXT,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by` INT UNSIGNED,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_customers_phone` (`phone`),
  KEY `idx_customers_name` (`name`),
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- MEDICINES
-- =============================================
CREATE TABLE `medicines` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `category_id` INT UNSIGNED,
  `company_id` INT UNSIGNED,
  `name` VARCHAR(200) NOT NULL,
  `name_ar` VARCHAR(200),
  `scientific_name` VARCHAR(200),
  `barcode` VARCHAR(100),
  `sku` VARCHAR(100),
  `dosage_form` VARCHAR(50),
  `strength` VARCHAR(100),
  `unit` VARCHAR(50) DEFAULT 'Piece',
  `purchase_price` DECIMAL(10,3) NOT NULL DEFAULT 0.000,
  `selling_price` DECIMAL(10,3) NOT NULL DEFAULT 0.000,
  `minimum_stock` INT NOT NULL DEFAULT 10,
  `prescription_required` TINYINT(1) NOT NULL DEFAULT 0,
  `controlled_drug` TINYINT(1) NOT NULL DEFAULT 0,
  `image` VARCHAR(255),
  `description` TEXT,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by` INT UNSIGNED,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_medicines_barcode` (`barcode`),
  UNIQUE KEY `uk_medicines_sku` (`sku`),
  KEY `idx_medicines_category` (`category_id`),
  KEY `idx_medicines_company` (`company_id`),
  KEY `idx_medicines_name` (`name`),
  FULLTEXT KEY `ft_medicines_search` (`name`, `name_ar`, `scientific_name`, `barcode`, `sku`),
  FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- MEDICINE BATCHES
-- =============================================
CREATE TABLE `medicine_batches` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `medicine_id` INT UNSIGNED NOT NULL,
  `supplier_id` INT UNSIGNED,
  `batch_number` VARCHAR(100) NOT NULL,
  `manufacturing_date` DATE,
  `expiry_date` DATE NOT NULL,
  `purchase_price` DECIMAL(10,3) NOT NULL,
  `selling_price` DECIMAL(10,3) NOT NULL,
  `quantity` INT NOT NULL DEFAULT 0,
  `initial_quantity` INT NOT NULL DEFAULT 0,
  `notes` TEXT,
  `created_by` INT UNSIGNED,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_batch_medicine_number` (`medicine_id`, `batch_number`),
  KEY `idx_batch_medicine` (`medicine_id`),
  KEY `idx_batch_supplier` (`supplier_id`),
  KEY `idx_batch_expiry` (`expiry_date`),
  KEY `idx_batch_quantity` (`quantity`),
  FOREIGN KEY (`medicine_id`) REFERENCES `medicines`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- PURCHASE ORDERS
-- =============================================
CREATE TABLE `purchases` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoice_number` VARCHAR(50) NOT NULL,
  `supplier_id` INT UNSIGNED,
  `user_id` INT UNSIGNED,
  `subtotal` DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `discount_type` ENUM('fixed','percentage') DEFAULT 'fixed',
  `discount_value` DECIMAL(10,3) NOT NULL DEFAULT 0.000,
  `discount_amount` DECIMAL(10,3) NOT NULL DEFAULT 0.000,
  `tax_rate` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `tax_amount` DECIMAL(10,3) NOT NULL DEFAULT 0.000,
  `total` DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `paid_amount` DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `due_amount` DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `status` ENUM('draft','ordered','received','partial','cancelled') DEFAULT 'received',
  `payment_status` ENUM('unpaid','partial','paid') DEFAULT 'paid',
  `notes` TEXT,
  `purchase_date` DATE NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_purchases_invoice` (`invoice_number`),
  KEY `idx_purchases_supplier` (`supplier_id`),
  KEY `idx_purchases_user` (`user_id`),
  KEY `idx_purchases_date` (`purchase_date`),
  KEY `idx_purchases_status` (`status`),
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- PURCHASE ITEMS
-- =============================================
CREATE TABLE `purchase_items` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `purchase_id` INT UNSIGNED NOT NULL,
  `medicine_id` INT UNSIGNED NOT NULL,
  `batch_id` INT UNSIGNED,
  `batch_number` VARCHAR(100),
  `expiry_date` DATE,
  `quantity` INT NOT NULL,
  `purchase_price` DECIMAL(10,3) NOT NULL,
  `selling_price` DECIMAL(10,3) NOT NULL,
  `subtotal` DECIMAL(12,3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_purchase_items_purchase` (`purchase_id`),
  KEY `idx_purchase_items_medicine` (`medicine_id`),
  KEY `idx_purchase_items_batch` (`batch_id`),
  FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`medicine_id`) REFERENCES `medicines`(`id`),
  FOREIGN KEY (`batch_id`) REFERENCES `medicine_batches`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- SALES (POS Invoices)
-- =============================================
CREATE TABLE `sales` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoice_number` VARCHAR(50) NOT NULL,
  `customer_id` INT UNSIGNED,
  `user_id` INT UNSIGNED,
  `subtotal` DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `discount_type` ENUM('fixed','percentage') DEFAULT 'fixed',
  `discount_value` DECIMAL(10,3) NOT NULL DEFAULT 0.000,
  `discount_amount` DECIMAL(10,3) NOT NULL DEFAULT 0.000,
  `tax_rate` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `tax_amount` DECIMAL(10,3) NOT NULL DEFAULT 0.000,
  `total` DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `loyalty_points_used` INT NOT NULL DEFAULT 0,
  `loyalty_discount` DECIMAL(10,3) NOT NULL DEFAULT 0.000,
  `loyalty_points_earned` INT NOT NULL DEFAULT 0,
  `payment_method` ENUM('cash','visa','wallet','split') DEFAULT 'cash',
  `cash_amount` DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `visa_amount` DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `wallet_amount` DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `change_amount` DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `status` ENUM('completed','held','refunded','partial_refund') DEFAULT 'completed',
  `notes` TEXT,
  `sale_date` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sales_invoice` (`invoice_number`),
  KEY `idx_sales_customer` (`customer_id`),
  KEY `idx_sales_user` (`user_id`),
  KEY `idx_sales_date` (`sale_date`),
  KEY `idx_sales_status` (`status`),
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- SALE ITEMS
-- =============================================
CREATE TABLE `sale_items` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `sale_id` INT UNSIGNED NOT NULL,
  `medicine_id` INT UNSIGNED NOT NULL,
  `batch_id` INT UNSIGNED,
  `quantity` INT NOT NULL,
  `unit_price` DECIMAL(10,3) NOT NULL,
  `discount_amount` DECIMAL(10,3) NOT NULL DEFAULT 0.000,
  `subtotal` DECIMAL(12,3) NOT NULL,
  `returned_quantity` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_sale_items_sale` (`sale_id`),
  KEY `idx_sale_items_medicine` (`medicine_id`),
  KEY `idx_sale_items_batch` (`batch_id`),
  FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`medicine_id`) REFERENCES `medicines`(`id`),
  FOREIGN KEY (`batch_id`) REFERENCES `medicine_batches`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- HELD INVOICES
-- =============================================
CREATE TABLE `held_invoices` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED,
  `customer_id` INT UNSIGNED,
  `label` VARCHAR(100),
  `cart_data` JSON NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_held_user` (`user_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- RETURNS
-- =============================================
CREATE TABLE `returns` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `return_number` VARCHAR(50) NOT NULL,
  `type` ENUM('sale','purchase') NOT NULL,
  `reference_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED,
  `supplier_id` INT UNSIGNED,
  `customer_id` INT UNSIGNED,
  `total_amount` DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `reason` TEXT,
  `status` ENUM('pending','completed','cancelled') DEFAULT 'completed',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_returns_number` (`return_number`),
  KEY `idx_returns_type` (`type`, `reference_id`),
  KEY `idx_returns_user` (`user_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- RETURN ITEMS
-- =============================================
CREATE TABLE `return_items` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `return_id` INT UNSIGNED NOT NULL,
  `medicine_id` INT UNSIGNED NOT NULL,
  `batch_id` INT UNSIGNED,
  `quantity` INT NOT NULL,
  `unit_price` DECIMAL(10,3) NOT NULL,
  `subtotal` DECIMAL(12,3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_return_items_return` (`return_id`),
  KEY `idx_return_items_medicine` (`medicine_id`),
  FOREIGN KEY (`return_id`) REFERENCES `returns`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`medicine_id`) REFERENCES `medicines`(`id`),
  FOREIGN KEY (`batch_id`) REFERENCES `medicine_batches`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- INVENTORY ADJUSTMENTS
-- =============================================
CREATE TABLE `inventory_adjustments` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `reference_number` VARCHAR(50) NOT NULL,
  `medicine_id` INT UNSIGNED NOT NULL,
  `batch_id` INT UNSIGNED,
  `user_id` INT UNSIGNED,
  `type` ENUM('add','remove','correction') NOT NULL,
  `quantity_before` INT NOT NULL,
  `quantity_change` INT NOT NULL,
  `quantity_after` INT NOT NULL,
  `reason` VARCHAR(255),
  `notes` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_adj_medicine` (`medicine_id`),
  KEY `idx_adj_batch` (`batch_id`),
  KEY `idx_adj_user` (`user_id`),
  KEY `idx_adj_created` (`created_at`),
  FOREIGN KEY (`medicine_id`) REFERENCES `medicines`(`id`),
  FOREIGN KEY (`batch_id`) REFERENCES `medicine_batches`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- NOTIFICATIONS
-- =============================================
CREATE TABLE `notifications` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `type` ENUM('low_stock','expiry','near_expiry','purchase_due','customer_due','system') NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `model` VARCHAR(50),
  `model_id` INT UNSIGNED,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `read_by` INT UNSIGNED,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_type` (`type`),
  KEY `idx_notifications_read` (`is_read`),
  KEY `idx_notifications_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================
ALTER TABLE `medicine_batches` ADD INDEX `idx_batch_fifo` (`medicine_id`, `expiry_date`, `id`);
ALTER TABLE `sale_items` ADD INDEX `idx_sale_items_medicine_date` (`medicine_id`);

SET FOREIGN_KEY_CHECKS=1;
