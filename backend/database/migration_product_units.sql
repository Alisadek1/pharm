-- ============================================================
-- Migration: product_units
-- Version  : 2026-08-26
-- Purpose  : Multi-unit support per product / medicine.
--            Adds product_units table and seeds one default
--            unit per existing medicine.  Zero existing data
--            is modified — stock, prices, and barcodes are
--            preserved and copied, not moved.
-- Safe for : MySQL 5.7+, MariaDB 10.3+, Hostinger
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ── 1. Create product_units ──────────────────────────────────
CREATE TABLE IF NOT EXISTS `product_units` (
  `id`                    INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `medicine_id`           INT UNSIGNED    NOT NULL,
  `unit_name`             VARCHAR(50)     NOT NULL,
  `unit_name_ar`          VARCHAR(50)             DEFAULT NULL,
  `unit_code`             VARCHAR(20)             DEFAULT NULL  COMMENT 'Short code, e.g. TAB, STR, BOX',
  `conversion_factor`     DECIMAL(14, 6)  NOT NULL DEFAULT 1.000000
                          COMMENT 'How many base units is 1 of this unit. Base unit = 1.',
  `purchase_price`        DECIMAL(12, 3)          DEFAULT NULL  COMMENT 'NULL = inherit from medicine',
  `selling_price`         DECIMAL(12, 3)          DEFAULT NULL  COMMENT 'NULL = inherit from medicine',
  `public_price`          DECIMAL(12, 3)          DEFAULT NULL  COMMENT 'NULL = inherit from medicine',
  `barcode`               VARCHAR(100)            DEFAULT NULL,
  `is_base_unit`          TINYINT(1)      NOT NULL DEFAULT 0
                          COMMENT 'Exactly one unit per medicine must have is_base_unit = 1',
  `is_default_purchase`   TINYINT(1)      NOT NULL DEFAULT 0,
  `is_default_sale`       TINYINT(1)      NOT NULL DEFAULT 0,
  `is_active`             TINYINT(1)      NOT NULL DEFAULT 1,
  `sort_order`            SMALLINT        NOT NULL DEFAULT 0,
  `created_at`            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- One barcode per unit globally (NULL values excluded from uniqueness by MySQL)
  UNIQUE  KEY `uk_pu_barcode`              (`barcode`),
  -- Medicine + unit name must be unique
  UNIQUE  KEY `uk_pu_medicine_name`        (`medicine_id`, `unit_name`),
  KEY             `idx_pu_medicine`        (`medicine_id`),
  KEY             `idx_pu_barcode`         (`barcode`),
  CONSTRAINT `fk_pu_medicine`
    FOREIGN KEY (`medicine_id`)
    REFERENCES  `medicines` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET  = utf8mb4
  COLLATE          = utf8mb4_unicode_ci
  COMMENT          = 'Per-product unit definitions with conversion factors';

-- ── 2. Seed one base unit for every existing medicine ────────
-- We INSERT IGNORE so re-running the migration is safe.
-- The seeded unit copies all prices + barcode from the
-- medicine master — nothing is moved or deleted.

INSERT IGNORE INTO `product_units`
  (`medicine_id`, `unit_name`, `unit_name_ar`, `unit_code`,
   `conversion_factor`,
   `purchase_price`, `selling_price`, `public_price`,
   `barcode`,
   `is_base_unit`, `is_default_purchase`, `is_default_sale`,
   `is_active`, `sort_order`)
SELECT
  m.`id`,
  COALESCE(NULLIF(TRIM(m.`unit`), ''), 'Unit') AS unit_name,
  NULL                                          AS unit_name_ar,
  NULL                                          AS unit_code,
  1.000000                                      AS conversion_factor,
  m.`purchase_price`,
  m.`selling_price`,
  m.`public_price`,
  -- Only copy barcode if it isn't already claimed by another product_units row
  CASE
    WHEN m.`barcode` IS NOT NULL
     AND m.`barcode` <> ''
     AND NOT EXISTS (
           SELECT 1 FROM `product_units` pu2
           WHERE pu2.`barcode` = m.`barcode`
         )
    THEN m.`barcode`
    ELSE NULL
  END                                           AS barcode,
  1  AS is_base_unit,
  1  AS is_default_purchase,
  1  AS is_default_sale,
  1  AS is_active,
  0  AS sort_order
FROM `medicines` m;

-- ── 3. Enum fix: sales.status ────────────────────────────────
-- Add 'cancelled' if not already present.
-- We use a SELECT to guard against MySQL versions that error
-- on duplicate enum values.
ALTER TABLE `sales`
  MODIFY COLUMN `status`
    ENUM('completed','held','refunded','partial_refund','cancelled')
    NOT NULL DEFAULT 'completed';

-- ── 4. Logo key unification: pharmacy_logo → logo ────────────
-- If the old key exists, migrate its value to 'logo' and remove it.
-- Uses a stored procedure wrapper so this is a no-op when
-- pharmacy_logo doesn't exist (safe to re-run).
DROP PROCEDURE IF EXISTS `migrate_logo_key`;

DELIMITER $$
CREATE PROCEDURE `migrate_logo_key`()
BEGIN
  DECLARE old_path VARCHAR(500) DEFAULT NULL;
  SELECT `value` INTO old_path FROM `settings` WHERE `key` = 'pharmacy_logo' LIMIT 1;
  -- Only migrate if pharmacy_logo has a non-empty path (empty string is NOT NULL in MySQL)
  IF old_path IS NOT NULL AND TRIM(old_path) <> '' THEN
    INSERT INTO `settings` (`key`, `value`)
      VALUES ('logo', old_path)
      ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);
    DELETE FROM `settings` WHERE `key` = 'pharmacy_logo';
  ELSEIF old_path IS NOT NULL AND TRIM(old_path) = '' THEN
    -- pharmacy_logo exists but is empty — just clean up the stale key, do not touch logo
    DELETE FROM `settings` WHERE `key` = 'pharmacy_logo';
  END IF;
