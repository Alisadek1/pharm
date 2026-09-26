-- Phase 11: Returns & Refunds Architecture Hardening
-- Run once on pharm_db

ALTER TABLE `returns`
    ADD COLUMN `idempotency_key` VARCHAR(100) NULL DEFAULT NULL
        AFTER `bank_transfer_amount`,
    ADD UNIQUE KEY `uk_returns_idempotency` (`idempotency_key`);

ALTER TABLE `return_items`
    ADD COLUMN `sale_item_id` INT NULL DEFAULT NULL
        AFTER `id`,
    ADD KEY `idx_return_items_sale_item` (`sale_item_id`);
