-- Cafe Voice Ordering seed data
-- Run after 003_cafe_schema.sql. Safe to re-run (uses ON CONFLICT DO NOTHING).

TRUNCATE cf_order_items, cf_events, cf_orders RESTART IDENTITY CASCADE;
TRUNCATE cf_menu RESTART IDENTITY CASCADE;

INSERT INTO cf_menu (name, category, description, sizes, options, available, popular) VALUES
  ('Oat Latte', 'coffee', 'Creamy oat-milk latte with a double ristretto', '[{"size":"small","price":440},{"size":"large","price":520}]', '[{"name":"Extra shot","price":80}]', true, true),
  ('Cappuccino', 'coffee', 'Classic cappuccino with silky microfoam', '[{"size":"small","price":400},{"size":"large","price":480}]', '[{"name":"Oat milk","price":60},{"name":"Almond milk","price":60},{"name":"Extra shot","price":80}]', true, false),
  ('Espresso', 'coffee', 'Double shot, rich and balanced', '[{"size":"single","price":280}]', '[]', true, false),
  ('Cold Brew', 'cold_drinks', 'Slow-steeped for 18 hours', '[{"size":"small","price":380},{"size":"large","price":460}]', '[{"name":"Oat milk","price":60}]', true, true),
  ('Masala Chai', 'tea', 'House-blend spices with steamed milk', '[{"size":"small","price":360},{"size":"large","price":440}]', '[{"name":"Oat milk","price":60},{"name":"Almond milk","price":60}]', true, false),
  ('Mint Tea', 'tea', 'Fresh mint, loose leaf', '[{"size":"small","price":300},{"size":"large","price":360}]', '[]', true, false),
  ('Cinnamon Bun', 'bakery', 'Warm, glazed, made in-house', '[{"size":"regular","price":420}]', '[]', true, true),
  ('Almond Croissant', 'bakery', 'Flaky croissant with almond frangipane', '[{"size":"regular","price":480}]', '[]', false, false),
  ('Blueberry Muffin', 'bakery', 'Baked fresh each morning', '[{"size":"regular","price":380}]', '[]', true, false),
  ('Sourdough Toast', 'breakfast', 'With cultured butter and sea salt', '[{"size":"regular","price":360}]', '[{"name":"Avocado","price":120},{"name":"Smoked salmon","price":220}]', true, false),
  ('Breakfast Burrito', 'breakfast', 'Eggs, cheddar, salsa, black beans', '[{"size":"regular","price":840}]', '[{"name":"Extra hot sauce","price":0}]', true, true),
  ('Granola Bowl', 'breakfast', 'Yogurt, seasonal fruit, local honey', '[{"size":"regular","price":720}]', '[{"name":"Extra fruit","price":80}]', true, false),
  ('Iced Matcha', 'cold_drinks', 'Ceremonial-grade matcha with oat milk', '[{"size":"small","price":460},{"size":"large","price":540}]', '[{"name":"Oat milk","price":0}]', true, false),
  ('Lemonade', 'cold_drinks', 'Fresh-squeezed, lightly sweetened', '[{"size":"small","price":320},{"size":"large","price":400}]', '[]', true, false),
  ('Chocolate Cookie', 'bakery', 'Sea-salt dark chocolate', '[{"size":"regular","price":320}]', '[]', true, false),
  ('Honey Cake', 'bakery', 'Layered honey sponge with cream', '[{"size":"slice","price":560}]', '[]', true, false),
  ('Americano', 'coffee', 'Two shots over hot water', '[{"size":"small","price":340},{"size":"large","price":400}]', '[{"name":"Extra shot","price":80}]', true, false),
  ('Turmeric Latte', 'tea', 'Golden milk with ginger and black pepper', '[{"size":"small","price":380},{"size":"large","price":460}]', '[{"name":"Oat milk","price":60}]', true, false);

