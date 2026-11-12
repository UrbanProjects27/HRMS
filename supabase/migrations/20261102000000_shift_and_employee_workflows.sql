-- Shift setup. A shift may cross midnight (for example 21:00 to 06:00).
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employees add column if not exists shift_id uuid references public.shifts(id) on delete set null;
create index if not exists employees_shift_id_idx on public.employees(shift_id);

alter table public.shifts enable row level security;
drop policy if exists "authenticated read shifts" on public.shifts;
create policy "authenticated read shifts" on public.shifts for select to authenticated using (true);
drop policy if exists "admins manage shifts" on public.shifts;
create policy "admins manage shifts" on public.shifts for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- New-joiner requests are deliberately separate from employees: a record is
-- added to the employee master only after the required two manager approvals
-- and the final admin formalities approval.
create type public.employee_workflow_status as enum ('pending_manager_1', 'pending_manager_2', 'pending_admin', 'approved', 'rejected', 'cancelled');
create type public.employee_request_type as enum ('joining', 'exit');

create table if not exists public.employee_requests (
  id uuid primary key default gen_random_uuid(),
  request_type public.employee_request_type not null,
  status public.employee_workflow_status not null default 'pending_manager_1',
  raised_by_employee_id uuid not null references public.employees(id) on delete restrict,
  subject_employee_id uuid references public.employees(id) on delete restrict,
  -- Joining details supplied by the reporting manager.
  employee_name text,
  department_id uuid references public.departments(id) on delete set null,
  designation text,
  location_id uuid references public.locations(id) on delete set null,
  address text,
  contact_number text check (contact_number is null or contact_number ~ '^[0-9]{10}$'),
  email text,
  emergency_contact_number text check (emergency_contact_number is null or emergency_contact_number ~ '^[0-9]{10}$'),
  aadhar_document_path text,
  pan_document_path text,
  other_document_path text,
  -- Final admin joining formalities.
  employee_code text,
  payroll_company text,
  joined_on date,
  offer_letter_path text,
  asset_allocation_path text,
  -- Exit details and final relieving letter.
  exit_date date,
  exit_reason text,
  relieving_letter_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((request_type = 'joining' and subject_employee_id is null) or (request_type = 'exit' and subject_employee_id is not null)),
  check ((request_type <> 'joining') or (employee_name is not null and department_id is not null and designation is not null and location_id is not null and address is not null and contact_number is not null and email is not null and emergency_contact_number is not null and aadhar_document_path is not null)),
  check ((request_type <> 'exit') or (exit_date is not null and exit_reason is not null))
);

create table if not exists public.employee_request_approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.employee_requests(id) on delete cascade,
  approval_level smallint not null check (approval_level in (1, 2, 3)),
  approver_employee_id uuid references public.employees(id) on delete set null,
  decision public.request_status not null default 'pending',
  remarks text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique(request_id, approval_level)
);
create index if not exists employee_requests_status_idx on public.employee_requests(status, created_at desc);
create index if not exists employee_request_approvals_approver_idx on public.employee_request_approvals(approver_employee_id, decision);

alter table public.employee_requests enable row level security;
alter table public.employee_request_approvals enable row level security;

create policy "workflow readers can view assigned requests" on public.employee_requests for select to authenticated using (
  public.is_admin() or raised_by_employee_id in (select id from public.employees where profile_id = auth.uid()) or subject_employee_id in (select id from public.employees where profile_id = auth.uid()) or exists (
    select 1 from public.employee_request_approvals approval join public.employees approver on approver.id = approval.approver_employee_id
    where approval.request_id = employee_requests.id and approver.profile_id = auth.uid()
  )
);
create policy "workflow readers can view assigned decisions" on public.employee_request_approvals for select to authenticated using (
  public.is_admin() or exists (select 1 from public.employee_requests request where request.id = employee_request_approvals.request_id and (request.raised_by_employee_id in (select id from public.employees where profile_id = auth.uid()) or request.subject_employee_id in (select id from public.employees where profile_id = auth.uid()))) or approver_employee_id in (select id from public.employees where profile_id = auth.uid())
);

insert into storage.buckets (id, name, public, file_size_limit)
values ('employee-workflow-documents', 'employee-workflow-documents', false, 10485760)
on conflict (id) do nothing;

-- The workflow function uses the service role after validating each requester;
-- direct client mutation is intentionally not granted.
revoke insert, update, delete on public.employee_requests from authenticated;
revoke insert, update, delete on public.employee_request_approvals from authenticated;
