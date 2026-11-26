-- =============================================================================
-- Sanghu – seed data: platform settings, reserved usernames, starter dictionary
-- The dictionary is a STARTER list. Native-speaker moderators must review and
-- extend it from the Admin dashboard (no deploy needed).
-- =============================================================================
insert into public.platform_settings (key, value, scope, description) values
  ('registration_open',             'true',  'platform',  'Allow new sign-ups'),
  ('post_min_interval_seconds',     '30',    'platform',  'Minimum seconds between two posts by one user'),
  ('posts_per_hour',                '10',    'platform',  'Max posts per user per hour'),
  ('comment_min_interval_seconds',  '5',     'platform',  'Minimum seconds between two comments'),
  ('comments_per_hour',             '60',    'platform',  'Max comments per user per hour'),
  ('reports_per_day',               '20',    'platform',  'Max reports a user can file per 24h'),
  ('level_daily_credit_cap',        '10',    'platform',  'Max posts per day (JST) that count toward levels'),
  ('level_min_chars',               '10',    'platform',  'Minimum non-space characters for a post to count toward levels'),
  ('filter_strike_limit',           '5',     'platform',  'Blocked submissions in 24h before a 1h posting lock + auto report'),
  ('premium_grace_days',            '7',     'platform',  'Days premium stays active while a renewal payment is failing'),
  ('premium_username_hold_days',    '30',    'platform',  'Days a lapsed member''s short username is held for them'),
  ('username_hold_days',            '30',    'platform',  'Days an old username stays reserved after a change'),
  ('username_change_cooldown_days', '30',    'platform',  'Days between username changes'),
  ('announcement',                  '""',    'community', 'Banner shown above the feed (empty = hidden)')
on conflict (key) do nothing;

insert into public.username_reservations (username, kind)
select unnest(array['admin','administrator','root','support','help','helpdesk','sanghu','sanghuapp','official',
  'moderator','mod','mods','staff','system','team','security','privacy','terms','settings','api','www','mail',
  'null','undefined','nepal','japan','info','contact','premium','billing','feed','login','register','signup',
  'signin','logout','report','guidelines','owner','superadmin','anonymous','deleted']), 'system'
on conflict (username) do nothing;

insert into public.prohibited_words (term, language, severity, category, match_type) values
-- English: mild profanity -> warning before publishing
  ('fuck','en','mild','profanity','word'), ('fucking','en','mild','profanity','word'), ('fucker','en','mild','profanity','word'),
  ('fck','en','mild','profanity','word'), ('fuk','en','mild','profanity','word'), ('motherfucker','en','mild','profanity','word'),
  ('shit','en','mild','profanity','word'), ('bullshit','en','mild','profanity','word'), ('bitch','en','mild','abuse','word'),
  ('bastard','en','mild','abuse','word'), ('asshole','en','mild','abuse','word'), ('ass','en','mild','profanity','word'),
  ('dick','en','mild','profanity','word'), ('wtf','en','mild','profanity','word'), ('stfu','en','mild','profanity','word'),
  ('idiot','en','mild','abuse','word'),
-- English: slurs / harassment / threats -> blocked
  ('nigger','en','severe','slur','phrase'), ('nigga','en','severe','slur','word'), ('faggot','en','severe','slur','phrase'),
  ('fag','en','severe','slur','word'), ('chink','en','severe','slur','word'), ('gook','en','severe','slur','word'),
  ('kike','en','severe','slur','word'), ('spic','en','severe','slur','word'), ('jap','en','severe','slur','word'),
  ('tranny','en','severe','slur','word'), ('cunt','en','severe','abuse','word'), ('whore','en','severe','harassment','word'),
  ('slut','en','severe','harassment','word'), ('kys','en','severe','threat','word'), ('kill yourself','en','severe','threat','word'),
  ('i will kill you','en','severe','threat','word'), ('rape you','en','severe','threat','word'), ('go die','en','severe','threat','word'),
-- English: uncertain -> moderator review
  ('retard','en','review','hate','word'), ('paki','en','review','slur','word'), ('kill you','en','review','threat','word'),
  ('porn','en','review','sexual','word'), ('nudes','en','review','sexual','word'),
  ('whatsapp me','en','review','spam','word'), ('telegram me','en','review','spam','word'),
  ('guaranteed visa','en','review','spam','word'), ('visa guarantee','en','review','spam','word'),
  ('earn money fast','en','review','spam','word'), ('guaranteed profit','en','review','spam','word'),
  ('crypto investment','en','review','spam','word'),
