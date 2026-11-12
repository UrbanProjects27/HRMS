alter table public.attendance
  add column if not exists original_check_in timestamptz,
  add column if not exists original_check_out timestamptz,
  add column if not exists original_working_hours numeric(5,2),
  add column if not exists original_attendance_status text;

comment on column public.attendance.original_check_in is 'First recorded check-in retained when a regularisation replaces attendance data.';
comment on column public.attendance.original_check_out is 'First recorded check-out retained when a regularisation replaces attendance data.';
comment on column public.attendance.original_working_hours is 'First recorded working hours retained when a regularisation replaces attendance data.';
