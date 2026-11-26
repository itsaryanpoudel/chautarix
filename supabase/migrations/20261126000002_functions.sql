-- =============================================================================
-- Sanghu – business logic (content filter, levels, RPCs, moderation, billing)
-- All public.* functions here are the ONLY write paths for API clients.
-- =============================================================================

-- ---------- generic helpers -------------------------------------------------------
create or replace function private.setting_int(p_key text, p_default int) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select (value #>> '{}')::int from public.platform_settings where key = p_key), p_default)
$$;

create or replace function private.audit(p_action text, p_target_type text, p_target_id text, p_details jsonb default '{}')
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select id from public.profiles where id = auth.uid()), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'));
$$;

-- strips control/invisible/bidi-override characters, normalises newlines
create or replace function private.clean_text(p text) returns text language sql immutable as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(replace(replace(coalesce(p, ''), E'\r\n', E'\n'), E'\r', E'\n'),
          '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B\u2060\uFEFF\u202A-\u202E\u2066-\u2069]', '', 'g'),
        '[ \t]+\n', E'\n', 'g'),
      E'\n{3,}', E'\n\n', 'g'),
    E' \t\n')
$$;

-- mode: 'own' = signed in, 'act' = not suspended/banned, 'post' = 'act' + not temporarily locked
create or replace function private.require_user(p_mode text default 'post') returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v public.profiles;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v from public.profiles where id = v_uid;
  if not found then raise exception 'not_authenticated'; end if;
  if p_mode = 'own' then return v_uid; end if;
  if v.status = 'banned' then raise exception 'account_banned'; end if;
  if v.status = 'suspended' and (v.suspended_until is null or v.suspended_until > now()) then
    raise exception 'account_suspended';
  end if;
  if p_mode = 'post' and v.posting_locked_until > now() then raise exception 'temporarily_locked'; end if;
  return v_uid;
end $$;

-- ---------- content filter ------------------------------------------------------------
-- 1) NFKC (full-width -> ASCII, half-width kana -> full-width), lower-case,
--    remove zero-width chars, map leetspeak (0->o, 1->i, 3->e, @->a, $->s ...)
create or replace function private.fnorm(p text) returns text language sql immutable as $$
  select translate(
           regexp_replace(lower(normalize(coalesce(p, ''), NFKC)), '[\u00AD\u200B-\u200F\u2060\uFEFF]', '', 'g'),
           '0134578@$!|+€', 'oieastbasiite')
$$;
-- 2) compact form: only letters/digits of Latin, Devanagari, Kana, CJK, Hangul (defeats "f.u-c k")
create or replace function private.fcompact(p text) returns text language sql immutable as $$
  select regexp_replace(private.fnorm(p),
    '[^a-z0-9\u00C0-\u024F\u0900-\u097F\u3040-\u30FA\u30FC-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]+', '', 'g')
$$;
-- 3) collapse repeated characters ("fuuuuck" -> "fuck")
create or replace function private.squeeze(p text) returns text language sql immutable as $$
  select regexp_replace(coalesce(p, ''), '(.)\1+', '\1', 'g')
$$;
-- 4) tokens + adjacent bi/tri-grams + joined runs of single letters ("f u c k")
create or replace function private.ftokens(p text) returns text[] language plpgsql immutable as $$
declare t text[]; o text[] := '{}'; run text := ''; i int; n int;
begin
  t := array_remove(regexp_split_to_array(private.fnorm(p),
         '[^a-z0-9\u00C0-\u024F\u0900-\u097F\u3040-\u30FA\u30FC-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]+'), '');
  n := coalesce(array_length(t, 1), 0);
  for i in 1..n loop
    o := o || t[i];
    if i < n then o := o || (t[i] || t[i+1]); end if;
    if i < n - 1 then o := o || (t[i] || t[i+1] || t[i+2]); end if;
    if char_length(t[i]) = 1 then run := run || t[i];
    else
      if char_length(run) >= 3 then o := o || run; end if;
      run := '';
    end if;
  end loop;
  if char_length(run) >= 3 then o := o || run; end if;
  return o;
end $$;

