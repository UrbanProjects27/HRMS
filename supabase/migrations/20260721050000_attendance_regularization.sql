alter table public.attendance
  add column if not exists is_regularization boolean not null default false,
  add column if not exists regularization_reason text,
  add column if not exists regularization_requested_at timestamptz,
  add column if not exists regularized_by uuid references public.profiles(id) on delete set null;

create index if not exists attendance_regularization_pending_idx
  on public.attendance (approval_status, attendance_date desc)
  where is_regularization = true;

drop policy if exists "employees create own attendance" on public.attendance;
create policy "employees create today's own attendance"
on public.attendance
for insert
to authenticated
with check (
  employee_id in (select id from public.employees where profile_id = auth.uid())
  and attendance_date = (now() at time zone 'Asia/Kolkata')::date
  and is_regularization = false
);

drop policy if exists "employees update own attendance" on public.attendance;
create policy "employees update today's own attendance"
on public.attendance
for update
to authenticated
using (
  employee_id in (select id from public.employees where profile_id = auth.uid())
  and attendance_date = (now() at time zone 'Asia/Kolkata')::date
  and is_regularization = false
)
with check (
  employee_id in (select id from public.employees where profile_id = auth.uid())
  and attendance_date = (now() at time zone 'Asia/Kolkata')::date
  and is_regularization = false
);
