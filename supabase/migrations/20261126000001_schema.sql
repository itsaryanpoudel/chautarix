-- =============================================================================
-- Sanghu – schema, indexes, Row Level Security
-- Security model: clients (anon/authenticated) get READ access through RLS only.
-- Every write goes through SECURITY DEFINER functions (migration 0002) that
-- validate input, run the content filter, enforce rate limits and audit.
-- =============================================================================
create schema if not exists private;

-- ---------- Identity -----------------------------------------------------------
create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  username             text not null unique check (username ~ '^[a-z0-9]{3,20}$'),
  residence_country    text not null default 'JP' check (residence_country ~ '^[A-Z]{2}$'),
  premium_until        timestamptz,
  status               text not null default 'active' check (status in ('active','suspended','banned')),
  suspended_until      timestamptz,
  posting_locked_until timestamptz,
  username_changed_at  timestamptz,
  created_at           timestamptz not null default now()
);

-- Optional, privacy-controlled details (never readable by other users directly)
create table public.profile_details (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  age              smallint check (age between 16 and 120),
  nationality      text check (nationality ~ '^[A-Z]{2}$'),
  city             text check (char_length(city) <= 60),
  bio              text check (char_length(bio) <= 300),
  show_age         boolean not null default false,
  show_nationality boolean not null default true,
  show_city        boolean not null default true,
  show_bio         boolean not null default true,
  updated_at       timestamptz not null default now()
);

-- Level state. valid_posts only grows when a post is credited and only shrinks
-- when a moderator removes a credited post (self-deletion never reduces it).
create table public.user_post_progress (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  valid_posts   integer not null default 0 check (valid_posts >= 0),
  level         integer not null default 1 check (level >= 1),
  credit_day    date,
  credits_today integer not null default 0,
  updated_at    timestamptz not null default now()
);

