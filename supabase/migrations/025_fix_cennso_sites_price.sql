-- Fix Cennso_Sites base_unit_price: was entered as 17.80 instead of 17800.00
-- The floor_unit_price of 44.72 masked the error (all tiers returned 44.72)
UPDATE pricing_models
SET base_unit_price = 17800.00
WHERE sku_id = (SELECT id FROM skus WHERE code = 'Cennso_Sites');
