insert into public.departments (name)
values ('People')
on conflict (name) do nothing;

insert into public.locations (name)
values ('Bengaluru')
on conflict (name) do nothing;

insert into public.employees (
  employee_code,
  name,
  email,
  department_id,
  location_id,
  designation,
  reporting_manager_id,
  address,
  contact_number,
  emergency_contact_number,
  joined_on,
  status
)
select
  'DEMO-001',
  'Demo Employee',
  'demo.employee@huma.co',
  (select id from public.departments where name = 'People'),
  (select id from public.locations where name = 'Bengaluru'),
  'Demo Associate',
  (select id from public.employees where status = 'active' order by created_at limit 1),
  'Demo Address, Bengaluru',
  '9000000001',
  '9000000002',
  current_date,
  'active'
where not exists (
  select 1
  from public.employees
  where employee_code = 'DEMO-001'
     or email = 'demo.employee@huma.co'
);
