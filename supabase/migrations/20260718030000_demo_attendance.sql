insert into public.attendance (
  employee_id,
  attendance_date,
  check_in,
  check_out,
  working_hours,
  attendance_status,
  approval_status
)
select
  employee.id,
  workday::date,
  make_timestamptz(
    extract(year from workday)::integer,
    extract(month from workday)::integer,
    extract(day from workday)::integer,
    9,
    case when extract(day from workday)::integer % 3 = 0 then 28 else 8 end,
    0,
    'Asia/Kolkata'
  ),
  make_timestamptz(
    extract(year from workday)::integer,
    extract(month from workday)::integer,
    extract(day from workday)::integer,
    18,
    0,
    0,
    'Asia/Kolkata'
  ),
  case when extract(day from workday)::integer % 3 = 0 then 8.03 else 8.37 end,
  case when extract(day from workday)::integer % 3 = 0 then 'late' else 'present' end,
  case when workday::date = current_date then 'pending'::public.request_status else 'approved'::public.request_status end
from public.employees employee
cross join generate_series(current_date - interval '6 days', current_date, interval '1 day') workday
where employee.employee_code = 'DEMO-001'
  and extract(isodow from workday) between 1 and 5
on conflict (employee_id, attendance_date) do nothing;
