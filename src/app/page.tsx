import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { PostCard, type FeedPost } from "@/components/PostCard";
import { Notice } from "@/components/Notice";
import { getI18n } from "@/i18n/server";
import { getViewer } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { TIERS } from "@/lib/levels";
import { LevelBadge } from "@/components/UserLine";

export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const [{ t, locale }, viewer, sp] = await Promise.all([getI18n(), getViewer(), searchParams]);
  let latest: FeedPost[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.from("feed_posts").select("*").eq("status", "published").order("id", { ascending: false }).limit(3);
    latest = (data ?? []) as FeedPost[];
  }
  return (
    <div className="space-y-10">
      {sp.deleted && <Notice kind="ok">Your account and personal data have been deleted.</Notice>}
      <section className="rounded-3xl bg-ink px-6 py-10 text-white sm:px-10">
        <LogoMark size={56} />
        <h1 className="mt-5 text-3xl font-extrabold leading-tight sm:text-4xl">{t.brand.tagline}</h1>
        <p className="mt-3 max-w-xl text-white/80">{t.brand.sub}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {!viewer && <Link href="/register" className="btn-coral">{t.home.cta}</Link>}
          <Link href="/feed" className="btn bg-white text-ink hover:bg-washi">{t.home.browse}</Link>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        {[[t.home.how1t, t.home.how1, "💬"], [t.home.how2t, t.home.how2, "⬆️"], [t.home.how3t, t.home.how3, "🛡️"]].map(([h, p, i]) => (
          <div key={h} className="card"><div className="text-2xl" aria-hidden>{i}</div><h2 className="mt-2 font-bold">{h}</h2><p className="mt-1 text-sm text-ink-soft">{p}</p></div>
        ))}
      </section>
      <section className="card">
        <div className="flex flex-wrap gap-2">
          {[...TIERS].reverse().map((tier) => (
            <span key={tier.key} className="inline-flex items-center gap-1.5 text-xs"><LevelBadge level={tier.min} t={t} />{t.level.tiers[tier.key]}</span>
          ))}
        </div>
        <p className="mt-3 text-sm text-ink-soft">{t.level.rule}</p>
      </section>
      {latest.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">{t.home.latest}</h2>
          {latest.map((p) => <PostCard key={p.id} post={p} t={t} locale={locale} />)}
        </section>
      )}
    </div>
  );
}
