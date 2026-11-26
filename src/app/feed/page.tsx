import Link from "next/link";
import type { Metadata } from "next";
import { ContentForm } from "@/components/ContentForm";
import { PostCard, type FeedPost } from "@/components/PostCard";
import { Notice } from "@/components/Notice";
import { createPostAction } from "@/actions/content";
import { getI18n } from "@/i18n/server";
import { getViewer } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Feed" };
const PAGE = 20;

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const { t, locale } = await getI18n();
  if (!isSupabaseConfigured()) return <Notice>{t.feed.setup}</Notice>;
  const before = Number((await searchParams).before);
  const supabase = await createClient();
  let query = supabase.from("feed_posts").select("*").eq("status", "published").order("id", { ascending: false }).limit(PAGE + 1);
  if (Number.isSafeInteger(before) && before > 0) query = query.lt("id", before);   // keyset pagination (index: posts_feed_idx)
  const [viewer, { data }, { data: ann }] = await Promise.all([
    getViewer(), query, supabase.from("platform_settings").select("value").eq("key", "announcement").maybeSingle(),
  ]);
  const posts = (data ?? []) as FeedPost[];
  const page = posts.slice(0, PAGE);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t.feed.title}</h1>
      {typeof ann?.value === "string" && ann.value && <p className="rounded-xl bg-ink px-4 py-3 text-sm text-white">📣 {ann.value}</p>}
      {viewer ? (
        <div className="card">
          <ContentForm action={createPostAction} max={5000} labels={{ placeholder: t.post.placeholder, submit: t.post.submit, postAnyway: t.post.postAnyway, charsLeft: t.post.charsLeft }} />
        </div>
      ) : (
        <p className="card text-sm">{t.feed.loginToPost} <Link href="/register" className="font-semibold text-coral underline">{t.nav.register}</Link></p>
      )}
      {page.length === 0 && <p className="card text-center text-ink-soft">{t.feed.empty}</p>}
      {page.map((p) => <PostCard key={p.id} post={p} t={t} locale={locale} />)}
      <nav className="flex justify-between text-sm font-semibold">
        {before > 0 ? <Link href="/feed" className="btn-ghost">{t.feed.newest}</Link> : <span />}
        {posts.length > PAGE && <Link href={`/feed?before=${page[page.length - 1].id}`} className="btn-ghost">{t.feed.older}</Link>}
      </nav>
    </div>
  );
}
