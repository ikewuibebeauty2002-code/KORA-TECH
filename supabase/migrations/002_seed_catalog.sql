-- Seed Main Categories & Subcategories for KoraTech Electronics

WITH main_cats AS (
  INSERT INTO public.categories (name, slug, description, sort_order) VALUES
    ('Smartphones', 'smartphones', 'Official 5G flagship and everyday smartphones with manufacturer warranty across Nigeria.', 1),
    ('Laptops', 'laptops', 'High-performance laptops for software engineers, creators, students, and executives.', 2),
    ('Tablets', 'tablets', 'Versatile Android and productivity tablets built for work, learning, and media.', 3),
    ('iPads', 'ipads', 'Apple iPad Pro, iPad Air, and standard models with stylus and keyboard support.', 4),
    ('New Arrivals', 'new-arrivals', 'Freshly stocked electronics and latest-generation gadgets.', 5),
    ('Accessories', 'accessories', 'Essential power, audio, mounting, and protection gear for phones and laptops.', 6)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id, slug
),
acc AS (
  SELECT id FROM public.categories WHERE slug = 'accessories' LIMIT 1
)
INSERT INTO public.categories (name, slug, description, parent_id, sort_order)
SELECT v.name, v.slug, v.description, acc.id, v.sort_order
FROM acc, (VALUES
  ('Tripods', 'tripods', 'Heavy-duty smartphone and camera tripods for creators and mobile filmmakers.', 10),
  ('Earpieces', 'earpieces', 'Wired and wireless in-ear earpieces with clear voice microphones.', 11),
  ('AirPods', 'airpods', 'Apple AirPods and Spatial Audio wireless earbuds.', 12),
  ('Headphones', 'headphones', 'Active noise-cancelling studio and travel headphones.', 13),
  ('Chargers', 'chargers', 'GaN fast wall chargers, MagSafe pads, and braided USB-C cables.', 14),
  ('Power Banks', 'power-banks', 'High-capacity fast-charging power banks engineered for uninterrupted work.', 15),
  ('Smartwatches', 'smartwatches', 'Fitness, health, and AMOLED calling smartwatches.', 16),
  ('Bluetooth Speakers', 'bluetooth-speakers', 'Portable waterproof Bluetooth speakers with deep bass.', 17),
  ('Phone Accessories', 'phone-accessories', 'MagSafe cases, tempered glass, and magnetic car mounts.', 18),
  ('Computer Accessories', 'computer-accessories', 'USB-C hubs, wireless mechanical keyboards, and ergonomic mice.', 19),
  ('ITEL PowerGo', 'itel-powergo', 'Reliable, high-value ITEL PowerGo fast-charging power banks built for Nigeria.', 20),
  ('Other Electronic Gadgets', 'other-electronic-gadgets', 'Smart home plugs, ring lights, SSD drives, and portable hubs.', 21)
) AS v(name, slug, description, sort_order)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

-- Sample active coupons
INSERT INTO public.coupons (code, description, discount_type, discount_value, min_order_ngn, max_discount_ngn, is_active) VALUES
  ('KORA5', '5% welcome discount on orders above ₦50,000', 'percentage', 5, 50000, 35000, TRUE),
  ('LAGOS5000', '₦5,000 off accessories & gadgets orders above ₦40,000', 'fixed', 5000, 40000, 5000, TRUE)
ON CONFLICT (code) DO NOTHING;
