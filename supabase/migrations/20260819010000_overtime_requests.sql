create table if not exists public.overtime_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  overtime_date date not null,
  from_time time not null,
  to_time time not null,
  hours numeric(5,2) not null check (hours > 0),
  reason text not null check (char_length(trim(reason)) >= 5),
  status public.request_status not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  is_regularization boolean not null default false,
  regularized_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint overtime_time_range_check check (to_time > from_time),
  constraint overtime_request_unique unique (employee_id, overtime_date, from_time, to_time)
);

create index if not exists overtime_requests_employee_date_idx on public.overtime_requests(employee_id, overtime_date desc);
create index if not exists overtime_requests_status_date_idx on public.overtime_requests(status, overtime_date desc);

alter table public.overtime_requests enable row level security;

drop policy if exists "Role scoped overtime read" on public.overtime_requests;
create policy "Role scoped overtime read" on public.overtime_requests
for select to authenticated
using (public.can_view_employee(employee_id));

revoke insert, update, delete on public.overtime_requests from authenticated;
grant select on public.overtime_requests to authenticated;
