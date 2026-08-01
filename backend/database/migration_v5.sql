-- ============================================================
-- Migration v5: Search indexes for large drug catalog
-- ============================================================
-- Run ONCE before or after the Egyptian-drug-database import.
-- Safe to apply to a live database (ADD INDEX / ADD FULLTEXT KEY
-- are online operations in InnoDB on MySQL 5.7+ / MariaDB 10.3+).
--
-- What's already covered by schema.sql:
--   medicines: idx_medicines_category, idx_medicines_company,
--              idx_medicines_name, ft_medicines_search (FULLTEXT)
--   categories: uk_categories_name (unique B-tree, doubles as index)
--   companies:  uk_companies_name  (unique B-tree, doubles as index)
--
-- What's missing for UI search at 25,000+ medicines:
--   1. B-tree index on medicines.name_ar         — ORDER BY / prefix search
--   2. B-tree index on medicines.scientific_name — filtering / prefix search
--   3. FULLTEXT on categories(name, name_ar)     — search across 2,100+ categories
--   4. FULLTEXT on companies(name, name_ar)      — search across 1,700+ companies

ALTER TABLE `medicines`
    ADD INDEX `idx_medicines_name_ar`        (`name_ar`),
    ADD INDEX `idx_medicines_scientific_name` (`scientific_name`);

ALTER TABLE `categories`
    ADD FULLTEXT KEY `ft_categories_search` (`name`, `name_ar`);

ALTER TABLE `companies`
    ADD FULLTEXT KEY `ft_companies_search` (`name`, `name_ar`);