-- returns {"verdict": allow|warn|review|block, "categories": [...], "terms": [...]}
create or replace function private.check_text(p text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_norm text := private.fnorm(p);
  v_compact text; v_tokens text[]; v_tc text; v_hit boolean; v_urls int;
  v_cats text[] := '{}'; v_terms text[] := '{}'; v_sev text[] := '{}';
  w record;
begin
  -- allow-list phrases are removed first (avoids false positives such as "ばかり")
  for w in select term from public.prohibited_words where is_active and severity = 'allow' loop
    v_norm := replace(v_norm, private.fnorm(w.term), ' ');
  end loop;
  v_compact := private.fcompact(v_norm);
  v_tokens  := private.ftokens(v_norm);
  for w in select term, severity, category, match_type from public.prohibited_words
           where is_active and severity <> 'allow' loop
    v_tc := private.fcompact(w.term);
    continue when v_tc = '';
    if w.match_type = 'phrase' then        -- substring match (Japanese/Devanagari, distinctive slurs)
      v_hit := strpos(v_compact, v_tc) > 0
               or strpos(private.squeeze(v_compact), private.squeeze(v_tc)) > 0;
    else                                   -- whole-word match incl. n-grams and repeated letters
      v_hit := v_tc = any(v_tokens)
               or exists (select 1 from unnest(v_tokens) tok
                          where char_length(tok) > char_length(v_tc)
                            and private.squeeze(tok) = private.squeeze(v_tc));
    end if;
    if v_hit then
      v_terms := v_terms || w.term; v_cats := v_cats || w.category; v_sev := v_sev || w.severity;
    end if;
  end loop;
  -- spam heuristics -> human review
  select count(*) into v_urls from regexp_matches(v_norm, '(https?://|www\.)', 'g');
  if v_urls > 2 then v_cats := v_cats || 'spam'::text; v_sev := v_sev || 'review'::text; end if;
  if char_length(v_compact) > 40 and char_length(private.squeeze(v_compact)) * 4 < char_length(v_compact) then
    v_cats := v_cats || 'spam'::text; v_sev := v_sev || 'review'::text;
  end if;
  return jsonb_build_object(
    'verdict', case when 'severe' = any(v_sev) then 'block' when 'review' = any(v_sev) then 'review'
                    when 'mild' = any(v_sev) then 'warn' else 'allow' end,
    'categories', to_jsonb(array(select distinct unnest(v_cats))),
    'terms', to_jsonb(array(select distinct unnest(v_terms))));
end $$;

-- logs a filter hit; repeated blocks (bypass attempts) => 1h posting lock + automatic report.
-- Never bans automatically.
create or replace function private.record_filter_event(p_uid uuid, p_context text, p_check jsonb, p_text text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count int; v_limit int := private.setting_int('filter_strike_limit', 5);
begin
  insert into public.filter_events (user_id, context, verdict, categories, terms, excerpt)
  values (p_uid, p_context, p_check->>'verdict',
          array(select jsonb_array_elements_text(p_check->'categories')),
          array(select jsonb_array_elements_text(p_check->'terms')), left(p_text, 280));
  if p_check->>'verdict' <> 'block' then return; end if;
  select count(*) into v_count from public.filter_events
   where user_id = p_uid and verdict = 'block' and created_at > now() - interval '24 hours';
  if v_count >= v_limit then
    update public.profiles set posting_locked_until = now() + interval '1 hour' where id = p_uid;
    if not exists (select 1 from public.reports where target_type = 'user' and user_id = p_uid
                   and reason = 'filter_evasion' and status = 'open') then
      insert into public.reports (reporter_id, target_type, user_id, reason, details)
      values (null, 'user', p_uid, 'filter_evasion', format('%s blocked submissions in 24h (automatic flag)', v_count));
    end if;
  end if;
end $$;

create or replace function private.check_rate(p_uid uuid, p_kind text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_last timestamptz; v_count int; v_gap int; v_max int;
begin
  if p_kind = 'post' then
    v_gap := private.setting_int('post_min_interval_seconds', 30); v_max := private.setting_int('posts_per_hour', 10);
    select max(created_at), count(*) into v_last, v_count from public.posts
     where author_id = p_uid and created_at > now() - interval '1 hour';
  else
    v_gap := private.setting_int('comment_min_interval_seconds', 5); v_max := private.setting_int('comments_per_hour', 60);
    select max(created_at), count(*) into v_last, v_count from public.comments
     where author_id = p_uid and created_at > now() - interval '1 hour';
  end if;
  if v_count >= v_max or (v_last is not null and v_last > now() - make_interval(secs => v_gap)) then
    raise exception 'rate_limited';
  end if;
end $$;

-- ---------- levels ---------------------------------------------------------------
-- L1..L11: +5 posts per level (L11 at 50); from L11: +10 per level (L12 at 60 ...)
create or replace function private.level_for_posts(n int) returns int language sql immutable as $$
  select case when coalesce(n, 0) < 50 then greatest(coalesce(n, 0), 0) / 5 + 1 else 11 + (n - 50) / 10 end
$$;

create or replace function private.sync_level() returns trigger language plpgsql as $$
begin new.level := private.level_for_posts(new.valid_posts); return new; end $$;
create trigger progress_level before insert or update on public.user_post_progress
  for each row execute function private.sync_level();

-- credit a published post toward the author's level (idempotent, anti-farming rules)
create or replace function private.credit_post(p_post_id bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_post public.posts; v_prog public.user_post_progress;
        v_today date := (now() at time zone 'Asia/Tokyo')::date;
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if not found or v_post.counted or v_post.status <> 'published' then return; end if;
  if char_length(regexp_replace(v_post.body, '\s', '', 'g')) < private.setting_int('level_min_chars', 10) then return; end if;
  if exists (select 1 from public.posts where author_id = v_post.author_id and id <> v_post.id
             and body_hash = v_post.body_hash and counted) then return; end if;     -- duplicates never count
  select * into v_prog from public.user_post_progress where user_id = v_post.author_id for update;
  if v_prog.credit_day = v_today and v_prog.credits_today >= private.setting_int('level_daily_credit_cap', 10) then
    return;                                                                           -- automation guard
  end if;
  update public.posts set counted = true where id = p_post_id;
  update public.user_post_progress
     set valid_posts = valid_posts + 1,
         credits_today = case when credit_day = v_today then credits_today + 1 else 1 end,
         credit_day = v_today, updated_at = now()
   where user_id = v_post.author_id;
end $$;

create or replace function private.uncredit_post(p_post_id bigint) returns void
language sql security definer set search_path = public, pg_temp as $$
  with p as (update public.posts set counted = false where id = p_post_id and counted returning author_id)
  update public.user_post_progress g set valid_posts = greatest(g.valid_posts - 1, 0), updated_at = now()
    from p where g.user_id = p.author_id;
$$;

create or replace function private.sync_comment_count() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op in ('UPDATE','DELETE') and old.status = 'published' then
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  if tg_op in ('INSERT','UPDATE') and new.status = 'published' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  end if;
  return null;
end $$;
create trigger comments_count after insert or update of status or delete on public.comments
  for each row execute function private.sync_comment_count();

-- ---------- usernames ------------------------------------------------------------------
create or replace function private.username_problem(p_name text, p_uid uuid, p_premium boolean) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v text := lower(coalesce(p_name, '')); w record; v_tc text; v_c text;
begin
  if v !~ '^[a-z0-9]+$' then return 'invalid_chars'; end if;
  if char_length(v) < 3 then return 'too_short'; end if;
  if char_length(v) > 20 then return 'too_long'; end if;
  if char_length(v) < 5 and not coalesce(p_premium, false) then return 'premium_required'; end if;
  if v ~ '^[0-9]+$' then return 'needs_letter'; end if;
  v_c := private.fcompact(v);
  for w in select term from public.prohibited_words where is_active and severity <> 'allow' loop
    v_tc := private.fcompact(w.term);
    if v_tc <> '' and (v_c = v_tc or private.squeeze(v_c) = private.squeeze(v_tc)
                       or (char_length(v_tc) >= 4 and strpos(v_c, v_tc) > 0)) then
      return 'inappropriate';
    end if;
  end loop;
  if exists (select 1 from public.profiles where username = v and id is distinct from p_uid)
     or exists (select 1 from public.username_reservations r where r.username = v
                and (r.expires_at is null or r.expires_at > now()) and r.user_id is distinct from p_uid) then
    return 'taken';
  end if;
  return null;
end $$;

-- applies a (pre-validated) new username and keeps the old one reserved for its owner
create or replace function private.apply_username(p_uid uuid, p_new text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old text;
begin
  select username into v_old from public.profiles where id = p_uid for update;
  if v_old = p_new then return; end if;
  delete from public.username_reservations where username = p_new and user_id = p_uid;
  if char_length(v_old) >= 5 and char_length(p_new) < 5 then
    -- standard -> premium short name: the standard name is kept as fallback (no expiry)
    delete from public.username_reservations where user_id = p_uid and kind = 'fallback';
    insert into public.username_reservations (username, user_id, kind, expires_at) values (v_old, p_uid, 'fallback', null)
      on conflict (username) do update set user_id = excluded.user_id, kind = 'fallback', expires_at = null;
  else
    insert into public.username_reservations (username, user_id, kind, expires_at)
    values (v_old, p_uid, 'hold', now() + make_interval(days => private.setting_int('username_hold_days', 30)))
      on conflict (username) do update set user_id = excluded.user_id, kind = 'hold', expires_at = excluded.expires_at;
    if char_length(p_new) >= 5 then
      update public.username_reservations set kind = 'hold',
             expires_at = now() + make_interval(days => private.setting_int('username_hold_days', 30))
       where user_id = p_uid and kind = 'fallback';
    end if;
  end if;
  update public.profiles set username = p_new, username_changed_at = now() where id = p_uid;
  perform private.audit('username_change', 'user', p_uid::text, jsonb_build_object('from', v_old, 'to', p_new));
end $$;

-- premium ended: restore the standard username, hold the short one for its owner
create or replace function private.revert_premium_username(p_uid uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_short text; v_fb text;
begin
  select username into v_short from public.profiles where id = p_uid for update;
  if v_short is null or char_length(v_short) >= 5 then return; end if;
  select username into v_fb from public.username_reservations where user_id = p_uid and kind = 'fallback' limit 1;
  if v_fb is null or private.username_problem(v_fb, p_uid, false) is not null then
    v_fb := 'member' || substr(md5(p_uid::text || clock_timestamp()::text), 1, 8);
  end if;
  delete from public.username_reservations where username = v_fb and user_id = p_uid;
  insert into public.username_reservations (username, user_id, kind, expires_at)
  values (v_short, p_uid, 'hold', now() + make_interval(days => private.setting_int('premium_username_hold_days', 30)))
    on conflict (username) do update set user_id = excluded.user_id, kind = 'hold', expires_at = excluded.expires_at;
  update public.profiles set username = v_fb where id = p_uid;
  perform private.audit('premium_username_released', 'user', p_uid::text, jsonb_build_object('short', v_short, 'restored', v_fb));
end $$;

-- profile row for every new auth user (username comes from sign-up metadata)
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text := lower(btrim(coalesce(new.raw_user_meta_data->>'username', '')));
        v_country text := upper(coalesce(new.raw_user_meta_data->>'residence_country', 'JP'));
begin
  if coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'registration_open'), true) = false then
    raise exception 'registration_closed';
  end if;
  if private.username_problem(v_name, null, false) is not null then
    v_name := 'member' || substr(md5(new.id::text || clock_timestamp()::text), 1, 8);
  end if;
  if v_country !~ '^[A-Z]{2}$' then v_country := 'JP'; end if;
  insert into public.profiles (id, username, residence_country) values (new.id, v_name, v_country);
  insert into public.profile_details (user_id) values (new.id);
  insert into public.user_post_progress (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ======================================================================================
-- PUBLIC RPCs (callable by signed-in users unless noted)
-- ======================================================================================
create or replace function public.username_available(p_name text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v text := lower(btrim(coalesce(p_name, ''))); v_problem text;
begin
  v_problem := private.username_problem(v, auth.uid(), true);
  return jsonb_build_object('username', v, 'available', v_problem is null, 'problem', v_problem,
                            'premium_only', char_length(v) between 3 and 4);
end $$;

create or replace function public.create_post(p_body text, p_ack_warning boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_user('post'); v_body text := private.clean_text(p_body);
        v_check jsonb; v_hash text; v_status text := 'published'; v_reason text; v_id bigint;
begin
  if v_body = '' then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  if char_length(v_body) > 5000 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  perform private.check_rate(v_uid, 'post');
  v_check := private.check_text(v_body);
  if v_check->>'verdict' = 'block' then
    perform private.record_filter_event(v_uid, 'post', v_check, v_body);
    return jsonb_build_object('ok', false, 'error', 'blocked', 'categories', v_check->'categories');
  end if;
  if v_check->>'verdict' = 'warn' and not coalesce(p_ack_warning, false) then
    return jsonb_build_object('ok', false, 'warning', true, 'categories', v_check->'categories');
  end if;
  v_hash := md5(private.fcompact(v_body));
  if exists (select 1 from public.posts where author_id = v_uid and body_hash = v_hash
             and status <> 'deleted' and created_at > now() - interval '30 days') then
    return jsonb_build_object('ok', false, 'error', 'duplicate');
  end if;
  if v_check->>'verdict' = 'review' then
    v_status := 'pending_review'; v_reason := 'filter';
  elsif char_length(v_body) >= 30 and (select count(distinct author_id) from public.posts
         where body_hash = v_hash and author_id <> v_uid and created_at > now() - interval '24 hours') >= 2 then
    v_status := 'pending_review'; v_reason := 'spam:copy_paste';
  end if;
  insert into public.posts (author_id, body, body_hash, status, review_reason)
  values (v_uid, v_body, v_hash, v_status, v_reason) returning id into v_id;
  if v_check->>'verdict' = 'review' then perform private.record_filter_event(v_uid, 'post', v_check, v_body); end if;
  if v_status = 'published' then perform private.credit_post(v_id); end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'status', v_status);
end $$;

create or replace function public.update_post(p_id bigint, p_body text, p_ack_warning boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_user('post'); v_body text := private.clean_text(p_body);
        v_post public.posts; v_check jsonb; v_status text;
begin
  select * into v_post from public.posts where id = p_id for update;
  if not found or v_post.author_id <> v_uid or v_post.status not in ('published','pending_review') then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_body = '' then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  if char_length(v_body) > 5000 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  v_check := private.check_text(v_body);
  if v_check->>'verdict' = 'block' then
    perform private.record_filter_event(v_uid, 'post_edit', v_check, v_body);
    return jsonb_build_object('ok', false, 'error', 'blocked', 'categories', v_check->'categories');
  end if;
  if v_check->>'verdict' = 'warn' and not coalesce(p_ack_warning, false) then
    return jsonb_build_object('ok', false, 'warning', true, 'categories', v_check->'categories');
  end if;
  v_status := case when v_check->>'verdict' = 'review' then 'pending_review' else v_post.status end;
  update public.posts set body = v_body, body_hash = md5(private.fcompact(v_body)), status = v_status,
         edited_at = now(), review_reason = case when v_status <> v_post.status then 'filter:edit' else review_reason end
   where id = p_id;
  if v_check->>'verdict' = 'review' then perform private.record_filter_event(v_uid, 'post_edit', v_check, v_body); end if;
  return jsonb_build_object('ok', true, 'id', p_id, 'status', v_status);
end $$;

-- soft delete: text is wiped immediately; level credit is kept (levels are permanent)
create or replace function public.delete_post(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_user('own');
begin
  update public.posts set status = 'deleted', body = '', edited_at = now()
   where id = p_id and author_id = v_uid and status in ('published','pending_review');
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  delete from public.comments where post_id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.create_comment(p_post_id bigint, p_body text, p_ack_warning boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_user('post'); v_body text := private.clean_text(p_body);
        v_check jsonb; v_status text := 'published'; v_id bigint;
begin
  if not exists (select 1 from public.posts where id = p_post_id and status = 'published') then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_body = '' then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  if char_length(v_body) > 2000 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  perform private.check_rate(v_uid, 'comment');
  v_check := private.check_text(v_body);
  if v_check->>'verdict' = 'block' then
    perform private.record_filter_event(v_uid, 'comment', v_check, v_body);
    return jsonb_build_object('ok', false, 'error', 'blocked', 'categories', v_check->'categories');
  end if;
  if v_check->>'verdict' = 'warn' and not coalesce(p_ack_warning, false) then
    return jsonb_build_object('ok', false, 'warning', true, 'categories', v_check->'categories');
  end if;
  if v_check->>'verdict' = 'review' then v_status := 'pending_review'; end if;
  insert into public.comments (post_id, author_id, body, status, review_reason)
  values (p_post_id, v_uid, v_body, v_status, case when v_status = 'pending_review' then 'filter' end)
  returning id into v_id;
  if v_status = 'pending_review' then perform private.record_filter_event(v_uid, 'comment', v_check, v_body); end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'status', v_status, 'post_id', p_post_id);
end $$;

create or replace function public.update_comment(p_id bigint, p_body text, p_ack_warning boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_user('post'); v_body text := private.clean_text(p_body);
        v_c public.comments; v_check jsonb; v_status text;
begin
  select * into v_c from public.comments where id = p_id for update;
  if not found or v_c.author_id <> v_uid or v_c.status not in ('published','pending_review') then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_body = '' then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  if char_length(v_body) > 2000 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  v_check := private.check_text(v_body);
  if v_check->>'verdict' = 'block' then
    perform private.record_filter_event(v_uid, 'comment_edit', v_check, v_body);
    return jsonb_build_object('ok', false, 'error', 'blocked', 'categories', v_check->'categories');
  end if;
  if v_check->>'verdict' = 'warn' and not coalesce(p_ack_warning, false) then
    return jsonb_build_object('ok', false, 'warning', true, 'categories', v_check->'categories');
  end if;
  v_status := case when v_check->>'verdict' = 'review' then 'pending_review' else v_c.status end;
  update public.comments set body = v_body, status = v_status, edited_at = now() where id = p_id;
  if v_check->>'verdict' = 'review' then perform private.record_filter_event(v_uid, 'comment_edit', v_check, v_body); end if;
  return jsonb_build_object('ok', true, 'id', p_id, 'status', v_status, 'post_id', v_c.post_id);
end $$;

create or replace function public.delete_comment(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_user('own'); v_post bigint;
begin
  update public.comments set status = 'deleted', body = '', edited_at = now()
   where id = p_id and author_id = v_uid and status in ('published','pending_review') returning post_id into v_post;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'post_id', v_post);
end $$;

create or replace function public.get_profile(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v public.profiles; d public.profile_details; g public.user_post_progress; v_self boolean;
begin
  select * into v from public.profiles where username = lower(btrim(coalesce(p_username, '')));
  if not found then return null; end if;
  select * into d from public.profile_details where user_id = v.id;
  select * into g from public.user_post_progress where user_id = v.id;
  v_self := v.id = auth.uid();
  return jsonb_build_object(
    'id', v.id, 'username', v.username, 'residence_country', v.residence_country, 'created_at', v.created_at,
    'is_premium', coalesce(v.premium_until > now(), false), 'is_banned', v.status = 'banned',
    'level', coalesce(g.level, 1), 'valid_posts', coalesce(g.valid_posts, 0),
    'age',         case when v_self or d.show_age then d.age end,
    'nationality', case when v_self or d.show_nationality then d.nationality end,
    'city',        case when v_self or d.show_city then d.city end,
    'bio',         case when v_self or d.show_bio then d.bio end,
    'post_count',    (select count(*) from public.posts where author_id = v.id and status = 'published'),
    'comment_count', (select count(*) from public.comments where author_id = v.id and status = 'published'),
    'is_self', v_self);
end $$;

create or replace function public.update_my_profile(
  p_residence text, p_nationality text, p_city text, p_age int, p_bio text,
  p_show_age boolean, p_show_nationality boolean, p_show_city boolean, p_show_bio boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_user('own');
        v_city text := nullif(private.clean_text(p_city), ''); v_bio text := nullif(private.clean_text(p_bio), '');
        v_nat text := nullif(upper(btrim(coalesce(p_nationality, ''))), ''); v_check jsonb;
begin
  if upper(coalesce(p_residence, '')) !~ '^[A-Z]{2}$' or (v_nat is not null and v_nat !~ '^[A-Z]{2}$') then
    return jsonb_build_object('ok', false, 'error', 'invalid_country');
  end if;
  if p_age is not null and (p_age < 16 or p_age > 120) then return jsonb_build_object('ok', false, 'error', 'invalid_age'); end if;
  if char_length(v_city) > 60 or char_length(v_bio) > 300 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  v_check := private.check_text(coalesce(v_city, '') || E'\n' || coalesce(v_bio, ''));
  if v_check->>'verdict' <> 'allow' then
    if v_check->>'verdict' = 'block' then perform private.record_filter_event(v_uid, 'profile', v_check, v_bio); end if;
    return jsonb_build_object('ok', false, 'error', 'inappropriate', 'categories', v_check->'categories');
  end if;
  update public.profiles set residence_country = upper(p_residence) where id = v_uid;
  update public.profile_details set age = p_age, nationality = v_nat, city = v_city, bio = v_bio,
         show_age = coalesce(p_show_age, false), show_nationality = coalesce(p_show_nationality, true),
         show_city = coalesce(p_show_city, true), show_bio = coalesce(p_show_bio, true), updated_at = now()
   where user_id = v_uid;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.change_username(p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_user('act'); v_new text := lower(btrim(coalesce(p_name, '')));
        v_prof public.profiles; v_problem text;
begin
  select * into v_prof from public.profiles where id = v_uid for update;
  if v_new = v_prof.username then return jsonb_build_object('ok', true, 'username', v_new); end if;
  v_problem := private.username_problem(v_new, v_uid, coalesce(v_prof.premium_until > now(), false));
  if v_problem is not null then return jsonb_build_object('ok', false, 'error', v_problem); end if;
  if v_prof.username_changed_at > now() - make_interval(days => private.setting_int('username_change_cooldown_days', 30))
     and not (char_length(v_new) < 5 and char_length(v_prof.username) >= 5) then
    return jsonb_build_object('ok', false, 'error', 'cooldown');
  end if;
  perform private.apply_username(v_uid, v_new);
  return jsonb_build_object('ok', true, 'username', v_new);
end $$;

-- hold a premium short name while the user completes Stripe Checkout
create or replace function public.reserve_premium_username(p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_user('act'); v_new text := lower(btrim(coalesce(p_name, ''))); v_problem text;
begin
  v_problem := private.username_problem(v_new, v_uid, true);
  if v_problem is not null then return jsonb_build_object('ok', false, 'error', v_problem); end if;
  delete from public.username_reservations where user_id = v_uid and kind = 'checkout';
  insert into public.username_reservations (username, user_id, kind, expires_at)
  values (v_new, v_uid, 'checkout', now() + interval '2 hours')
  on conflict (username) do update set user_id = excluded.user_id, kind = 'checkout', expires_at = excluded.expires_at
   where public.username_reservations.user_id = v_uid or public.username_reservations.expires_at < now();
  if not found then return jsonb_build_object('ok', false, 'error', 'taken'); end if;
  return jsonb_build_object('ok', true, 'username', v_new);
end $$;

create or replace function public.create_report(p_target_type text, p_target_id text, p_reason text, p_details text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_user('act'); v_post bigint; v_comment bigint; v_user uuid;
        v_details text := nullif(left(private.clean_text(p_details), 1000), '');
begin
  if p_reason not in ('abusive','harassment','hate','spam','scam','threat','inappropriate','other') then
    return jsonb_build_object('ok', false, 'error', 'invalid_reason');
  end if;
  if (select count(*) from public.reports where reporter_id = v_uid and created_at > now() - interval '24 hours')
     >= private.setting_int('reports_per_day', 20) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if p_target_type = 'post' and p_target_id ~ '^[0-9]{1,18}$' then
    select id, author_id into v_post, v_user from public.posts where id = p_target_id::bigint and status in ('published','pending_review');
  elsif p_target_type = 'comment' and p_target_id ~ '^[0-9]{1,18}$' then
    select id, author_id into v_comment, v_user from public.comments where id = p_target_id::bigint and status in ('published','pending_review');
  elsif p_target_type = 'user' then
    select id into v_user from public.profiles where username = lower(btrim(p_target_id));
  end if;
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_user = v_uid then return jsonb_build_object('ok', false, 'error', 'self_report'); end if;
  insert into public.reports (reporter_id, target_type, post_id, comment_id, user_id, reason, details)
  values (v_uid, p_target_type, v_post, v_comment, v_user, p_reason, v_details)
  on conflict do nothing;
  if not found then return jsonb_build_object('ok', false, 'error', 'already_reported'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.my_staff_role() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select jsonb_build_object('role', role, 'can_suspend', can_suspend or role <> 'moderator')
                   from public.admin_roles where user_id = auth.uid()), jsonb_build_object('role', null, 'can_suspend', false))
$$;

-- ======================================================================================
-- STAFF RPCs (moderator = rank 1, admin = 2, super_admin = 3). All audited.
-- ======================================================================================
create or replace function public.mod_act_on_content(p_type text, p_id bigint, p_action text, p_reason text, p_report_id bigint default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_rank int := private.staff_rank(auth.uid()); v_author uuid; v_old text; v_new text;
begin
  if v_rank < 1 then raise exception 'forbidden'; end if;
  if p_action not in ('remove','restore','approve') or p_type not in ('post','comment') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_action = 'remove' and coalesce(btrim(p_reason), '') = '' then return jsonb_build_object('ok', false, 'error', 'reason_required'); end if;
  if p_type = 'post' then select author_id, status into v_author, v_old from public.posts where id = p_id for update;
  else select author_id, status into v_author, v_old from public.comments where id = p_id for update; end if;
  if v_author is null or v_old = 'deleted' then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if (p_action = 'approve' and v_old <> 'pending_review') or (p_action = 'restore' and v_old <> 'removed')
     or (p_action = 'remove' and v_old = 'removed') then
    return jsonb_build_object('ok', false, 'error', 'invalid_state');
  end if;
  if v_author <> v_uid and v_rank < 3 and private.staff_rank(v_author) >= v_rank then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  v_new := case p_action when 'remove' then 'removed' else 'published' end;
  if p_type = 'post' then
    update public.posts set status = v_new, review_reason = case when p_action = 'remove' then left(p_reason, 300) else review_reason end where id = p_id;
    if p_action = 'remove' then perform private.uncredit_post(p_id); else perform private.credit_post(p_id); end if;
  else
    update public.comments set status = v_new, review_reason = case when p_action = 'remove' then left(p_reason, 300) else review_reason end where id = p_id;
  end if;
  insert into public.moderation_actions (actor_id, action, target_type, target_id, reason, report_id)
  values (v_uid, p_action || '_' || p_type, p_type, p_id::text, p_reason, p_report_id);
  perform private.audit('moderation.' || p_action || '_' || p_type, p_type, p_id::text, jsonb_build_object('reason', p_reason, 'author', v_author));
  if p_action = 'remove' or p_report_id is not null then
    update public.reports set status = 'resolved', handled_by = v_uid, handled_at = now(), resolution_note = coalesce(p_reason, p_action)
     where status = 'open' and (id = p_report_id or (p_action = 'remove' and
           ((p_type = 'post' and post_id = p_id) or (p_type = 'comment' and comment_id = p_id))));
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.mod_resolve_report(p_id bigint, p_status text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if private.staff_rank(auth.uid()) < 1 then raise exception 'forbidden'; end if;
  if p_status not in ('resolved','dismissed') then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  update public.reports set status = p_status, handled_by = auth.uid(), handled_at = now(), resolution_note = left(p_note, 500)
   where id = p_id and status = 'open';
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  insert into public.moderation_actions (actor_id, action, target_type, target_id, reason, report_id)
  values (auth.uid(), 'report_' || p_status, 'report', p_id::text, p_note, p_id);
  perform private.audit('report.' || p_status, 'report', p_id::text, jsonb_build_object('note', p_note));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.staff_set_user_status(p_user_id uuid, p_status text, p_days int, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rank int := private.staff_rank(auth.uid()); v_can boolean;
begin
  if v_rank < 1 then raise exception 'forbidden'; end if;
  if p_status not in ('active','suspended','banned') then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if p_user_id = auth.uid() or private.staff_rank(p_user_id) >= v_rank then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if v_rank = 1 then
    select can_suspend into v_can from public.admin_roles where user_id = auth.uid();
    if not coalesce(v_can, false) or p_status = 'banned' then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  end if;
  if coalesce(btrim(p_reason), '') = '' then return jsonb_build_object('ok', false, 'error', 'reason_required'); end if;
  update public.profiles set status = p_status,
         suspended_until = case when p_status = 'suspended' and p_days is not null then now() + make_interval(days => greatest(p_days, 1)) end
   where id = p_user_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  insert into public.moderation_actions (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'user_' || p_status, 'user', p_user_id::text, p_reason);
  perform private.audit('user.status_' || p_status, 'user', p_user_id::text, jsonb_build_object('days', p_days, 'reason', p_reason));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_set_role(p_user_id uuid, p_role text, p_can_suspend boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rank int := private.staff_rank(auth.uid()); v_target int := private.staff_rank(p_user_id);
        v_new int := case p_role when 'super_admin' then 3 when 'admin' then 2 when 'moderator' then 1 else 0 end;
begin
  if v_rank < 2 then raise exception 'forbidden'; end if;
  if p_user_id = auth.uid() then return jsonb_build_object('ok', false, 'error', 'cannot_change_self'); end if;
  if p_role is not null and v_new = 0 then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if v_rank < 3 and (v_target >= 2 or v_new >= 2) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if p_role is null then delete from public.admin_roles where user_id = p_user_id;
  else
    insert into public.admin_roles (user_id, role, can_suspend, granted_by) values (p_user_id, p_role, coalesce(p_can_suspend, false), auth.uid())
    on conflict (user_id) do update set role = excluded.role, can_suspend = excluded.can_suspend, granted_by = excluded.granted_by;
  end if;
  perform private.audit('role.set', 'user', p_user_id::text, jsonb_build_object('role', p_role, 'can_suspend', p_can_suspend));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_upsert_word(p_id bigint, p_term text, p_language text, p_severity text,
  p_category text, p_match_type text, p_active boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_term text := lower(normalize(btrim(coalesce(p_term, '')), NFKC)); v_id bigint;
begin
  if private.staff_rank(auth.uid()) < 2 then raise exception 'forbidden'; end if;
  if v_term = '' then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  if p_id is null then
    insert into public.prohibited_words (term, language, severity, category, match_type, is_active, created_by)
    values (v_term, p_language, p_severity, p_category, p_match_type, coalesce(p_active, true), auth.uid())
    on conflict (term, language) do update set severity = excluded.severity, category = excluded.category,
       match_type = excluded.match_type, is_active = excluded.is_active
    returning id into v_id;
  else
    update public.prohibited_words set term = v_term, language = p_language, severity = p_severity, category = p_category,
           match_type = p_match_type, is_active = coalesce(p_active, true) where id = p_id returning id into v_id;
  end if;
  perform private.audit('word.upsert', 'word', v_id::text, jsonb_build_object('term', v_term, 'severity', p_severity, 'active', p_active));
  return jsonb_build_object('ok', v_id is not null, 'id', v_id);
exception when check_violation then return jsonb_build_object('ok', false, 'error', 'invalid');
end $$;

create or replace function public.admin_delete_word(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_term text;
begin
  if private.staff_rank(auth.uid()) < 2 then raise exception 'forbidden'; end if;
  delete from public.prohibited_words where id = p_id returning term into v_term;
  perform private.audit('word.delete', 'word', p_id::text, jsonb_build_object('term', v_term));
  return jsonb_build_object('ok', v_term is not null);
end $$;

create or replace function public.admin_update_setting(p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_scope text; v_old jsonb;
begin
  select scope, value into v_scope, v_old from public.platform_settings where key = p_key;
  if v_scope is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if private.staff_rank(auth.uid()) < (case v_scope when 'community' then 2 else 3 end) then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_value) <> jsonb_typeof(v_old) then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  update public.platform_settings set value = p_value, updated_by = auth.uid(), updated_at = now() where key = p_key;
  perform private.audit('setting.update', 'setting', p_key, jsonb_build_object('from', v_old, 'to', p_value));
  return jsonb_build_object('ok', true);
end $$;

-- super admin: correct a user's level progress (e.g. after abuse investigation)
create or replace function public.admin_adjust_progress(p_user_id uuid, p_valid_posts int, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old int;
begin
  if private.staff_rank(auth.uid()) < 3 then raise exception 'forbidden'; end if;
  if p_valid_posts is null or p_valid_posts < 0 or coalesce(btrim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select valid_posts into v_old from public.user_post_progress where user_id = p_user_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  update public.user_post_progress set valid_posts = p_valid_posts, updated_at = now() where user_id = p_user_id;
  perform private.audit('progress.adjust', 'user', p_user_id::text, jsonb_build_object('from', v_old, 'to', p_valid_posts, 'reason', p_reason));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if private.staff_rank(auth.uid()) < 2 then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'users',          (select count(*) from public.profiles),
    'users_7d',       (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'posts',          (select count(*) from public.posts where status = 'published'),
    'posts_24h',      (select count(*) from public.posts where created_at > now() - interval '24 hours'),
    'comments_24h',   (select count(*) from public.comments where created_at > now() - interval '24 hours'),
    'open_reports',   (select count(*) from public.reports where status = 'open'),
    'pending_review', (select count(*) from public.posts where status = 'pending_review')
                    + (select count(*) from public.comments where status = 'pending_review'),
    'premium',        (select count(*) from public.profiles where premium_until > now()),
    'suspended',      (select count(*) from public.profiles where status <> 'active'));
end $$;

-- ======================================================================================
-- BILLING RPCs – service_role only (called by the verified Stripe webhook)
-- ======================================================================================
create or replace function public.billing_apply_subscription(p_user_id uuid, p_customer text, p_subscription text,
  p_status text, p_price text, p_period_end timestamptz, p_cancel_at_period_end boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_until timestamptz; v_res text; v_applied text;
begin
  if not exists (select 1 from public.profiles where id = p_user_id) then return jsonb_build_object('ok', false, 'error', 'no_user'); end if;
  insert into public.subscriptions as s (user_id, stripe_customer_id, stripe_subscription_id, status, price_id, current_period_end, cancel_at_period_end, updated_at)
  values (p_user_id, p_customer, p_subscription, p_status, p_price, p_period_end, coalesce(p_cancel_at_period_end, false), now())
  on conflict (user_id) do update set
     stripe_customer_id = coalesce(excluded.stripe_customer_id, s.stripe_customer_id),
     stripe_subscription_id = coalesce(excluded.stripe_subscription_id, s.stripe_subscription_id),
     status = excluded.status, price_id = coalesce(excluded.price_id, s.price_id),
     current_period_end = coalesce(excluded.current_period_end, s.current_period_end),
     cancel_at_period_end = excluded.cancel_at_period_end, updated_at = now();
  -- premium only after the provider confirms payment; past_due keeps a grace period
  v_until := case when p_status in ('active','trialing') then p_period_end + interval '2 days'
                  when p_status = 'past_due' then p_period_end + make_interval(days => private.setting_int('premium_grace_days', 7))
                  else null end;
  update public.profiles set premium_until = v_until where id = p_user_id;
  if v_until > now() then
    select username into v_res from public.username_reservations
     where user_id = p_user_id and kind = 'checkout' order by created_at desc limit 1;
    if v_res is not null and private.username_problem(v_res, p_user_id, true) is null then
      perform private.apply_username(p_user_id, v_res);
      v_applied := v_res;
    end if;
    delete from public.username_reservations where user_id = p_user_id and kind = 'checkout';
  else
    perform private.revert_premium_username(p_user_id);
  end if;
  perform private.audit('billing.subscription', 'user', p_user_id::text,
    jsonb_build_object('status', p_status, 'premium_until', v_until, 'username_applied', v_applied));
  return jsonb_build_object('ok', true, 'premium_until', v_until, 'username_applied', v_applied);
end $$;

create or replace function public.billing_record_payment(p_user_id uuid, p_invoice text, p_amount int, p_currency text,
  p_status text, p_url text, p_period_end timestamptz) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.payments as p (user_id, stripe_invoice_id, amount, currency, status, hosted_invoice_url, period_end)
  values (p_user_id, p_invoice, p_amount, p_currency, p_status, p_url, p_period_end)
  on conflict (stripe_invoice_id) do update set status = excluded.status, amount = excluded.amount,
     hosted_invoice_url = coalesce(excluded.hosted_invoice_url, p.hosted_invoice_url);
$$;

-- safety net if a webhook was missed: release short names of lapsed members (schedule daily via pg_cron)
create or replace function public.billing_expire_lapsed() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; n int := 0;
begin
  for r in select id from public.profiles where char_length(username) < 5 and (premium_until is null or premium_until < now()) loop
    perform private.revert_premium_username(r.id); n := n + 1;
  end loop;
  update public.profiles set premium_until = null where premium_until < now() - interval '30 days';
  return n;
end $$;

-- ---------- execute privileges ----------------------------------------------------------
revoke all on all functions in schema public  from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.staff_rank(uuid), private.is_staff() to anon, authenticated;
grant execute on function public.username_available(text), public.get_profile(text) to anon, authenticated;
grant execute on function
  public.create_post(text, boolean), public.update_post(bigint, text, boolean), public.delete_post(bigint),
  public.create_comment(bigint, text, boolean), public.update_comment(bigint, text, boolean), public.delete_comment(bigint),
  public.update_my_profile(text, text, text, int, text, boolean, boolean, boolean, boolean),
  public.change_username(text), public.reserve_premium_username(text),
  public.create_report(text, text, text, text), public.my_staff_role(),
  public.mod_act_on_content(text, bigint, text, text, bigint), public.mod_resolve_report(bigint, text, text),
  public.staff_set_user_status(uuid, text, int, text), public.admin_set_role(uuid, text, boolean),
  public.admin_upsert_word(bigint, text, text, text, text, text, boolean), public.admin_delete_word(bigint),
  public.admin_update_setting(text, jsonb), public.admin_adjust_progress(uuid, int, text), public.admin_stats()
to authenticated;
grant execute on function
  public.billing_apply_subscription(uuid, text, text, text, text, timestamptz, boolean),
  public.billing_record_payment(uuid, text, int, text, text, text, timestamptz),
  public.billing_expire_lapsed()
to service_role;