create table public.admin_roles (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  role        text not null check (role in ('super_admin','admin','moderator')),
  can_suspend boolean not null default false,
  granted_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- system names (user_id null), checkout holds, premium fallbacks, 30-day holds
create table public.username_reservations (
  username   text primary key check (username ~ '^[a-z0-9]{3,20}$'),
  user_id    uuid references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('system','checkout','fallback','hold')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index username_reservations_user_idx on public.username_reservations (user_id);

-- ---------- Content ------------------------------------------------------------
create table public.posts (
  id            bigint generated always as identity primary key,
  author_id     uuid not null references public.profiles(id) on delete cascade,
  body          text not null default '',
  body_hash     text,
  status        text not null default 'published' check (status in ('published','pending_review','removed','deleted')),
  counted       boolean not null default false,
  review_reason text,
  comment_count integer not null default 0,
  created_at    timestamptz not null default now(),
  edited_at     timestamptz,
  constraint posts_body_len check (status = 'deleted' or char_length(body) between 1 and 5000)
);
create index posts_feed_idx   on public.posts (id desc) where status = 'published';
create index posts_author_idx on public.posts (author_id, id desc);
create index posts_review_idx on public.posts (id) where status = 'pending_review';
create index posts_hash_idx   on public.posts (body_hash, created_at desc);

create table public.comments (
  id            bigint generated always as identity primary key,
  post_id       bigint not null references public.posts(id) on delete cascade,
  author_id     uuid not null references public.profiles(id) on delete cascade,
  body          text not null default '',
  status        text not null default 'published' check (status in ('published','pending_review','removed','deleted')),
  review_reason text,
  created_at    timestamptz not null default now(),
  edited_at     timestamptz,
  constraint comments_body_len check (status = 'deleted' or char_length(body) between 1 and 2000)
);
create index comments_post_idx   on public.comments (post_id, id);
create index comments_author_idx on public.comments (author_id, id desc);
create index comments_review_idx on public.comments (id) where status = 'pending_review';

-- ---------- Moderation ---------------------------------------------------------
create table public.reports (
  id              bigint generated always as identity primary key,
  reporter_id     uuid references public.profiles(id) on delete set null,   -- null = automatic system report
  target_type     text not null check (target_type in ('post','comment','user')),
  post_id         bigint references public.posts(id) on delete cascade,
  comment_id      bigint references public.comments(id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete cascade,     -- reported user / content author
  reason          text not null check (reason in ('abusive','harassment','hate','spam','scam','threat','inappropriate','other','filter_evasion')),
  details         text check (char_length(details) <= 1000),
  status          text not null default 'open' check (status in ('open','resolved','dismissed')),
  handled_by      uuid references public.profiles(id) on delete set null,
  handled_at      timestamptz,
  resolution_note text,
  created_at      timestamptz not null default now(),
  constraint reports_target check (
       (target_type = 'post'    and post_id is not null and comment_id is null)
    or (target_type = 'comment' and comment_id is not null and post_id is null)
    or (target_type = 'user'    and user_id is not null and post_id is null and comment_id is null))
);
-- one report per reporter per target (prevents duplicate-report abuse)
create unique index reports_once_post    on public.reports (reporter_id, post_id)    where target_type = 'post';
create unique index reports_once_comment on public.reports (reporter_id, comment_id) where target_type = 'comment';
create unique index reports_once_user    on public.reports (reporter_id, user_id)    where target_type = 'user';
create index reports_queue_idx    on public.reports (status, id);
create index reports_reporter_idx on public.reports (reporter_id, created_at desc);

create table public.moderation_actions (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  target_type text not null,
  target_id   text not null,
  reason      text,
  report_id   bigint references public.reports(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index moderation_actions_recent_idx on public.moderation_actions (id desc);

-- append-only (no UPDATE/DELETE grants for any API role)
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  details     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index audit_logs_recent_idx on public.audit_logs (id desc);

-- multilingual dictionary; add languages by inserting rows (no code change)
create table public.prohibited_words (
  id         bigint generated always as identity primary key,
  term       text not null check (char_length(term) between 1 and 100),
  language   text not null default 'any' check (language ~ '^[a-z_]{2,10}$'),   -- en, ja, ne, ne_rom, any ...
  severity   text not null check (severity in ('mild','review','severe','allow')),
  category   text not null default 'profanity' check (category in ('profanity','abuse','slur','hate','harassment','threat','sexual','spam','other')),
  match_type text not null default 'word' check (match_type in ('word','phrase')),
  is_active  boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (term, language)
);

create table public.filter_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles(id) on delete cascade,
  context    text not null,
  verdict    text not null,
  categories text[] not null default '{}',
  terms      text[] not null default '{}',
  excerpt    text,
  created_at timestamptz not null default now()
);
create index filter_events_user_idx on public.filter_events (user_id, created_at desc);

-- ---------- Billing (written only by the Stripe webhook via service role) --------
create table public.subscriptions (
  user_id                uuid primary key references public.profiles(id) on delete cascade,
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  status                 text not null default 'none',
  price_id               text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  updated_at             timestamptz not null default now()
);

create table public.payments (
  id                 bigint generated always as identity primary key,
  user_id            uuid references public.profiles(id) on delete set null,  -- kept for accounting after account deletion
  stripe_invoice_id  text not null unique,
  amount             integer not null,
  currency           text not null,
  status             text not null,
  hosted_invoice_url text,
  period_end         timestamptz,
  created_at         timestamptz not null default now()
);
create index payments_user_idx on public.payments (user_id, id desc);

create table public.stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);

create table public.platform_settings (
  key         text primary key,
  value       jsonb not null,
  scope       text not null default 'platform' check (scope in ('platform','community')),
  description text,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- ---------- Role helpers used by RLS -------------------------------------------
create or replace function private.staff_rank(p_uid uuid) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select case role when 'super_admin' then 3 when 'admin' then 2 when 'moderator' then 1 end
                   from public.admin_roles where user_id = p_uid), 0)
$$;
create or replace function private.is_staff() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select private.staff_rank(auth.uid()) >= 1
$$;

-- ---------- Read models ----------------------------------------------------------
create view public.feed_posts with (security_invoker = true) as
select p.id, p.author_id, p.body, p.status, p.comment_count, p.created_at, p.edited_at,
       pr.username, pr.residence_country,
       coalesce(pr.premium_until > now(), false) as is_premium,
       coalesce(g.level, 1) as level
from public.posts p
join public.profiles pr on pr.id = p.author_id
left join public.user_post_progress g on g.user_id = p.author_id
where p.status <> 'deleted' and pr.status <> 'banned';

create view public.feed_comments with (security_invoker = true) as
select c.id, c.post_id, c.author_id, c.body, c.status, c.created_at, c.edited_at,
       pr.username, pr.residence_country,
       coalesce(pr.premium_until > now(), false) as is_premium,
       coalesce(g.level, 1) as level
from public.comments c
join public.profiles pr on pr.id = c.author_id
left join public.user_post_progress g on g.user_id = c.author_id
where c.status <> 'deleted' and pr.status <> 'banned';

-- ---------- Row Level Security ---------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.profile_details       enable row level security;
alter table public.user_post_progress    enable row level security;
alter table public.admin_roles           enable row level security;
alter table public.username_reservations enable row level security;
alter table public.posts                 enable row level security;
alter table public.comments              enable row level security;
alter table public.reports               enable row level security;
alter table public.moderation_actions    enable row level security;
alter table public.audit_logs            enable row level security;
alter table public.prohibited_words      enable row level security;
alter table public.filter_events         enable row level security;
alter table public.subscriptions         enable row level security;
alter table public.payments              enable row level security;
alter table public.stripe_events         enable row level security;
alter table public.platform_settings     enable row level security;

create policy profiles_read  on public.profiles           for select using (true);
create policy progress_read  on public.user_post_progress for select using (true);
create policy settings_read  on public.platform_settings  for select using (true);
create policy details_read   on public.profile_details    for select using (user_id = (select auth.uid()) or (select private.is_staff()));
create policy posts_read     on public.posts for select using (
  status = 'published' or (author_id = (select auth.uid()) and status <> 'deleted') or (select private.is_staff()));
create policy comments_read  on public.comments for select using (
  (status = 'published' and exists (select 1 from public.posts p where p.id = post_id and p.status = 'published'))
  or (author_id = (select auth.uid()) and status <> 'deleted') or (select private.is_staff()));
create policy reports_read   on public.reports            for select using (reporter_id = (select auth.uid()) or (select private.is_staff()));
create policy modact_read    on public.moderation_actions for select using ((select private.is_staff()));
create policy audit_read     on public.audit_logs         for select using ((select private.staff_rank(auth.uid())) >= 2);
create policy roles_read     on public.admin_roles        for select using (user_id = (select auth.uid()) or (select private.is_staff()));
create policy words_read     on public.prohibited_words   for select using ((select private.staff_rank(auth.uid())) >= 2);
create policy fevents_read   on public.filter_events      for select using ((select private.is_staff()));
create policy resv_read      on public.username_reservations for select using (user_id = (select auth.uid()) or (select private.is_staff()));
create policy subs_read      on public.subscriptions      for select using (user_id = (select auth.uid()) or (select private.staff_rank(auth.uid())) >= 3);
create policy payments_read  on public.payments           for select using (user_id = (select auth.uid()) or (select private.staff_rank(auth.uid())) >= 3);
-- stripe_events: no policy => invisible to anon/authenticated (service role only)

-- ---------- Privileges: read-only API, no direct writes --------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on public.profiles, public.user_post_progress, public.posts, public.comments,
                public.platform_settings, public.feed_posts, public.feed_comments to anon, authenticated;
grant select on public.profile_details, public.reports, public.moderation_actions, public.audit_logs,
                public.admin_roles, public.prohibited_words, public.filter_events,
                public.username_reservations, public.subscriptions, public.payments to authenticated;

-- Supabase (2026+) no longer grants new tables to API roles automatically. The service role is
-- used ONLY on the server (Stripe webhook, account deletion) and needs explicit privileges.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;
grant execute on function private.staff_rank(uuid), private.is_staff() to anon, authenticated;
