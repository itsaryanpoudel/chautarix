import Link from "next/link";
import { Notice } from "@/components/Notice";
import { billingPortalAction, startCheckoutAction } from "@/actions/billing";
import { errorText, getI18n } from "@/i18n/server";
import { getViewer } from "@/lib/auth";
import { paymentsEnabled } from "@/lib/env";
import { fmt, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Premium" };
export default async function Premium({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; check?: string }> }) {
  const [{ t, locale }, viewer, sp] = await Promise.all([getI18n(), getViewer(), searchParams]);
  const enabled = paymentsEnabled();
  const supabase = viewer ? await createClient() : null;
  const [sub, payments, check] = supabase ? await Promise.all([
    supabase.from("subscriptions").select("*").eq("user_id", viewer!.id).maybeSingle().then((r) => r.data),
    supabase.from("payments").select("*").eq("user_id", viewer!.id).order("id", { ascending: false }).limit(24).then((r) => r.data ?? []),
    sp.check ? supabase.rpc("username_available", { p_name: sp.check.slice(0, 30) }).then((r) => r.data) : Promise.resolve(null),
  ]) : [null, [], null];
  const plan = (title: string, price: string, list: string, accent: boolean) => (
    <div className={`card ${accent ? "ring-2 ring-coral" : ""}`}><h2 className="font-bold">{title}</h2><p className="text-lg font-extrabold">{price}</p>
      <ul className="mt-2 space-y-1 text-sm">{list.split("|").map((x) => <li key={x}>✓ {x}</li>)}</ul></div>);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">◆ {t.premium.title}</h1>
      {sp.status === "success" && <Notice kind="ok">{t.premium.success}</Notice>}
      {sp.status === "cancelled" && <Notice>{t.premium.cancelled}</Notice>}
      {sp.error && <Notice kind="error">{errorText(t, sp.error)}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2">{plan(t.premium.free, "¥0", t.premium.freeList, false)}{plan("Premium", t.premium.price, t.premium.premiumList, true)}</div>
      <p className="text-xs text-ink-soft">{t.premium.policy}</p>
      {!enabled ? <Notice>{t.premium.disabled}</Notice> : !viewer ? (
        <p className="card text-sm">{t.premium.loginFirst} <Link className="font-semibold text-coral underline" href="/login?next=/premium">{t.nav.login}</Link></p>
      ) : viewer.isPremium || ["active", "trialing", "past_due"].includes(sub?.status) ? (
        <section className="card space-y-3">
          <Notice kind="ok">{t.premium.active} {sub?.current_period_end && fmt(sub.cancel_at_period_end ? t.premium.ends : t.premium.renews, { d: formatDate(sub.current_period_end, locale) })}</Notice>
          <form action={billingPortalAction}><button className="btn-primary">{t.premium.manage}</button></form>
          {viewer.isPremium && <p className="text-sm">{t.premium.choose}: <Link href="/settings/account" className="underline">{t.nav.settings}</Link></p>}
        </section>
      ) : (
        <section className="card space-y-4">
          <form className="flex gap-2" method="get"><input name="check" defaultValue={sp.check} pattern="[a-z0-9]{3,20}" placeholder="abc" className="input" aria-label={t.premium.choose} autoCapitalize="none" />
            <button className="btn-ghost">{t.premium.check}</button></form>
          <p className="text-xs text-ink-soft">{t.premium.choose}</p>
          {check && <Notice kind={check.available ? "ok" : "error"}>@{check.username}: {check.available ? t.auth.available : errorText(t, check.problem)}</Notice>}
          <form action={startCheckoutAction} className="space-y-3">
            <input type="hidden" name="username" value={check?.available ? check.username : ""} />
            <div className="rounded-xl bg-washi p-3 text-sm"><p className="font-bold">{t.premium.confirmTitle}</p><p className="mt-1">{t.premium.confirm}</p>
              {check?.available && <p className="mt-1">Username: <b>@{check.username}</b></p>}
              <p className="mt-1"><Link className="underline" href="/terms">{t.footer.terms}</Link> · <Link className="underline" href="/legal/commerce">{t.footer.commerce}</Link></p></div>
            <button className="btn-coral w-full">{t.premium.subscribe}</button>
          </form>
        </section>
      )}
      {payments.length > 0 && (
        <section className="card"><h2 className="mb-2 font-bold">{t.premium.history}</h2>
          <ul className="divide-y divide-line text-sm">{payments.map((p) => (
            <li key={p.id} className="flex justify-between py-2"><span>{formatDate(p.created_at, locale)}</span><span>¥{p.amount} · {p.status}</span>
              {p.hosted_invoice_url && <a href={p.hosted_invoice_url} rel="noopener noreferrer" target="_blank" className="underline">Invoice</a>}</li>))}</ul></section>
      )}
    </div>
  );
}
