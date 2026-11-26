import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { ContentActions, ReportActions, UserStatusForm } from "@/components/Staff";
import { errorText, getI18n } from "@/i18n/server";
import { getViewer, rank } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Moderation", robots: { index: false } };
export default async function Mod({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const viewer = await getViewer();
  if (!viewer || rank(viewer.role) < 1) notFound();          // ordinary users never see staff pages
  const [{ t }, sp, supabase] = await Promise.all([getI18n(), searchParams, createClient()]);
  const [{ data: reports }, { data: posts }, { data: comments }, { data: actions }] = await Promise.all([
    supabase.from("reports").select("*, post:posts(id, body, status), comment:comments(id, body, status, post_id), target:profiles!reports_user_id_fkey(id, username, status), reporter:profiles!reports_reporter_id_fkey(username)")
      .eq("status", "open").order("id").limit(50),
    supabase.from("feed_posts").select("*").eq("status", "pending_review").order("id").limit(50),
    supabase.from("feed_comments").select("*").eq("status", "pending_review").order("id").limit(50),
    supabase.from("moderation_actions").select("*, actor:profiles!moderation_actions_actor_id_fkey(username)").order("id", { ascending: false }).limit(20),
  ]);
  const canSuspend = viewer.canSuspend;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Moderation <span className="text-sm font-normal text-ink-soft">({viewer.role})</span></h1>
      {sp.error && <Notice kind="error">{errorText(t, sp.error)}</Notice>}{sp.done && <Notice kind="ok">Done — recorded in the audit log.</Notice>}
      <section className="space-y-3"><h2 className="font-bold">Open reports ({reports?.length ?? 0})</h2>
        {(reports ?? []).map((r) => (
          <div key={r.id} className="card space-y-2 text-sm">
            <p><b>#{r.id} · {r.reason}</b> · {r.target_type} · by {r.reporter?.username ? `@${r.reporter.username}` : "system"} · {new Date(r.created_at).toLocaleString("ja-JP")}</p>
            {r.details && <p className="text-ink-soft">“{r.details}”</p>}
            {r.post && <blockquote className="rounded-lg bg-washi p-2 whitespace-pre-wrap">{r.post.body || "(deleted)"} <Link className="underline" href={`/p/${r.post.id}`}>open</Link></blockquote>}
            {r.comment && <blockquote className="rounded-lg bg-washi p-2 whitespace-pre-wrap">{r.comment.body || "(deleted)"} <Link className="underline" href={`/p/${r.comment.post_id}`}>open</Link></blockquote>}
            {r.target && <p>User: <Link className="underline" href={`/u/${r.target.username}`}>@{r.target.username}</Link> ({r.target.status})</p>}
            {r.post && <ContentActions type="post" id={r.post.id} status={r.post.status} report={r.id} />}
            {r.comment && <ContentActions type="comment" id={r.comment.id} status={r.comment.status} report={r.id} />}
            {r.target && canSuspend && <UserStatusForm user={r.target.id} back="/mod" allowBan={rank(viewer.role) >= 2} />}
            <ReportActions id={r.id} />
          </div>))}
      </section>
      <section className="space-y-3"><h2 className="font-bold">Waiting for review ({(posts?.length ?? 0) + (comments?.length ?? 0)})</h2>
        {[...(posts ?? []).map((p) => ({ ...p, type: "post" as const })), ...(comments ?? []).map((c) => ({ ...c, type: "comment" as const }))].map((x) => (
          <div key={`${x.type}${x.id}`} className="card space-y-2 text-sm"><p><b>{x.type} #{x.id}</b> by <Link className="underline" href={`/u/${x.username}`}>@{x.username}</Link></p>
            <blockquote className="rounded-lg bg-washi p-2 whitespace-pre-wrap">{x.body}</blockquote><ContentActions type={x.type} id={x.id} status={x.status} /></div>))}
      </section>
      <section className="card text-sm"><h2 className="mb-2 font-bold">Recent moderation actions</h2>
        <ul className="space-y-1">{(actions ?? []).map((a) => <li key={a.id}>{new Date(a.created_at).toLocaleString("ja-JP")} · @{a.actor?.username ?? "?"} · {a.action} {a.target_type} #{a.target_id} · {a.reason}</li>)}</ul></section>
    </div>
  );
}
