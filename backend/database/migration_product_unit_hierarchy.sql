-- ============================================================
-- Migration: product_unit_hierarchy
-- Version  : 2026-08-26
-- Purpose  : Extend product_units with parent_unit_id and
--            contains_quantity to support arbitrary packaging
--            hierarchy (Tablet → Strip → Box → Carton).
--
--            Existing flat units are fully preserved.
--            Historical sale_items / purchase_items snapshots
--            are NOT touched.
--
-- Safe for : MySQL 5.7+, MariaDB 10.3+, Hostinger
-- Idempotent: yes — safe to run multiple times
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ── 1. Add hierarchy columns if not already present ─────────
DROP PROCEDURE IF EXISTS `add_pu_hierarchy_cols`;

DELIMITER $$
CREATE PROCEDURE `add_pu_hierarchy_cols`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'product_units'
      AND COLUMN_NAME  = 'parent_unit_id'
  ) THEN
    ALTER TABLE `product_units`
      ADD COLUMN `parent_unit_id`    INT UNSIGNED   DEFAULT NULL
          COMMENT 'Self-FK: the direct parent unit this unit is composed of. NULL = flat/root unit.',
      ADD COLUMN `contains_quantity` DECIMAL(14, 6) DEFAULT NULL
          COMMENT 'How many parent_unit make up 1 of this unit. NULL for flat/base units.';
  END IF;
END$$
DELIMITER ;

CALL `add_pu_hierarchy_cols`();
DROP PROCEDURE IF EXISTS `add_pu_hierarchy_cols`;

-- ── 2. Index for hierarchy traversal ────────────────────────
DROP PROCEDURE IF EXISTS `add_pu_hierarchy_idx`;

DELIMITER $$
CREATE PROCEDURE `add_pu_hierarchy_idx`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'product_units'
      AND INDEX_NAME   = 'idx_pu_parent'
  ) THEN
    ALTER TABLE `product_units`
      ADD INDEX `idx_pu_parent` (`parent_unit_id`);
  END IF;
END$$
DELIMITER ;

CALL `add_pu_hierarchy_idx`();
DROP PROCEDURE IF EXISTS `add_pu_hierarchy_idx`;

-- ── 3. Self-referencing FK ───────────────────────────────────
-- parent_unit_id → product_units.id
-- ON DELETE RESTRICT: cannot delete a parent while children exist
-- ON UPDATE CASCADE: propagates PK changes (rare but safe)
DROP PROCEDURE IF EXISTS `add_pu_hierarchy_fk`;

DELIMITER $$
CREATE PROCEDURE `add_pu_hierarchy_fk`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA     = DATABASE()
      AND TABLE_NAME       = 'product_units'
      AND CONSTRAINT_NAME  = 'fk_pu_parent'
      AND CONSTRAINT_TYPE  = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE `product_units`
      ADD CONSTRAINT `fk_pu_parent`
        FOREIGN KEY (`parent_unit_id`)
        REFERENCES  `product_units` (`id`)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
  END IF;
END$$
DELIMITER ;

CALL `add_pu_hierarchy_fk`();
DROP PROCEDURE IF EXISTS `add_pu_hierarchy_fk`;

-- ── Done ─────────────────────────────────────────────────────
-- Existing rows: parent_unit_id = NULL, contains_quantity = NULL
-- These continue to work as flat units unchanged.
SET FOREIGN_KEY_CHECKS = 1;
