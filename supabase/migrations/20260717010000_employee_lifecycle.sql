alter table public.employees
  add column if not exists exited_on date;

alter table public.employees
  drop constraint if exists employees_exit_after_joining;

alter table public.employees
  add constraint employees_exit_after_joining
  check (exited_on is null or exited_on >= joined_on);
