alter table public.locations
  alter column geofence_radius_m set default 1000;

update public.locations
set geofence_radius_m = 1000
where geofence_radius_m is distinct from 1000;
