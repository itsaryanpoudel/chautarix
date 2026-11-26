import { isSupabaseConfigured } from "@/lib/env";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PostCard, type FeedPost } from "@/components/PostCard";
import { LevelBadge } from "@/components/UserLine";
import { getI18n } from "@/i18n/server";
import { countryName, flag } from "@/lib/countries";
import { fmt, formatDate } from "@/lib/format";
import { levelProgress, tierFor } from "@/lib/levels";
import { createClient } from "@/lib/supabase/server";

export default async function Profile({ params }: { params: Promise<{ username: string }> }) {
  const username = decodeURIComponent((await params).username).toLowerCase();
  if (!/^[a-z0-9]{3,20}$/.test(username)) notFound();
  if (!isSupabaseConfigured()) notFound();
  const [{ t, locale }, supabase] = await Promise.all([getI18n(), createClient()]);
  const { data: u } = await supabase.rpc("get_profile", { p_username: username });
  if (!u || u.is_banned) notFound();
  const { data: posts } = await supabase.from("feed_posts").select("*").eq("author_id", u.id).neq("status", "removed").order("id", { ascending: false }).limit(20);
  const prog = levelProgress(u.valid_posts);
  const rows: [string, string | null][] = [
    [t.profile.livingIn, `${flag(u.residence_country)} ${countryName(u.residence_country, locale)}`],
    [t.profile.city, u.city], [t.profile.nationality, u.nationality ? `${flag(u.nationality)} ${countryName(u.nationality, locale)}` : null],
    [t.profile.age, u.age ? String(u.age) : null], [t.profile.memberSince, formatDate(u.created_at, locale)],
  ];
  return (
    <div className="space-y-4">
      <section className="card space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xl" title={countryName(u.residence_country, locale)}>{flag(u.residence_country)}</span>
          <h1 className="text-2xl font-extrabold">@{u.username}</h1>
          {u.is_premium && <span className="rounded-full bg-coral-soft px-2 py-0.5 text-xs font-bold text-coral">◆ {t.profile.premium}</span>}
          <LevelBadge level={u.level} t={t} big />
        </div>
        {u.bio && <p className="whitespace-pre-wrap text-[15px] leading-7">{u.bio}</p>}
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="text-ink-soft">{k}</dt><dd className="font-medium">{v}</dd></div>)}
          <div><dt className="text-ink-soft">{t.profile.posts} / {t.profile.comments}</dt><dd className="font-medium">{u.post_count} / {u.comment_count}</dd></div>
        </dl>
        <div className="rounded-xl bg-washi p-4">
          <p className="text-sm font-semibold">{t.level.current}: {prog.level} · {t.level.tiers[tierFor(prog.level).key]}</p>
          <p className="mt-1 text-sm">{t.level.valid}: {prog.validPosts} / {prog.next} · {t.level.progress}: {prog.percent}%</p>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-white ring-1 ring-line" role="progressbar" aria-valuenow={prog.percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-coral" style={{ width: `${prog.percent}%` }} />
          </div>
          <p className="mt-2 text-xs text-ink-soft">{fmt(t.level.toNext, { n: prog.remaining, l: prog.level + 1 })} {t.level.rule}</p>
        </div>
        <div className="flex gap-3 text-sm">
          {u.is_self ? (<><Link href="/settings/profile" className="btn-ghost">{t.profile.edit}</Link><Link href="/settings/account" className="btn-ghost">{t.nav.settings}</Link></>)
            : <Link href={`/report?type=user&id=${u.username}`} className="text-xs underline">{t.profile.reportUser}</Link>}
        </div>
      </section>
      {(posts ?? []).length === 0 && <p className="text-sm text-ink-soft">{t.profile.noPosts}</p>}
      {((posts ?? []) as FeedPost[]).map((p) => <PostCard key={p.id} post={p} t={t} locale={locale} />)}
    </div>
  );
}
