-- ============================================================
-- Migration v4: Add import-specific columns to drug_sync_logs
-- ============================================================
-- Run ONCE before executing import_drugs.php for the first time.
-- Adds two columns that the Egyptian-drug-database importer uses.
-- The columns medicines_updated and medicines_failed already exist
-- in the base schema (migration_v2.sql); only these two are new.

ALTER TABLE `drug_sync_logs`
    ADD COLUMN `medicines_inserted` INT UNSIGNED NOT NULL DEFAULT 0
        AFTER `medicines_checked`,
    ADD COLUMN `medicines_skipped`  INT UNSIGNED NOT NULL DEFAULT 0
        AFTER `medicines_inserted`;
