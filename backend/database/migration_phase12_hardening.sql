-- Phase 12 Hardening: Inventory Adjustment Workflow + Count Improvements
-- Run once: mysql -u root -P 3307 -h 127.0.0.1 pharm_db < backend/database/migration_phase12_hardening.sql

-- ─── 1. Add snapshot_at to inventory_counts ───────────────────────────────────
ALTER TABLE `inventory_counts`
    ADD COLUMN `snapshot_at` TIMESTAMP NULL DEFAULT NULL AFTER `notes`;

-- ─── 2. Extend inventory_adjustments with traceability ───────────────────────
ALTER TABLE `inventory_adjustments`
    ADD COLUMN `source_count_id`   INT UNSIGNED NULL DEFAULT NULL AFTER `idempotency_key`,
    ADD COLUMN `source_request_id` INT UNSIGNED NULL DEFAULT NULL AFTER `source_count_id`,
    ADD COLUMN `reversal_of`       INT UNSIGNED NULL DEFAULT NULL AFTER `source_request_id`,
    ADD COLUMN `reversed_by`       INT UNSIGNED NULL DEFAULT NULL AFTER `reversal_of`,
    ADD COLUMN `reversed_at`       TIMESTAMP NULL DEFAULT NULL AFTER `reversed_by`,
    ADD KEY `idx_ia_source_count`   (`source_count_id`),
    ADD KEY `idx_ia_source_request` (`source_request_id`),
    ADD KEY `idx_ia_reversal_of`    (`reversal_of`);

-- ─── 3. Standalone adjustment request workflow ────────────────────────────────
CREATE TABLE IF NOT EXISTS `inventory_adjustment_requests` (
    `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `request_number`  VARCHAR(50)  NOT NULL,
    `reason_code`     ENUM('damage','theft','expiry','correction','stocktake','donation','other')
                      NOT NULL DEFAULT 'correction',
    `reason_text`     VARCHAR(255) NOT NULL DEFAULT '',
    `notes`           TEXT,
    `status`          ENUM('draft','submitted','approved','rejected','applied')
                      NOT NULL DEFAULT 'draft',
    `created_by`      INT UNSIGNED DEFAULT NULL,
    `submitted_by`    INT UNSIGNED DEFAULT NULL,
    `approved_by`     INT UNSIGNED DEFAULT NULL,
    `rejected_by`     INT UNSIGNED DEFAULT NULL,
    `applied_by`      INT UNSIGNED DEFAULT NULL,
    `submitted_at`    TIMESTAMP NULL DEFAULT NULL,
    `approved_at`     TIMESTAMP NULL DEFAULT NULL,
    `rejected_at`     TIMESTAMP NULL DEFAULT NULL,
    `applied_at`      TIMESTAMP NULL DEFAULT NULL,
    `rejection_reason` VARCHAR(255) DEFAULT NULL,
    `idempotency_key` VARCHAR(100) DEFAULT NULL,
    `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_iar_number`      (`request_number`),
    UNIQUE KEY `uk_iar_idempotency` (`idempotency_key`),
    KEY `idx_iar_status` (`status`),
    CONSTRAINT `fk_iar_created_by`   FOREIGN KEY (`created_by`)   REFERENCES `users`(`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_iar_submitted_by` FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_iar_approved_by`  FOREIGN KEY (`approved_by`)  REFERENCES `users`(`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_iar_rejected_by`  FOREIGN KEY (`rejected_by`)  REFERENCES `users`(`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_iar_applied_by`   FOREIGN KEY (`applied_by`)   REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventory_adjustment_request_items` (
    `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `request_id`  INT UNSIGNED NOT NULL,
    `medicine_id` INT UNSIGNED NOT NULL,
    `batch_id`    INT UNSIGNED DEFAULT NULL,
    `adjust_type` ENUM('add','remove','correction') NOT NULL DEFAULT 'add',
    `quantity`    INT NOT NULL,
    `reason_note` VARCHAR(255) DEFAULT NULL,
    `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_iari_req_med_batch` (`request_id`, `medicine_id`, `batch_id`),
    KEY `idx_iari_medicine` (`medicine_id`),
    CONSTRAINT `fk_iari_request` FOREIGN KEY (`request_id`)  REFERENCES `inventory_adjustment_requests`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_iari_medicine` FOREIGN KEY (`medicine_id`) REFERENCES `medicines`(`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_iari_batch`    FOREIGN KEY (`batch_id`)    REFERENCES `medicine_batches`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 4. FK constraints referencing both new tables ───────────────────────────
ALTER TABLE `inventory_adjustments`
    ADD CONSTRAINT `fk_ia_source_count`   FOREIGN KEY (`source_count_id`)   REFERENCES `inventory_counts`(`id`)               ON DELETE SET NULL,
    ADD CONSTRAINT `fk_ia_source_request` FOREIGN KEY (`source_request_id`) REFERENCES `inventory_adjustment_requests`(`id`)   ON DELETE SET NULL,
    ADD CONSTRAINT `fk_ia_reversal_of`    FOREIGN KEY (`reversal_of`)        REFERENCES `inventory_adjustments`(`id`)           ON DELETE SET NULL,
    ADD CONSTRAINT `fk_ia_reversed_by`    FOREIGN KEY (`reversed_by`)        REFERENCES `users`(`id`)                           ON DELETE SET NULL;

-- ─── 5. Permissions ──────────────────────────────────────────────────────────
INSERT IGNORE INTO `permissions` (`name`, `display_name`, `module`) VALUES
    ('inventory.adjustment',        'Create/Submit Adjustment Request',  'inventory'),
    ('inventory.adjustment.approve','Approve/Apply Adjustment Request',  'inventory');
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
    SELECT 1, `id` FROM `permissions`
    WHERE `name` IN ('inventory.adjustment', 'inventory.adjustment.approve');
