-- Migration: Add sort_order to products for custom row ordering
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- 1. Add sort_order column
ALTER TABLE products
ADD COLUMN IF NOT EXISTS sort_order integer;

-- 2. Initialize sort_order based on current alphabetical order (gaps of 10)
UPDATE products
SET sort_order = sub.rn * 10
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name) AS rn
  FROM products
) sub
WHERE products.id = sub.id;

-- 3. Update product_stock view to expose sort_order
CREATE OR REPLACE VIEW product_stock AS
SELECT
  p.id AS product_id,
  p.name,
  p.standard_price,
  p.low_stock_threshold,
  p.sort_order,
  COALESCE(SUM(lr.remaining_boxes), 0) AS total_remaining
FROM products p
LEFT JOIN lot_remaining lr ON lr.product_id = p.id AND lr.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.name, p.standard_price, p.low_stock_threshold, p.sort_order;
