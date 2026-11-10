-- Sample menu and reward rules. Prices are placeholders — change them
-- from the app (Admin → Menu) or edit here before running.

insert into public.categories (name, sort) values
  ('Biryani', 1), ('Starters', 2), ('Chinese', 3), ('Breads & Sides', 4), ('Desserts', 5), ('Beverages', 6);

insert into public.menu_items (category_id, name, price, is_veg, sort)
select c.id, v.name, v.price, v.is_veg, v.sort
from (values
  ('Biryani', 'Chicken Dum Biryani', 229, false, 1),
  ('Biryani', 'Chicken Dum Biryani (Family)', 599, false, 2),
  ('Biryani', 'Mutton Dum Biryani', 329, false, 3),
  ('Biryani', 'Egg Biryani', 179, false, 4),
  ('Biryani', 'Veg Dum Biryani', 169, true, 5),
  ('Biryani', 'Paneer Biryani', 199, true, 6),
  ('Starters', 'Chicken 65', 199, false, 1),
  ('Starters', 'Apollo Fish', 249, false, 2),
  ('Starters', 'Chicken Tikka', 239, false, 3),
  ('Starters', 'Paneer 65', 189, true, 4),
  ('Chinese', 'Chicken Fried Rice', 169, false, 1),
  ('Chinese', 'Veg Fried Rice', 139, true, 2),
  ('Chinese', 'Chicken Hakka Noodles', 169, false, 3),
  ('Chinese', 'Veg Hakka Noodles', 139, true, 4),
  ('Chinese', 'Chilli Chicken', 209, false, 5),
  ('Chinese', 'Veg Manchurian', 159, true, 6),
  ('Breads & Sides', 'Mirchi Ka Salan', 49, true, 1),
  ('Breads & Sides', 'Raita', 39, true, 2),
  ('Breads & Sides', 'Rumali Roti', 25, true, 3),
  ('Desserts', 'Double Ka Meetha', 79, true, 1),
  ('Desserts', 'Qubani Ka Meetha', 99, true, 2),
  ('Beverages', 'Soft Drink (300ml)', 40, true, 1),
  ('Beverages', 'Water Bottle (1L)', 20, true, 2),
  ('Beverages', 'Irani Chai', 25, true, 3)
) as v(category, name, price, is_veg, sort)
join public.categories c on c.name = v.category;

insert into public.reward_rules (name, visits_required, reward_item_id, reward_qty, repeating)
select 'Every 5th visit: free Double Ka Meetha', 5, id, 1, true from public.menu_items where name = 'Double Ka Meetha';
insert into public.reward_rules (name, visits_required, reward_item_id, reward_qty, repeating)
select 'Every 10th visit: free Chicken Dum Biryani', 10, id, 1, true from public.menu_items where name = 'Chicken Dum Biryani';
