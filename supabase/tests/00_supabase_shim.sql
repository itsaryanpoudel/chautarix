-- ONLY for plain PostgreSQL test databases (never run on Supabase):
-- emulates the parts of Supabase the migrations rely on.
do $$ begin
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(), email text,
  raw_user_meta_data jsonb not null default '{}', created_at timestamptz not null default now());
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- Worst cases: old Supabase default (everything granted to anon/authenticated) proves our REVOKEs protect
-- the tables; new 2026 default (nothing granted) proves our explicit GRANTs are sufficient.
alter default privileges in schema public grant all on tables    to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
-- service_role deliberately gets NO automatic table grants (Supabase 2026 default for new projects)
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
