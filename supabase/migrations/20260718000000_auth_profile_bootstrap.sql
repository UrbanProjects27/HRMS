create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, 'Employee'), '@', 1)),
    case
      when lower(coalesce(new.email, '')) = 'nisha@huma.co' then 'admin'::public.app_role
      else 'employee'::public.app_role
    end
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    role = case
      when lower(coalesce(new.email, '')) = 'nisha@huma.co' then 'admin'::public.app_role
      else public.profiles.role
    end,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_auth_user();

insert into public.profiles (id, full_name, role)
select
  id,
  coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(email, 'Employee'), '@', 1)),
  case
    when lower(coalesce(email, '')) = 'nisha@huma.co' then 'admin'::public.app_role
    else 'employee'::public.app_role
  end
from auth.users
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = case when excluded.role = 'admin'::public.app_role then excluded.role else public.profiles.role end,
  updated_at = now();
