-- ============================================================
-- Migration: product_type
-- Version  : 2026-08-27
-- Purpose  : Add product_type column to medicines table to
--            distinguish medicine / cosmetics / medical_supply /
--            personal_care / other products.
--
--            This is separate from dosage_form (which answers
--            "what pharmaceutical form?") and from the categories
--            table (which is a free-form label per drug line).
--
--            All existing 18,292 rows default to 'other' — a
--            neutral value that preserves existing behaviour while
--            allowing future reclassification per product.
--
-- Safe for : MySQL 5.7+, MariaDB 10.3+, Hostinger
-- Idempotent: yes — safe to run multiple times
-- ============================================================

SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS `add_medicines_product_type`;

DELIMITER $$
CREATE PROCEDURE `add_medicines_product_type`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'medicines'
      AND COLUMN_NAME  = 'product_type'
  ) THEN
    ALTER TABLE `medicines`
      ADD COLUMN `product_type` VARCHAR(20) NOT NULL DEFAULT 'other'
        COMMENT 'Product classification: medicine, cosmetics, medical_supply, personal_care, other'
      AFTER `dosage_form`;
  END IF;
END$$
DELIMITER ;

CALL `add_medicines_product_type`();
DROP PROCEDURE IF EXISTS `add_medicines_product_type`;
