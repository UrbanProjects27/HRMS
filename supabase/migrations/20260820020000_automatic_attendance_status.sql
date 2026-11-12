alter table public.attendance
  drop constraint if exists attendance_attendance_status_check;

alter table public.attendance
  add constraint attendance_attendance_status_check
  check (attendance_status in ('present', 'late', 'half_day', 'leave', 'absent'));

update public.attendance
set
  attendance_status = case
    when coalesce(working_hours, 0) > 8 then 'present'
    when coalesce(working_hours, 0) >= 4 then 'half_day'
    else 'absent'
  end,
  approval_status = 'approved',
  approved_by = null,
  approval_remarks = null
where coalesce(is_regularization, false) = false
  and check_in is not null
  and check_out is not null;
