insert into public.departments (name) values
  ('Engineering'), ('Product'), ('Sales'), ('People')
on conflict (name) do nothing;

insert into public.locations (name) values
  ('Bengaluru'), ('Mumbai'), ('Delhi'), ('Chennai'), ('Hyderabad'), ('Pune'), ('Remote')
on conflict (name) do nothing;

insert into public.leave_types (name, default_annual_allowance) values
  ('Casual leave', 12), ('Sick leave', 8), ('Earned leave', 15), ('Work from home', 6)
on conflict (name) do nothing;

insert into public.hr_policies (policy_type, enabled, settings) values
  ('attendance', true, '{"workday_start":"09:30","grace_minutes":15,"required_hours":8,"auto_absent":true,"timezone":"Asia/Kolkata"}'),
  ('leave', true, '{"casual_days":4,"sick_days":4,"earned_days":12,"carry_forward":true}')
on conflict (policy_type) do nothing;
