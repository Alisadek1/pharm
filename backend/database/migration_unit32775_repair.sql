-- ============================================================
-- Unit 32775 Conversion Factor Repair
-- Medicine: ACTOS 15MG 30 TAB. (medicine_id=475)
-- Unit: Box (id=32775)
-- ============================================================
--
-- ISSUE: product_units.conversion_factor = 4
--        Expected = parent.conversion_factor(1) × contains_quantity(10) = 10
--
-- HISTORICAL RECORD (immutable, not changed by this migration):
--   purchase_items id=43 (PO-000016, 2026-08-30): conversion_factor snapshot = 4
--   This snapshot was captured at transaction time and reflects what was used then.
--   medicine_batches id=42: quantity=80 (= 20 boxes × 4, recorded at purchase time)
--
-- IMPACT OF REPAIR:
--   CHANGES:  product_units.conversion_factor: 4 → 10 (affects future transactions)
--   UNCHANGED: purchase_items.conversion_factor (historical snapshot)
--   UNCHANGED: medicine_batches.quantity (physical stock, not recalculated)
--   UNCHANGED: all financial records (subtotals, prices, amounts)
--   NO children: product_units WHERE parent_unit_id=32775 → 0 rows (no cascade needed)
--
-- NOTE: Before applying, physically verify whether one "Box" of ACTOS 15MG 30 TAB.
--       contains 4 or 10 Pieces. If it truly contains 4, update contains_quantity=4
--       instead (which would make conversion_factor=4 correct).
-- ============================================================

UPDATE product_units
SET    conversion_factor = 10.000000
WHERE  id = 32775
  AND  conversion_factor = 4.000000;  -- guard: only update if still inconsistent
