import Link from "next/link";
import { UserLine } from "./UserLine";
import { fmt, formatDateTime } from "@/lib/format";
import type { Messages } from "@/i18n/server";

export type FeedPost = {
  id: number; author_id: string; body: string; status: string; comment_count: number; created_at: string;
  edited_at: string | null; username: string; residence_country: string; is_premium: boolean; level: number;
};

export function PostCard({ post, t, locale, linked = true }: { post: FeedPost; t: Messages; locale: string; linked?: boolean }) {
  return (
    <article className="card">
      <header className="flex items-start justify-between gap-2">
        <UserLine username={post.username} country={post.residence_country} level={post.level} isPremium={post.is_premium} locale={locale} t={t} />
        <time className="shrink-0 pt-0.5 text-xs text-ink-soft" dateTime={post.created_at}>{formatDateTime(post.created_at, locale)}</time>
      </header>
      {post.status === "pending_review" && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t.post.pending}</p>}
      <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-7">{post.body}</p>
      <footer className="mt-3 flex items-center gap-3 text-sm text-ink-soft">
        {linked ? <Link href={`/p/${post.id}`} className="hover:text-ink">💬 {fmt(t.post.comments, { n: post.comment_count })}</Link>
                : <span>💬 {fmt(t.post.comments, { n: post.comment_count })}</span>}
        {post.edited_at && <span className="text-xs">· {t.post.edited}</span>}
      </footer>
    </article>
  );
}
