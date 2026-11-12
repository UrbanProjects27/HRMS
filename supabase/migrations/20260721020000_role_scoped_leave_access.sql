drop policy if exists "employees read own leave requests" on public.leave_requests;
drop policy if exists "role scoped leave request access" on public.leave_requests;

create policy "role scoped leave request access"
on public.leave_requests
for select
to authenticated
using (public.can_view_employee(employee_id));
