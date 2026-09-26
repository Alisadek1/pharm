-- Phase 12: Inventory Count workflow + Adjustment idempotency
-- Run after migration_returns_hardening.sql

-- Inventory count sessions (multi-step approval workflow)
CREATE TABLE IF NOT EXISTS `inventory_counts` (
    `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `count_number` VARCHAR(50)  NOT NULL,
    `notes`        TEXT,
    `status`       ENUM('draft','counting','submitted','approved','applied','closed') NOT NULL DEFAULT 'draft',
    `created_by`   INT UNSIGNED,
    `submitted_by` INT UNSIGNED,
    `approved_by`  INT UNSIGNED,
    `applied_by`   INT UNSIGNED,
    `submitted_at` TIMESTAMP NULL DEFAULT NULL,
    `approved_at`  TIMESTAMP NULL DEFAULT NULL,
    `applied_at`   TIMESTAMP NULL DEFAULT NULL,
    `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_ic_number` (`count_number`),
    KEY `idx_ic_status` (`status`),
    KEY `idx_ic_created` (`created_at`),
    CONSTRAINT `fk_ic_created_by`   FOREIGN KEY (`created_by`)   REFERENCES `users`(`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_ic_submitted_by` FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_ic_approved_by`  FOREIGN KEY (`approved_by`)  REFERENCES `users`(`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_ic_applied_by`   FOREIGN KEY (`applied_by`)   REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-medicine counted quantities within a count session
CREATE TABLE IF NOT EXISTS `inventory_count_items` (
    `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `count_id`     INT UNSIGNED NOT NULL,
    `medicine_id`  INT UNSIGNED NOT NULL,
    `batch_id`     INT UNSIGNED DEFAULT NULL,
    `expected_qty` INT          NOT NULL DEFAULT 0,
    `counted_qty`  INT          DEFAULT NULL,
    `difference`   INT          GENERATED ALWAYS AS (`counted_qty` - `expected_qty`) VIRTUAL,
    `notes`        VARCHAR(255) DEFAULT NULL,
    `counted_by`   INT UNSIGNED DEFAULT NULL,
    `counted_at`   TIMESTAMP    NULL DEFAULT NULL,
    `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_ici_count_med_batch` (`count_id`, `medicine_id`, `batch_id`),
    KEY `idx_ici_count` (`count_id`),
    KEY `idx_ici_medicine` (`medicine_id`),
    CONSTRAINT `fk_ici_count`      FOREIGN KEY (`count_id`)    REFERENCES `inventory_counts`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_ici_medicine`   FOREIGN KEY (`medicine_id`) REFERENCES `medicines`(`id`),
    CONSTRAINT `fk_ici_batch`      FOREIGN KEY (`batch_id`)    REFERENCES `medicine_batches`(`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_ici_counted_by` FOREIGN KEY (`counted_by`)  REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add idempotency to inventory_adjustments
ALTER TABLE `inventory_adjustments`
    ADD COLUMN `idempotency_key` VARCHAR(100) NULL DEFAULT NULL AFTER `notes`,
    ADD UNIQUE KEY `uk_ia_idempotency` (`idempotency_key`);

-- New permissions for inventory count
INSERT IGNORE INTO `permissions` (`name`, `display_name`, `module`) VALUES
    ('inventory.count',         'Perform Inventory Count', 'inventory'),
    ('inventory.count.approve', 'Approve Inventory Count', 'inventory');

-- Grant to owner role (role_id=1 assumed — adjust if needed)
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
    SELECT 1, id FROM `permissions` WHERE `name` IN ('inventory.count', 'inventory.count.approve');
