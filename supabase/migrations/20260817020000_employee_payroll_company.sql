alter table public.employees
  add column if not exists payroll_company text not null default 'Not assigned';
