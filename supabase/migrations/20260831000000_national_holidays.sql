update public.holidays
set holiday_type = 'National'
where holiday_type <> 'National';

alter table public.holidays
  drop constraint if exists holidays_holiday_type_check;

alter table public.holidays
  alter column holiday_type set default 'National';

alter table public.holidays
  add constraint holidays_holiday_type_check
  check (holiday_type = 'National');
