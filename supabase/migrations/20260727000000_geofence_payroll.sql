alter table public.locations
  add column if not exists latitude numeric(10,7),
  add column if not exists longitude numeric(10,7),
  add column if not exists geofence_radius_m integer not null default 200 check (geofence_radius_m between 50 and 5000);

alter table public.attendance
  add column if not exists check_in_latitude numeric(10,7),
  add column if not exists check_in_longitude numeric(10,7),
  add column if not exists check_in_distance_m numeric(10,2),
  add column if not exists check_out_latitude numeric(10,7),
  add column if not exists check_out_longitude numeric(10,7),
  add column if not exists check_out_distance_m numeric(10,2);

create table if not exists public.salary_structures (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null unique references public.employees(id) on delete cascade,
  basic numeric(12,2) not null default 0 check (basic >= 0),
  hra numeric(12,2) not null default 0 check (hra >= 0),
  special_allowance numeric(12,2) not null default 0 check (special_allowance >= 0),
  deductions numeric(12,2) not null default 0 check (deductions >= 0),
  effective_from date not null default current_date,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  payroll_month date not null,
  basic numeric(12,2) not null,
  hra numeric(12,2) not null,
  special_allowance numeric(12,2) not null,
  deductions numeric(12,2) not null,
  gross_salary numeric(12,2) not null,
  net_salary numeric(12,2) not null,
  status text not null default 'generated' check (status in ('generated','paid')),
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now(),
  unique(employee_id, payroll_month)
);

alter table public.salary_structures enable row level security;
alter table public.payroll_records enable row level security;

drop policy if exists "role scoped salary structure access" on public.salary_structures;
create policy "role scoped salary structure access" on public.salary_structures for select to authenticated
using (public.is_admin() or employee_id in (select id from public.employees where profile_id = auth.uid()));

drop policy if exists "admins manage salary structures" on public.salary_structures;
create policy "admins manage salary structures" on public.salary_structures for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "role scoped payroll access" on public.payroll_records;
create policy "role scoped payroll access" on public.payroll_records for select to authenticated
using (public.is_admin() or employee_id in (select id from public.employees where profile_id = auth.uid()));

drop policy if exists "admins manage payroll" on public.payroll_records;
create policy "admins manage payroll" on public.payroll_records for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create index if not exists payroll_records_month_idx on public.payroll_records(payroll_month desc);
