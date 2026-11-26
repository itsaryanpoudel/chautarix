# Sanghu (साँघु) — community for Nepalis in Japan
*Sanghu* = a small Nepali footbridge. Logo: two peaks (Himalaya + Fuji) joined by a coral bridge. Colors: ink `#1b2440`, gurans coral `#e9503f`, washi `#f6f4ef`.
Stack: Next.js 16 (App Router, TypeScript, Tailwind 4) · Supabase (Postgres, Auth, RLS) · Stripe · Vercel.

## Architecture (security model)
- Browser/API users can only **read** tables (RLS). **Every write** goes through `SECURITY DEFINER` SQL functions
  (`create_post`, `update_comment`, `mod_act_on_content`, …) that validate, run the multilingual content filter,
  rate-limit, update levels and write the audit log. Calling Supabase directly with the public key cannot bypass this.
- Roles (`admin_roles`) are only changeable via `admin_set_role` (admins → moderators only, super admin → all, never yourself).
- Stripe webhook (signature-verified, idempotent) is the only path to Premium (`billing_*` functions, service role only).

## 1. Database (Supabase)
1. Create a project (Tokyo region `ap-northeast-1`). 2. SQL Editor → run, in order:
   `supabase/migrations/20261126000001_schema.sql`, `…0002_functions.sql`, `…0003_seed.sql` (or `supabase db push` with the CLI).
3. Authentication → URL configuration: Site URL = your domain; add `https://YOUR-DOMAIN/auth/confirm` to Redirect URLs.
4. Authentication → Emails → **configure custom SMTP** (Resend, Brevo…). The built-in sender only delivers to your own team (2 emails/hour).
5. Optional: enable CAPTCHA (Turnstile/hCaptcha) for sign-up/login; enable leaked-password protection.
6. Optional safety net (Database → Extensions → pg_cron): `select cron.schedule('premium-expiry','0 3 * * *','select public.billing_expire_lapsed()');`

## 2. Local development
```bash
cp .env.example .env.local      # fill NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY
npm install && npm run dev      # http://localhost:3000
npm run typecheck && npm run lint && npm test          # TS, ESLint, Vitest
PGHOST=localhost PGUSER=postgres npm run test:db       # SQL suite on a THROW-AWAY Postgres 15+ (never production)
```

## 3. First super admin
Register normally, confirm your email, then in the Supabase SQL editor:
```sql
insert into public.admin_roles (user_id, role) select id, 'super_admin' from public.profiles where username = 'yourname';
```
Appoint friends afterwards in **/admin → users** (admins can create moderators; tick “can suspend” to let a moderator suspend users).

## 4. Deploy to Vercel
Import the repo → add the env vars from `.env.example` (Production) → deploy → set `NEXT_PUBLIC_SITE_URL` to the final URL and update Supabase redirect URLs.

## 5. Stripe (optional — the site launches with `PAYMENTS_ENABLED=false`)
1. Product “Sanghu Premium”, recurring price **¥200 / month** (tax-inclusive) → `STRIPE_PRICE_ID`.
2. Developers → Webhooks → endpoint `https://YOUR-DOMAIN/api/stripe/webhook`, events: `checkout.session.completed`,
   `customer.subscription.created|updated|deleted|paused|resumed`, `invoice.paid`, `invoice.payment_failed` → `STRIPE_WEBHOOK_SECRET`.
3. Settings → Billing → Customer portal: allow cancel + payment-method update + invoice history.
4. Settings → Subscriptions & emails → Smart Retries ≈ 7 days, then cancel subscription (matches the 7-day grace policy).
5. Test with `stripe listen --forward-to localhost:3000/api/stripe/webhook` and card `4242 4242 4242 4242`; then set `PAYMENTS_ENABLED=true`.
Policy: Premium only after Stripe reports `active`; `past_due` keeps it for 7 days; on end the old username returns and the short one is held 30 days.

## 6. Adding a language
Add `src/i18n/messages/<code>.json` (missing keys fall back to English) and list the code in `src/i18n/config.ts`.
Staff dashboards and legal pages are English-only for now.

## 7. Before launch (must do)
- Lawyer / 行政書士 review of `/terms`, `/privacy`, `/legal/commerce` (all `[REVIEW]` markers), minimum age, refund policy.
- Trademark search for “Sanghu” (J-PlatPat) and domain purchase.
- Native speakers review/extend the starter prohibited-word list in /admin → words.
