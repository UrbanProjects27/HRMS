do $$
declare
  target_user_id uuid;
  target_full_name text;
begin
  select
    id,
    coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), split_part(email, '@', 1))
  into target_user_id, target_full_name
  from auth.users
  where lower(email) = 'shrutinemade@urbanretail.in'
  limit 1;

  if target_user_id is null then
    raise exception 'Auth user shrutinemade@urbanretail.in was not found';
  end if;

  insert into public.profiles (id, full_name, role, updated_at)
  values (target_user_id, target_full_name, 'admin'::public.app_role, now())
  on conflict (id) do update
  set role = 'admin'::public.app_role,
      full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
      updated_at = now();
end;
$$;
