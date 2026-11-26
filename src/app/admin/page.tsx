import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { UserStatusForm } from "@/components/Staff";
import { adjustProgressAction, deleteWordAction, setRoleAction, updateSettingAction, upsertWordAction } from "@/actions/staff";
import { errorText, getI18n } from "@/i18n/server";
import { getViewer, rank } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Admin", robots: { index: false } };
const TABS = ["overview", "users", "words", "settings", "audit"] as const;

export default async function Admin({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; error?: string; done?: string }> }) {
  const viewer = await getViewer();
  const r = rank(viewer?.role ?? null);
  if (!viewer || r < 2) notFound();
  const [{ t }, sp, db] = await Promise.all([getI18n(), searchParams, createClient()]);
  const tab = TABS.includes(sp.tab as never) ? sp.tab : "overview";
  const q = (sp.q ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
  const stats = tab === "overview" ? (await db.rpc("admin_stats")).data ?? {} : {};
  const users = tab === "users" && q ? (await db.from("profiles").select("id, username, status, suspended_until, premium_until, created_at, progress:user_post_progress(valid_posts, level)").ilike("username", `%${q}%`).limit(20)).data ?? [] : [];
  const roles = tab === "users" ? (await db.from("admin_roles").select("user_id, role, can_suspend, profile:profiles!admin_roles_user_id_fkey(username)")).data ?? [] : [];
  const words = tab === "words" ? (await db.from("prohibited_words").select("*").order("language").order("term").limit(1000)).data ?? [] : [];
  const settings = tab === "settings" ? (await db.from("platform_settings").select("*").order("scope").order("key")).data ?? [] : [];
  const audit = tab === "audit" ? (await db.from("audit_logs").select("*, actor:profiles!audit_logs_actor_id_fkey(username)").order("id", { ascending: false }).limit(100)).data ?? [] : [];
  const sel = "input min-h-9 w-auto py-1 text-xs";
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Admin <span className="text-sm font-normal text-ink-soft">({viewer.role})</span></h1>
      <nav className="flex flex-wrap gap-2">{TABS.map((x) => <Link key={x} href={`/admin?tab=${x}`} className={`rounded-full px-3 py-1.5 text-sm ring-1 ring-line ${x === tab ? "bg-ink text-white" : "bg-white"}`}>{x}</Link>)}</nav>
      {sp.error && <Notice kind="error">{errorText(t, sp.error)}</Notice>}{sp.done && <Notice kind="ok">Saved — recorded in the audit log.</Notice>}
      {tab === "overview" && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Object.entries(stats).map(([k, v]) => <div key={k} className="card"><p className="text-xs text-ink-soft">{k}</p><p className="text-2xl font-extrabold">{String(v)}</p></div>)}</div>}
      {tab === "users" && (<>
        <form className="flex gap-2"><input type="hidden" name="tab" value="users" /><input name="q" defaultValue={q} placeholder="username" className="input" /><button className="btn-primary">Search</button></form>
        <section className="card text-sm"><h2 className="mb-2 font-bold">Staff</h2><ul className="space-y-1">{roles.map((x) => <li key={x.user_id}>@{(x.profile as unknown as { username: string })?.username} · {x.role}{x.can_suspend ? " · can suspend" : ""}</li>)}</ul></section>
        {users.map((u) => { const p = (Array.isArray(u.progress) ? u.progress[0] : u.progress) as { valid_posts: number; level: number } | null; return (
          <div key={u.id} className="card space-y-2 text-sm">
            <p><Link className="font-bold underline" href={`/u/${u.username}`}>@{u.username}</Link> · {u.status}{u.suspended_until ? ` until ${new Date(u.suspended_until).toLocaleDateString("ja-JP")}` : ""} · Lv {p?.level} ({p?.valid_posts} posts){u.premium_until && new Date(u.premium_until) > new Date() ? " · premium" : ""}</p>
            <UserStatusForm user={u.id} back={`/admin?tab=users&q=${q}`} allowBan />
            <form action={setRoleAction} className="flex flex-wrap items-center gap-1"><input type="hidden" name="user" value={u.id} />
              <select name="role" className={sel}><option value="none">no role</option><option value="moderator">moderator</option>{r >= 3 && <><option value="admin">admin</option><option value="super_admin">super_admin</option></>}</select>
              <label className="text-xs"><input type="checkbox" name="can_suspend" /> can suspend</label><button className="btn-ghost min-h-9 px-3">Set role</button></form>
            {r >= 3 && <form action={adjustProgressAction} className="flex flex-wrap gap-1"><input type="hidden" name="user" value={u.id} />
              <input name="valid_posts" type="number" min={0} defaultValue={p?.valid_posts} className={`${sel} w-24`} /><input name="reason" required placeholder="Reason" className={sel} /><button className="btn-ghost min-h-9 px-3">Adjust level progress</button></form>}
          </div>); })}
      </>)}
      {tab === "words" && (<>
        <form action={upsertWordAction} className="card flex flex-wrap gap-2">
          <input name="term" required maxLength={100} placeholder="word or phrase" className="input w-48" />
          <select name="language" className={sel}>{["en", "ja", "ne", "ne_rom", "any"].map((x) => <option key={x}>{x}</option>)}</select>
          <select name="severity" className={sel}><option value="mild">mild → warn</option><option value="review">review → moderator</option><option value="severe">severe → block</option><option value="allow">allow (exception)</option></select>
          <select name="category" className={sel}>{["profanity", "abuse", "slur", "hate", "harassment", "threat", "sexual", "spam", "other"].map((x) => <option key={x}>{x}</option>)}</select>
          <select name="match_type" className={sel}><option value="word">whole word</option><option value="phrase">substring (JA/NE)</option></select>
          <button className="btn-primary">Add / update</button></form>
        <ul className="card divide-y divide-line text-sm">{words.map((w) => (
          <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5"><span><b>{w.term}</b> · {w.language} · {w.severity} · {w.category} · {w.match_type}{w.is_active ? "" : " · inactive"}</span>
            <span className="flex gap-1">
              <form action={upsertWordAction}>{Object.entries({ id: w.id, term: w.term, language: w.language, severity: w.severity, category: w.category, match_type: w.match_type, active: w.is_active ? "off" : "on" }).map(([k, v]) => <input key={k} type="hidden" name={k} value={String(v)} />)}<button className="text-xs underline">{w.is_active ? "disable" : "enable"}</button></form>
              <form action={deleteWordAction}><input type="hidden" name="id" value={w.id} /><button className="text-xs text-red-700 underline">delete</button></form></span></li>))}</ul>
      </>)}
      {tab === "settings" && settings.map((s) => (
        <form key={s.key} action={updateSettingAction} className="card flex flex-wrap items-end gap-2 text-sm"><input type="hidden" name="key" value={s.key} />
          <label className="grow"><span className="label">{s.key} <span className="text-xs text-ink-soft">({s.scope}{s.scope === "platform" ? ", super admin" : ""}) — {s.description}</span></span>
            <input name="value" defaultValue={JSON.stringify(s.value)} className="input" /></label><button className="btn-ghost">Save</button></form>))}
      {tab === "audit" && <ul className="card space-y-1 text-xs">{audit.map((a) => <li key={a.id}>{new Date(a.created_at).toLocaleString("ja-JP")} · @{a.actor?.username ?? "system"} · <b>{a.action}</b> · {a.target_type} {a.target_id} · {JSON.stringify(a.details)}</li>)}</ul>}
    </div>
  );
}
