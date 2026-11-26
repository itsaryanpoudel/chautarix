import { isSupabaseConfigured } from "@/lib/env";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentForm } from "@/components/ContentForm";
import { PostCard, type FeedPost } from "@/components/PostCard";
import { UserLine } from "@/components/UserLine";
import { createCommentAction, deleteCommentAction, deletePostAction } from "@/actions/content";
import { moderateContentAction } from "@/actions/staff";
import { getI18n } from "@/i18n/server";
import { getViewer, rank } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

function Owner({ id, kind, t }: { id: number; kind: "p" | "c"; t: Awaited<ReturnType<typeof getI18n>>["t"] }) {
  return (
    <span className="flex items-center gap-3 text-xs">
      <Link href={`/${kind}/${id}/edit`} className="underline">{t.post.edit}</Link>
      <details className="relative"><summary className="cursor-pointer list-none underline">{t.post.delete}</summary>
        <form action={kind === "p" ? deletePostAction : deleteCommentAction} className="absolute right-0 z-10 mt-1 w-48 rounded-xl border border-line bg-white p-3 shadow">
          <input type="hidden" name="id" value={id} /><p className="mb-2">{t.post.confirmDelete}</p><button className="btn min-h-9 bg-red-600 px-3 text-white">{t.post.delete}</button>
        </form></details>
    </span>
  );
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  if (!isSupabaseConfigured()) notFound();
  const [{ t, locale }, viewer, supabase] = await Promise.all([getI18n(), getViewer(), createClient()]);
  const [{ data: post }, { data: comments }] = await Promise.all([
    supabase.from("feed_posts").select("*").eq("id", id).maybeSingle(),
    supabase.from("feed_comments").select("*").eq("post_id", id).order("id").limit(300),
  ]);
  if (!post) notFound();
  const p = post as FeedPost;
  const staff = rank(viewer?.role ?? null) >= 1;
  return (
    <div className="space-y-4">
      <Link href="/feed" className="text-sm text-ink-soft">{t.post.back}</Link>
      {p.status === "removed" && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{t.post.removed}</p>}
      <PostCard post={p} t={t} locale={locale} linked={false} />
      <div className="flex flex-wrap items-center justify-end gap-3 text-xs">
        {viewer?.id === p.author_id ? <Owner id={p.id} kind="p" t={t} /> : viewer && <Link href={`/report?type=post&id=${p.id}`} className="underline">{t.post.report}</Link>}
        {staff && p.status !== "removed" && (
          <form action={moderateContentAction} className="flex gap-1">
            <input type="hidden" name="type" value="post" /><input type="hidden" name="id" value={p.id} /><input type="hidden" name="action" value="remove" />
            <input type="hidden" name="back" value={`/p/${p.id}`} />
            <input name="reason" required placeholder="Removal reason" className="input min-h-9 w-40 py-1 text-xs" /><button className="btn min-h-9 bg-red-600 px-3 text-white">Remove</button>
          </form>
        )}
      </div>
      <section className="space-y-3">
        {(comments ?? []).length === 0 && <p className="text-sm text-ink-soft">{t.post.noComments}</p>}
        {(comments ?? []).map((c) => (
          <div key={c.id} className="rounded-2xl border border-line bg-white/70 p-3 sm:ml-6">
            <div className="flex items-start justify-between gap-2">
              <UserLine username={c.username} country={c.residence_country} level={c.level} isPremium={c.is_premium} locale={locale} t={t} />
              <time className="shrink-0 text-xs text-ink-soft">{formatDateTime(c.created_at, locale)}</time>
            </div>
            {c.status === "pending_review" && <p className="mt-2 text-xs text-amber-800">{t.post.pending}</p>}
            <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-7">{c.body}</p>
            <div className="mt-2 flex justify-end gap-3 text-xs text-ink-soft">
              {c.edited_at && <span>{t.post.edited}</span>}
              {viewer?.id === c.author_id ? <Owner id={c.id} kind="c" t={t} /> : viewer && <Link href={`/report?type=comment&id=${c.id}`} className="underline">{t.post.report}</Link>}
            </div>
          </div>
        ))}
      </section>
      {viewer && p.status === "published" ? (
        <div className="card sm:ml-6">
          <ContentForm action={createCommentAction} hidden={{ postId: p.id }} max={2000} rows={3}
            labels={{ placeholder: t.post.commentPlaceholder, submit: t.post.comment, postAnyway: t.post.postAnyway, charsLeft: t.post.charsLeft }} />
        </div>
      ) : !viewer && <p className="card text-sm">{t.feed.loginToPost} <Link className="font-semibold text-coral underline" href={`/login?next=/p/${p.id}`}>{t.nav.login}</Link></p>}
    </div>
  );
}
