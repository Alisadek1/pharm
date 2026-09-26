-- ============================================================
-- Barcode Provenance & Import Log Migration
-- Adds source tracking to medicines + product_units barcodes,
-- and creates barcode_import_logs for full audit trail.
-- ============================================================

-- Add provenance columns to medicines
ALTER TABLE `medicines`
    ADD COLUMN `barcode_source`      ENUM('manual','csv','opf','gs1') NULL DEFAULT NULL  AFTER `barcode`,
    ADD COLUMN `barcode_verified`    TINYINT(1) NOT NULL DEFAULT 0                       AFTER `barcode_source`,
    ADD COLUMN `barcode_verified_at` TIMESTAMP NULL DEFAULT NULL                         AFTER `barcode_verified`,
    ADD COLUMN `barcode_imported_at` TIMESTAMP NULL DEFAULT NULL                         AFTER `barcode_verified_at`;

-- Add provenance columns to product_units
ALTER TABLE `product_units`
    ADD COLUMN `barcode_source`   ENUM('manual','csv','opf','gs1') NULL DEFAULT NULL  AFTER `barcode`,
    ADD COLUMN `barcode_verified` TINYINT(1) NOT NULL DEFAULT 0                       AFTER `barcode_source`;

-- Barcode import audit log
CREATE TABLE IF NOT EXISTS `barcode_import_logs` (
    `id`            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `import_type`   ENUM('single','csv','api') NOT NULL,
    `barcode`       VARCHAR(100)    NOT NULL,
    `medicine_id`   INT UNSIGNED    NULL,
    `unit_id`       INT UNSIGNED    NULL,
    `status`        ENUM('imported','linked','skipped','error') NOT NULL,
    `action`        ENUM('created','linked','conflict','no_change','error') NULL,
    `source`        ENUM('manual','csv','opf','gs1') NOT NULL DEFAULT 'manual',
    `source_data`   JSON            NULL,
    `error_message` TEXT            NULL,
    `user_id`       INT UNSIGNED    NULL,
    `created_at`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_bil_barcode`  (`barcode`),
    KEY `idx_bil_medicine` (`medicine_id`),
    KEY `idx_bil_created`  (`created_at`),
    KEY `idx_bil_user`     (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Grant barcode import permission to role 1 (owner)
-- role_permissions uses permission_id FK; insert into permissions table first
INSERT IGNORE INTO `permissions` (`name`, `description`)
VALUES ('barcodes.import', 'Import and manage barcodes');
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 1, id FROM `permissions` WHERE `name` = 'barcodes.import' LIMIT 1;
