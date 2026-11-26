-- Sanghu database test-suite. Run with scripts/test-db.sh on a DISPOSABLE database.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
\o /dev/null
create schema tests;
grant usage on schema tests to public;
create function tests.login(p_username text) returns void language sql as $$
  select set_config('request.jwt.claims', coalesce(json_build_object('sub', (select id from public.profiles where username = p_username), 'role', 'authenticated')::text, ''), false) $$;
create function tests.ok(p jsonb, p_msg text) returns void language plpgsql as $$
begin if not coalesce((p->>'ok')::boolean, false) then raise exception 'FAIL %: %', p_msg, p; end if; end $$;
create function tests.err(p jsonb, p_code text, p_msg text) returns void language plpgsql as $$
begin if coalesce(p->>'error', '') <> p_code then raise exception 'FAIL % (expected %): %', p_msg, p_code, p; end if; end $$;
create function tests.pass(p_msg text) returns void language plpgsql as $$ begin raise notice 'PASS  %', p_msg; end $$;
grant execute on all functions in schema tests to public;

update public.platform_settings set value = '0'    where key in ('post_min_interval_seconds','comment_min_interval_seconds');
update public.platform_settings set value = '1000' where key in ('posts_per_hour','comments_per_hour','level_daily_credit_cap');

insert into auth.users (email, raw_user_meta_data) values
  ('a@x.test','{"username":"ramesh01"}'), ('b@x.test','{"username":"Sita2024","residence_country":"au"}'),
  ('m@x.test','{"username":"modguy1"}'), ('ad@x.test','{"username":"admin01"}'), ('s@x.test','{"username":"boss001"}'),
  ('bad@x.test','{"username":"fuckboy1"}'), ('short@x.test','{"username":"abc"}'), ('t@x.test','{"username":"troll99"}');
insert into public.admin_roles (user_id, role) select id, 'moderator'   from public.profiles where username = 'modguy1';
insert into public.admin_roles (user_id, role) select id, 'admin'       from public.profiles where username = 'admin01';
insert into public.admin_roles (user_id, role) select id, 'super_admin' from public.profiles where username = 'boss001';

do $$ begin
  assert (select count(*) from public.profiles) = 8;
  assert (select residence_country from public.profiles where username = 'sita2024') = 'AU';
  assert (select count(*) from public.profiles where username like 'member%') = 2, 'inappropriate/short names replaced';
  assert private.level_for_posts(0) = 1 and private.level_for_posts(4) = 1 and private.level_for_posts(5) = 2
     and private.level_for_posts(40) = 9 and private.level_for_posts(45) = 10 and private.level_for_posts(49) = 10
     and private.level_for_posts(50) = 11 and private.level_for_posts(59) = 11 and private.level_for_posts(60) = 12
     and private.level_for_posts(90) = 15 and private.level_for_posts(100) = 16, 'level table';
  perform tests.pass('sign-up trigger (lower-case, country, bad names replaced) + level formula table');
end $$;

-- ---------------------------------------------------------------- content filter
do $$ declare c record; v text; n int := 0; begin
  for c in select * from (values
    ('I disagree with you, this is a bad plan.', 'allow'),
    ('ゴミ出しのルールを教えてください', 'allow'),
    ('今日は寝てばかりいた', 'allow'),
    ('Please assess the class schedule', 'allow'),
    ('Learn this skill yourself', 'allow'),
    ('チョンボしちゃった', 'allow'),
    ('This is f u c k i n g annoying', 'warn'),
    ('sh1t happens', 'warn'),
    ('what the fuuuuck', 'warn'),
    ('ＦＵＣＫ this', 'warn'),
    ('バカじゃないの', 'warn'),
    ('ﾊﾞｶじゃないの', 'warn'),
    ('kill yourself', 'block'),
    ('k.y.s', 'block'),
    ('お前なんか死ね', 'block'),
    ('死・ね', 'block'),
    ('तँ मुजी हो', 'block'),
    ('timi muuuji hau', 'block'),
    ('m a c h i k n e', 'block'),
    ('M@chikne', 'block'),
    ('guaranteed visa, whatsapp me', 'review'),
    ('visit http://a.example http://b.example http://c.example', 'review'),
    ('闇バイトの募集', 'review')
  ) t(txt, expected) loop
    v := private.check_text(c.txt)->>'verdict'; n := n + 1;
    if v <> c.expected then raise exception 'FAIL filter: "%" => % (expected %)', c.txt, v, c.expected; end if;
  end loop;
  perform tests.pass(format('content filter: %s multilingual cases (EN/JA/NE/romanized, leet, spacing, repeats, width)', n));
end $$;