-- Japanese (substring matching on normalised text)
  ('バカ','ja','mild','abuse','phrase'), ('馬鹿','ja','mild','abuse','phrase'), ('アホ','ja','mild','abuse','phrase'),
  ('クソ','ja','mild','profanity','phrase'), ('キモい','ja','mild','harassment','phrase'), ('きもい','ja','mild','harassment','phrase'),
  ('ウザい','ja','mild','harassment','phrase'), ('うざい','ja','mild','harassment','phrase'), ('ブス','ja','mild','harassment','phrase'),
  ('消えろ','ja','mild','harassment','phrase'),
  ('死ね','ja','severe','threat','phrase'), ('氏ね','ja','severe','threat','phrase'), ('タヒね','ja','severe','threat','phrase'),
  ('殺してやる','ja','severe','threat','phrase'), ('ぶっ殺す','ja','severe','threat','phrase'), ('ガイジ','ja','severe','slur','phrase'),
  ('黒んぼ','ja','severe','slur','phrase'), ('ニガー','ja','severe','slur','phrase'),
  ('殺す','ja','review','threat','phrase'), ('チョン','ja','review','slur','phrase'), ('土人','ja','review','slur','phrase'),
  ('闇バイト','ja','review','spam','phrase'), ('受け子','ja','review','spam','phrase'), ('口座売買','ja','review','spam','phrase'),
  ('在留カード売','ja','review','spam','phrase'), ('パパ活','ja','review','sexual','phrase'), ('援交','ja','review','sexual','phrase'),
-- Nepali (Devanagari, substring matching)
  ('मुजी','ne','severe','abuse','phrase'), ('मूजी','ne','severe','abuse','phrase'), ('माचिक्ने','ne','severe','abuse','phrase'),
  ('मचिक्ने','ne','severe','abuse','phrase'), ('चिक्ने','ne','severe','abuse','phrase'), ('रण्डी','ne','severe','harassment','phrase'),
  ('रन्डी','ne','severe','harassment','phrase'), ('लाडो','ne','severe','sexual','phrase'), ('पुती','ne','severe','sexual','phrase'),
  ('भेनचोद','ne','severe','abuse','phrase'), ('मादरचोद','ne','severe','abuse','phrase'),
  ('हरामी','ne','mild','abuse','phrase'), ('जाठा','ne','mild','abuse','phrase'), ('चुतिया','ne','mild','abuse','phrase'),
  ('पोडे','ne','review','hate','phrase'), ('च्यामे','ne','review','hate','phrase'), ('मारिदिन्छु','ne','review','threat','phrase'),
-- Romanized Nepali (whole-word matching, repeated letters handled automatically)
  ('muji','ne_rom','severe','abuse','word'), ('mujiko','ne_rom','severe','abuse','word'), ('machikne','ne_rom','severe','abuse','word'),
  ('machhikne','ne_rom','severe','abuse','word'), ('machikney','ne_rom','severe','abuse','word'), ('mchikne','ne_rom','severe','abuse','word'),
  ('chikne','ne_rom','severe','abuse','word'), ('randi','ne_rom','severe','harassment','word'), ('randiko','ne_rom','severe','harassment','word'),
  ('lado','ne_rom','severe','sexual','word'), ('puti','ne_rom','severe','sexual','word'),
  ('bhenchod','ne_rom','severe','abuse','word'), ('behenchod','ne_rom','severe','abuse','word'), ('madarchod','ne_rom','severe','abuse','word'),
  ('bhosdike','ne_rom','severe','abuse','word'),
  ('harami','ne_rom','mild','abuse','word'), ('jatha','ne_rom','mild','abuse','word'), ('gadha','ne_rom','mild','abuse','word'),
  ('chutiya','ne_rom','mild','abuse','word'), ('khate','ne_rom','mild','abuse','word'),
  ('pode','ne_rom','review','hate','word'), ('chyame','ne_rom','review','hate','word'), ('chakka','ne_rom','review','hate','word'),
  ('mardinchu','ne_rom','review','threat','word'), ('maridinchu','ne_rom','review','threat','word'),
-- allow-list (removed before matching to prevent false positives)
  ('scunthorpe','en','allow','other','phrase'), ('チョンボ','ja','allow','other','phrase')
on conflict (term, language) do nothing;
