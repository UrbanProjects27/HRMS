insert into public.leave_types (name, default_annual_allowance, active)
values
  ('Casual leave', 12, true),
  ('Sick leave', 8, true),
  ('Earned leave', 15, true),
  ('Work from home', 6, true)
on conflict (name) do nothing;