-- ---------------------------------------------------------------- posting + levels
set role authenticated;
select tests.login('ramesh01');
do $$ declare r jsonb; begin
  r := public.create_post(E'Hello everyone!\n\n\n\nWhere can I find cheap rice in Tokyo?');
  perform tests.ok(r, 'normal post');
  assert r->>'status' = 'published';
  assert (select body from public.posts where id = (r->>'id')::bigint) = E'Hello everyone!\n\nWhere can I find cheap rice in Tokyo?', 'text cleaned';
  assert (select valid_posts from public.user_post_progress where user_id = auth.uid()) = 1;
  perform tests.pass('post published, cleaned and credited');
end $$;

do $$ begin
  begin insert into public.posts (author_id, body) values (auth.uid(), 'direct'); raise exception 'FAIL direct insert';
  exception when insufficient_privilege then null; end;
  begin update public.user_post_progress set valid_posts = 999 where user_id = auth.uid(); raise exception 'FAIL progress update';
  exception when insufficient_privilege then null; end;
  begin update public.profiles set username = 'abc', premium_until = now() + interval '1 year' where id = auth.uid(); raise exception 'FAIL profile update';
  exception when insufficient_privilege then null; end;
  begin insert into public.admin_roles (user_id, role) values (auth.uid(), 'super_admin'); raise exception 'FAIL self-promotion';
  exception when insufficient_privilege then null; end;
  begin perform public.billing_apply_subscription(auth.uid(), 'c', 's', 'active', 'p', now() + interval '30 days', false); raise exception 'FAIL billing rpc';
  exception when insufficient_privilege then null; end;
  begin perform private.credit_post(1); raise exception 'FAIL private function';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from public.stripe_events; raise exception 'FAIL stripe_events readable';
  exception when insufficient_privilege then null; end;
  perform tests.pass('direct writes, self-promotion, billing & private functions denied to users');
end $$;

do $$ declare r jsonb; i int; v_id bigint; begin
  for i in 2..50 loop
    r := public.create_post(format('Question number %s about daily life in Japan', i));
    perform tests.ok(r, 'bulk post ' || i);
  end loop;
  assert (select valid_posts from public.user_post_progress where user_id = auth.uid()) = 50;
  assert (select level from public.user_post_progress where user_id = auth.uid()) = 11, 'level 11 at 50 posts';
  r := public.create_post('Question number 7 about daily life in Japan'); perform tests.err(r, 'duplicate', 'duplicate');
  r := public.create_post('ok'); perform tests.ok(r, 'short post');
  assert (select valid_posts from public.user_post_progress where user_id = auth.uid()) = 50, 'too-short post not credited';
  select id into v_id from public.posts where author_id = auth.uid() and counted order by id limit 1;
  r := public.delete_post(v_id); perform tests.ok(r, 'delete own post');
  assert (select level from public.user_post_progress where user_id = auth.uid()) = 11, 'level kept after deletion';
  assert not exists (select 1 from public.posts where id = v_id), 'deleted post hidden from everyone';
  r := public.update_my_profile('JP', 'NP', 'Kumamoto', 25, 'Student from Pokhara', false, true, true, true);
  perform tests.ok(r, 'profile update');
  r := public.update_my_profile('JP', 'NP', 'Kumamoto', 25, 'I am a muji', false, true, true, true);
  perform tests.err(r, 'inappropriate', 'bio filtered');
  perform tests.pass('50 posts => Level 11, duplicate/short posts not credited, level permanent after delete, profile filter');
end $$;

select tests.login('sita2024');
do $$ declare r jsonb; v_post bigint; v_c bigint; begin
  select max(id) into v_post from public.posts where status = 'published';
  r := public.create_comment(v_post, 'Try the Gyomu supermarket, it is cheap!'); perform tests.ok(r, 'comment');
  v_c := (r->>'id')::bigint;
  assert (select comment_count from public.posts where id = v_post) = 1;
  assert (select valid_posts from public.user_post_progress where user_id = auth.uid()) = 0, 'comments never count';
  r := public.update_comment(v_c, 'Try Gyomu supermarket or Don Quijote.'); perform tests.ok(r, 'edit comment');
  r := public.update_comment(v_c, 'you are a muji'); perform tests.err(r, 'blocked', 'blocked edit');
  r := public.update_post(v_post, 'hijack attempt'); perform tests.err(r, 'not_found', 'edit other user post');
  r := public.delete_comment(v_c); perform tests.ok(r, 'delete comment');
  assert (select comment_count from public.posts where id = v_post) = 0;
  r := public.create_report('post', v_post::text, 'spam', 'looks like spam'); perform tests.ok(r, 'report');
  r := public.create_report('post', v_post::text, 'scam', null); perform tests.err(r, 'already_reported', 'duplicate report');
  r := public.create_report('user', 'sita2024', 'other', null); perform tests.err(r, 'self_report', 'self report');
  r := public.create_post('This visa process is shit honestly');
  assert coalesce((r->>'warning')::boolean, false), 'mild => warning first';
  r := public.create_post('This visa process is shit honestly', true); perform tests.ok(r, 'warning acknowledged');
  r := public.create_post('Earn money fast!! whatsapp me +81 90 0000 0000'); perform tests.ok(r, 'review post');
  assert r->>'status' = 'pending_review';
  assert (select count(*) from public.profile_details) = 1, 'only own private details visible';
  perform tests.pass('comments (count/edit/filter/ownership), de-duplicated reports, warn-confirm & review flows');
