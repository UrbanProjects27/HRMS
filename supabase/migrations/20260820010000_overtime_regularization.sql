alter table public.overtime_requests
  add column if not exists is_regularization boolean not null default false,
  add column if not exists regularized_by uuid references public.profiles(id) on delete set null;

create index if not exists overtime_requests_regularization_idx
  on public.overtime_requests(is_regularization, status, overtime_date desc);
