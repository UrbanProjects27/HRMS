insert into public.hr_policies (policy_type, enabled, settings)
values (
  'leave',
  true,
  '{"casual_days":4,"sick_days":4,"earned_days":12,"carry_forward":true}'::jsonb
)
on conflict (policy_type) do update
set enabled = true,
    settings = excluded.settings,
    updated_at = now();

update public.leave_types
set default_annual_allowance = case name
  when 'Casual leave' then 4
  when 'Sick leave' then 4
  when 'Earned leave' then 12
  else default_annual_allowance
end
where name in ('Casual leave', 'Sick leave', 'Earned leave');
