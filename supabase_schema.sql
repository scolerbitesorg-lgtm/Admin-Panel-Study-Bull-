create table if not exists public.studybull_app_state (
  id text primary key default 'main',
  nodes jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.studybull_app_state disable row level security;
grant all on table public.studybull_app_state to anon, authenticated, service_role;
