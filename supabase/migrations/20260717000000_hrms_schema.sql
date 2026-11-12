create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'manager', 'employee');
create type public.request_status as enum ('pending', 'approved', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'employee',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  employee_code text not null unique,
  name text not null,
  email text not null unique,
  department_id uuid references public.departments(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  designation text not null,
  reporting_manager_id uuid references public.employees(id) on delete set null,
  address text not null,
  contact_number text not null check (contact_number ~ '^[0-9]{10}$'),
  emergency_contact_number text not null check (emergency_contact_number ~ '^[0-9]{10}$'),
  joined_on date not null default current_date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  attendance_date date not null,
  check_in timestamptz,
  check_out timestamptz,
  working_hours numeric(5,2),
  attendance_status text not null check (attendance_status in ('present', 'late', 'half_day', 'leave', 'absent')),
  approval_status public.request_status not null default 'pending',
  approved_by uuid references public.profiles(id) on delete set null,
  approval_remarks text,
  created_at timestamptz not null default now(),
  unique(employee_id, attendance_date)
);

create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_annual_allowance numeric(5,1) not null default 0 check (default_annual_allowance >= 0),
  active boolean not null default true
);

create table public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id) on delete cascade,
  balance_year integer not null default extract(year from current_date)::integer,
  allocated numeric(5,1) not null default 0 check (allocated >= 0),
  used numeric(5,1) not null default 0 check (used >= 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(employee_id, leave_type_id, balance_year)
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id),
  from_date date not null,
  to_date date not null,
  days numeric(5,1) not null check (days > 0),
  reason text not null,
  document_path text,
  status public.request_status not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  remarks text,
  created_at timestamptz not null default now(),
  check (to_date >= from_date)
);

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  holiday_date date not null,
  holiday_type text not null default 'National' check (holiday_type = 'National'),
  location_id uuid references public.locations(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(name, holiday_date, location_id)
);

create table public.hr_policies (
  id uuid primary key default gen_random_uuid(),
  policy_type text not null unique check (policy_type in ('attendance', 'leave')),
  enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'); $$;

alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.locations enable row level security;
alter table public.employees enable row level security;
alter table public.attendance enable row level security;
alter table public.leave_types enable row level security;
alter table public.leave_balances enable row level security;
alter table public.leave_requests enable row level security;
alter table public.holidays enable row level security;
alter table public.hr_policies enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles read own or admin" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "admins manage profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "authenticated read departments" on public.departments for select to authenticated using (true);
create policy "admins manage departments" on public.departments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "authenticated read locations" on public.locations for select to authenticated using (true);
create policy "admins manage locations" on public.locations for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "authenticated read employees" on public.employees for select to authenticated using (true);
create policy "admins manage employees" on public.employees for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "employees read own attendance" on public.attendance for select to authenticated using (public.is_admin() or employee_id in (select id from public.employees where profile_id = auth.uid()));
create policy "employees create own attendance" on public.attendance for insert to authenticated with check (employee_id in (select id from public.employees where profile_id = auth.uid()));
create policy "admins manage attendance" on public.attendance for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "authenticated read leave types" on public.leave_types for select to authenticated using (true);
create policy "admins manage leave types" on public.leave_types for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "employees read own balances" on public.leave_balances for select to authenticated using (public.is_admin() or employee_id in (select id from public.employees where profile_id = auth.uid()));
create policy "admins manage leave balances" on public.leave_balances for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "employees read own leave requests" on public.leave_requests for select to authenticated using (public.is_admin() or employee_id in (select id from public.employees where profile_id = auth.uid()));
create policy "employees create own leave requests" on public.leave_requests for insert to authenticated with check (employee_id in (select id from public.employees where profile_id = auth.uid()));
create policy "admins manage leave requests" on public.leave_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "authenticated read holidays" on public.holidays for select to authenticated using (true);
create policy "admins manage holidays" on public.holidays for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "authenticated read policies" on public.hr_policies for select to authenticated using (true);
create policy "admins manage policies" on public.hr_policies for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins read audit logs" on public.audit_logs for select to authenticated using (public.is_admin());
create policy "admins create audit logs" on public.audit_logs for insert to authenticated with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit)
values ('leave-documents', 'leave-documents', false, 10485760)
on conflict (id) do nothing;