end $$;

-- ---------------------------------------------------------------- anonymous visitors
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
do $$ declare p jsonb; begin
  assert (select count(*) from public.posts where status <> 'published') = 0, 'anon sees only published';
  assert (select count(*) from public.feed_posts) > 0;
  begin perform count(*) from public.reports; raise exception 'FAIL anon reports';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from public.profile_details; raise exception 'FAIL anon details';
  exception when insufficient_privilege then null; end;
  begin perform public.create_post('anon post'); raise exception 'FAIL anon post';
  exception when insufficient_privilege then null; end;
  p := public.get_profile('ramesh01');
  assert p->>'city' = 'Kumamoto' and p->>'nationality' = 'NP' and p->'age' = 'null'::jsonb, 'age hidden, city shown';
  assert (p->>'level')::int = 11 and (p->>'post_count')::int = 50;
  assert not (p ? 'email'), 'no email in profile';
  perform tests.pass('anonymous: published-only feed, no reports/private data, hidden optional fields respected');
end $$;

-- ---------------------------------------------------------------- moderation + roles
reset role; set role authenticated;
select tests.login('modguy1');
do $$ declare r jsonb; v_post bigint; v_author uuid; v_before int; begin
  select id, author_id into v_post, v_author from public.posts where status = 'published' and counted order by id desc limit 1;
  select valid_posts into v_before from public.user_post_progress where user_id = v_author;
  r := public.mod_act_on_content('post', v_post, 'remove', ''); perform tests.err(r, 'reason_required', 'reason required');
  r := public.mod_act_on_content('post', v_post, 'remove', 'Spam'); perform tests.ok(r, 'moderator removes post');
  assert (select valid_posts from public.user_post_progress where user_id = v_author) = v_before - 1, 'removed post uncredited';
  r := public.mod_act_on_content('post', (select id from public.posts where status = 'pending_review' limit 1), 'approve', null);
  perform tests.ok(r, 'approve pending');
  r := public.staff_set_user_status((select id from public.profiles where username = 'troll99'), 'suspended', 3, 'abuse');
  perform tests.err(r, 'forbidden', 'moderator without suspend permission');
  r := public.staff_set_user_status((select id from public.profiles where username = 'admin01'), 'banned', null, 'x');
  perform tests.err(r, 'forbidden', 'moderator cannot act on admin');
  begin perform public.admin_stats(); raise exception 'FAIL mod stats';
  exception when raise_exception then if sqlerrm <> 'forbidden' then raise; end if; end;
  perform tests.pass('moderator: remove (uncredits), approve, rank & permission checks');
end $$;

select tests.login('admin01');
do $$ declare r jsonb; begin
  r := public.admin_set_role((select id from public.profiles where username = 'modguy1'), 'moderator', true); perform tests.ok(r, 'grant can_suspend');
  r := public.admin_set_role((select id from public.profiles where username = 'troll99'), 'admin', false); perform tests.err(r, 'forbidden', 'admin cannot create admins');
  r := public.admin_set_role(auth.uid(), 'super_admin', false); perform tests.err(r, 'cannot_change_self', 'self-promotion');
  begin perform public.admin_update_setting('posts_per_hour', '5'); raise exception 'FAIL admin changed platform setting';
  exception when raise_exception then if sqlerrm <> 'forbidden' then raise; end if; end;
  r := public.admin_update_setting('announcement', '"Welcome to Sanghu!"'); perform tests.ok(r, 'community setting');
  r := public.admin_upsert_word(null, 'Scammer', 'en', 'review', 'harassment', 'word', true); perform tests.ok(r, 'add word');
  assert (select count(*) from public.audit_logs where action in ('role.set','setting.update','word.upsert')) >= 3, 'audited';
  perform tests.pass('admin: manages moderators only, no self-promotion, community settings, dictionary, audit log');
end $$;

select tests.login('modguy1');
do $$ declare r jsonb; begin
  r := public.staff_set_user_status((select id from public.profiles where username = 'troll99'), 'suspended', 3, 'abuse');
  perform tests.ok(r, 'authorised moderator suspends');
end $$;
select tests.login('troll99');
do $$ begin
  begin perform public.create_post('I am back to troll'); raise exception 'FAIL suspended user posted';
  exception when raise_exception then if sqlerrm <> 'account_suspended' then raise; end if; end;
  perform tests.pass('suspension enforced server-side');
