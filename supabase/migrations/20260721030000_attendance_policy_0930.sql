insert into public.hr_policies (policy_type, enabled, settings)
values (
  'attendance',
  true,
  '{"workday_start":"09:30","grace_minutes":15,"required_hours":8,"auto_absent":true,"timezone":"Asia/Kolkata"}'::jsonb
)
on conflict (policy_type) do update
set enabled = true,
    settings = excluded.settings,
    updated_at = now();
