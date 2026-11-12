drop policy if exists "employees update own attendance" on public.attendance;

create policy "employees update own attendance"
on public.attendance
for update
to authenticated
using (
  employee_id in (
    select id
    from public.employees
    where profile_id = auth.uid()
  )
)
with check (
  employee_id in (
    select id
    from public.employees
    where profile_id = auth.uid()
  )
);
