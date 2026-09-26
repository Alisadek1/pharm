-- Migration: add strips_per_box and tablets_per_strip to medicines
-- Run on local MariaDB first, then on production after deploy.

ALTER TABLE medicines
  ADD COLUMN strips_per_box    SMALLINT UNSIGNED NULL DEFAULT NULL,
  ADD COLUMN tablets_per_strip SMALLINT UNSIGNED NULL DEFAULT NULL;