end $$;

select tests.login((select min(username) from public.profiles where username like 'member%'));
do $$ declare i int; r jsonb; begin
  for i in 1..5 loop r := public.create_post('kill yourself ' || i); perform tests.err(r, 'blocked', 'blocked'); end loop;
  begin perform public.create_post('hello there friends'); raise exception 'FAIL not locked';
  exception when raise_exception then if sqlerrm <> 'temporarily_locked' then raise; end if; end;
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.reports where reason = 'filter_evasion' and reporter_id is null), 'auto report';
  assert (select status from public.profiles where username = (select min(username) from public.profiles where username like 'member%')) = 'active', 'never auto-banned';
  perform tests.pass('repeated bypass attempts => temporary lock + automatic report (no automatic ban)');
end $$;

-- ---------------------------------------------------------------- usernames + premium
set role authenticated;
select tests.login('ramesh01');
do $$ declare r jsonb; begin
  r := public.change_username('abc'); perform tests.err(r, 'premium_required', 'short name needs premium');
  r := public.change_username('fuckboy9'); perform tests.err(r, 'inappropriate', 'inappropriate username');
  assert not (public.username_available('admin')->>'available')::boolean, 'system name reserved';
  r := public.reserve_premium_username('abc'); perform tests.ok(r, 'reserve before checkout');
end $$;
select tests.login('sita2024');
do $$ declare r jsonb; begin
  r := public.reserve_premium_username('abc'); perform tests.err(r, 'taken', 'reserved by another user');
end $$;
reset role; select set_config('request.jwt.claims', '', false); set role service_role;
do $$ declare r jsonb; v uuid := (select id from public.profiles where username = 'ramesh01'); begin
  r := public.billing_apply_subscription(v, 'cus_1', 'sub_1', 'incomplete', 'price_1', now() + interval '30 days', false);
  assert (select username from public.profiles where id = v) = 'ramesh01' and (select premium_until from public.profiles where id = v) is null, 'nothing before payment';
  r := public.billing_apply_subscription(v, 'cus_1', 'sub_1', 'active', 'price_1', now() + interval '30 days', false);
  assert r->>'username_applied' = 'abc' and (select username from public.profiles where id = v) = 'abc', 'short name applied after payment';
  assert (select kind from public.username_reservations where username = 'ramesh01') = 'fallback';
  r := public.billing_apply_subscription(v, 'cus_1', 'sub_1', 'past_due', 'price_1', now() - interval '1 day', false);
  assert (select username from public.profiles where id = v) = 'abc', 'grace period keeps premium';
  r := public.billing_apply_subscription(v, 'cus_1', 'sub_1', 'canceled', 'price_1', now(), false);
  assert (select username from public.profiles where id = v) = 'ramesh01', 'standard name restored';
  assert (select kind from public.username_reservations where username = 'abc') = 'hold', 'short name held for owner';
  perform public.billing_record_payment(v, 'in_1', 200, 'jpy', 'paid', null, now());
  perform tests.pass('premium: no benefits before confirmation, short name applied, grace period, lapse => restore + hold');
end $$;
reset role; set role authenticated; select tests.login('sita2024');
do $$ begin
  assert not (public.username_available('abc')->>'available')::boolean, 'held name unavailable to others';
  assert (select count(*) from public.payments) = 0, 'cannot see other users payments';
  perform tests.pass('held usernames protected; payments private');
end $$;

reset role; select set_config('request.jwt.claims', '', false); set role service_role;
do $$ begin
  insert into public.stripe_events (id, type) values ('evt_test', 'test');
  delete from public.stripe_events where id = 'evt_test';
  insert into public.subscriptions (user_id, stripe_customer_id, status)
  select id, 'cus_test', 'none' from public.profiles where username = 'troll99'
  on conflict (user_id) do update set stripe_customer_id = excluded.stripe_customer_id;
  assert (select user_id from public.subscriptions where stripe_customer_id = 'cus_test') is not null;
  perform tests.pass('service role (Stripe webhook / account deletion) has the explicit table privileges it needs');
end $$;

-- ---------------------------------------------------------------- account deletion
reset role;
delete from auth.users where email = 'b@x.test';
do $$ begin
  assert not exists (select 1 from public.profiles where username = 'sita2024');
  assert not exists (select 1 from public.posts where status = 'deleted' and body <> ''), 'deleted text wiped';
  assert not exists (select 1 from public.posts p left join public.profiles pr on pr.id = p.author_id where pr.id is null);
  assert exists (select 1 from public.reports where reporter_id is null and reason = 'spam'), 'report kept, reporter anonymised';
  perform tests.pass('account deletion cascades personal data, keeps anonymised moderation records');
end $$;
\echo ALL DATABASE TESTS PASSED