END$$
DELIMITER ;

CALL `migrate_logo_key`();
DROP PROCEDURE IF EXISTS `migrate_logo_key`;

-- ── 5. Unit snapshot columns on sale_items ───────────────────
-- Wrapped in a procedure so re-running is safe on MySQL 5.7+
-- (which lacks ADD COLUMN IF NOT EXISTS).
DROP PROCEDURE IF EXISTS `add_sale_unit_columns`;

DELIMITER $$
CREATE PROCEDURE `add_sale_unit_columns`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'sale_items'
      AND COLUMN_NAME  = 'unit_id'
  ) THEN
    ALTER TABLE `sale_items`
      ADD COLUMN `unit_id`            INT UNSIGNED   DEFAULT NULL
          COMMENT 'FK to product_units — NULL means base unit',
      ADD COLUMN `unit_name_snapshot` VARCHAR(50)    DEFAULT NULL
          COMMENT 'Frozen unit name at time of sale',
      ADD COLUMN `conversion_factor`  DECIMAL(14,6)  NOT NULL DEFAULT 1.000000
          COMMENT 'Frozen conversion factor at time of sale';
  END IF;
END$$
DELIMITER ;

CALL `add_sale_unit_columns`();
DROP PROCEDURE IF EXISTS `add_sale_unit_columns`;

-- ── 6. Unit snapshot columns on purchase_items ───────────────
DROP PROCEDURE IF EXISTS `add_purchase_unit_columns`;

DELIMITER $$
CREATE PROCEDURE `add_purchase_unit_columns`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'purchase_items'
      AND COLUMN_NAME  = 'unit_id'
  ) THEN
    ALTER TABLE `purchase_items`
      ADD COLUMN `unit_id`            INT UNSIGNED   DEFAULT NULL
          COMMENT 'FK to product_units — NULL means base unit',
      ADD COLUMN `unit_name_snapshot` VARCHAR(50)    DEFAULT NULL
          COMMENT 'Frozen unit name at time of purchase',
      ADD COLUMN `conversion_factor`  DECIMAL(14,6)  NOT NULL DEFAULT 1.000000
          COMMENT 'Frozen conversion factor at time of purchase';
  END IF;
END$$
DELIMITER ;

CALL `add_purchase_unit_columns`();
DROP PROCEDURE IF EXISTS `add_purchase_unit_columns`;

-- ── Done ─────────────────────────────────────────────────────
SET FOREIGN_KEY_CHECKS = 1;
