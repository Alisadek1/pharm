-- Migration: add tax_rate, tax_amount, remaining_quantity to purchase_items
-- Safe to run multiple times (IF NOT EXISTS)

ALTER TABLE purchase_items
  ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER public_price,
  ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10,3) NOT NULL DEFAULT 0 AFTER tax_rate,
  ADD COLUMN IF NOT EXISTS remaining_quantity INT NOT NULL DEFAULT 0 AFTER tax_amount;
