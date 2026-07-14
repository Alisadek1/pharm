-- PharmaCare v2 Feature Migration
-- Run this against pharm_db after importing schema.sql + seed.sql

-- ─── Feature 3: Returns Payment Method ────────────────────────────────────────
ALTER TABLE `returns`
  ADD COLUMN `payment_method` ENUM('cash','visa','wallet','bank_transfer','mixed') NULL AFTER `status`,
  ADD COLUMN `cash_amount` DECIMAL(10,3) NOT NULL DEFAULT 0 AFTER `payment_method`,
  ADD COLUMN `visa_amount` DECIMAL(10,3) NOT NULL DEFAULT 0 AFTER `cash_amount`,
  ADD COLUMN `wallet_amount` DECIMAL(10,3) NOT NULL DEFAULT 0 AFTER `visa_amount`,
  ADD COLUMN `bank_transfer_amount` DECIMAL(10,3) NOT NULL DEFAULT 0 AFTER `wallet_amount`;

-- ─── Feature 4: Public Price ───────────────────────────────────────────────────
ALTER TABLE `medicines`
  ADD COLUMN `public_price` DECIMAL(10,3) NOT NULL DEFAULT 0 AFTER `selling_price`;

ALTER TABLE `medicine_batches`
  ADD COLUMN `public_price` DECIMAL(10,3) NOT NULL DEFAULT 0 AFTER `selling_price`;

ALTER TABLE `purchase_items`
  ADD COLUMN `public_price` DECIMAL(10,3) NOT NULL DEFAULT 0 AFTER `selling_price`;

-- ─── Feature 5: Pricing Strategy Settings ─────────────────────────────────────
INSERT INTO `settings` (`key`, `value`) VALUES
  ('pricing_mode',          'percentage'),
  ('pricing_fixed_amount',  '0'),
  ('pricing_percentage',    '30'),
  ('pricing_round_to',      '0'),
  ('pricing_auto_enabled',  '1')
ON DUPLICATE KEY UPDATE `value` = `value`;

-- ─── Feature 6: Drug Sync Logs + Integration Settings ─────────────────────────
CREATE TABLE IF NOT EXISTS `drug_sync_logs` (
  `id`                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `provider`          VARCHAR(50)  NOT NULL DEFAULT 'saudi_rsd',
  `sync_type`         ENUM('full','incremental','single') NOT NULL DEFAULT 'full',
  `status`            ENUM('running','completed','failed') NOT NULL DEFAULT 'running',
  `medicines_checked` INT UNSIGNED NOT NULL DEFAULT 0,
  `medicines_updated` INT UNSIGNED NOT NULL DEFAULT 0,
  `medicines_failed`  INT UNSIGNED NOT NULL DEFAULT 0,
  `started_at`        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at`      TIMESTAMP    NULL,
  `error_message`     TEXT         NULL,
  `triggered_by`      INT UNSIGNED NULL,
  FOREIGN KEY (`triggered_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_started_at` (`started_at`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `settings` (`key`, `value`) VALUES
  ('rsd_api_url',       ''),
  ('rsd_api_key',       ''),
  ('rsd_api_secret',    ''),
  ('rsd_sync_interval', '24'),
  ('rsd_enabled',       '0')
ON DUPLICATE KEY UPDATE `value` = `value`;
