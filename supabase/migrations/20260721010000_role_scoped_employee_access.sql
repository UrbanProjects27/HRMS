create or replace function public.can_view_employee(target_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.employees target
      where target.id = target_employee_id
        and (
          target.profile_id = auth.uid()
          or target.reporting_manager_id = (
            select manager.id
            from public.employees manager
            where manager.profile_id = auth.uid()
            limit 1
          )
        )
    );
$$;

drop policy if exists "authenticated read employees" on public.employees;
drop policy if exists "role scoped employee access" on public.employees;

create policy "role scoped employee access"
on public.employees
for select
to authenticated
using (public.can_view_employee(id));

drop policy if exists "employees read own attendance" on public.attendance;
drop policy if exists "role scoped attendance access" on public.attendance;

create policy "role scoped attendance access"
on public.attendance
for select
to authenticated
using (public.can_view_employee(employee_id));

revoke all on function public.can_view_employee(uuid) from public;
grant execute on function public.can_view_employee(uuid) to authenticated;

create or replace function public.get_my_manager_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select manager.name
  from public.employees employee
  join public.employees manager on manager.id = employee.reporting_manager_id
  where employee.profile_id = auth.uid()
  limit 1;
$$;

revoke all on function public.get_my_manager_name() from public;
grant execute on function public.get_my_manager_name() to authenticated;
