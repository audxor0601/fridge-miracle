-- Supabase 환경 흉내내기 (로컬 검증용)
create schema if not exists auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);
do $$ begin
  create role anon nologin;         exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin;  exception when duplicate_object then null; end $$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema public, auth to anon, authenticated, service_role;
