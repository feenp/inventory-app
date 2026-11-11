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

-- 3. Function to auto-assign sort_order for new products (places them at end of list)
CREATE OR REPLACE FUNCTION assign_product_sort_order()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sort_order IS NULL THEN
    SELECT COALESCE(MAX(sort_order), 0) + 10 INTO NEW.sort_order FROM products;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger: fires before INSERT, assigns sort_order if not provided
DROP TRIGGER IF EXISTS trg_product_sort_order ON products;
CREATE TRIGGER trg_product_sort_order
BEFORE INSERT ON products
FOR EACH ROW EXECUTE FUNCTION assign_product_sort_order();

-- 5. Update product_stock view to expose sort_order
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
