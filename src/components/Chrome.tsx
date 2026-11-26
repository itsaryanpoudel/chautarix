import Link from "next/link";
import { Logo } from "./Logo";
import { getViewer, rank } from "@/lib/auth";
import { getI18n } from "@/i18n/server";
import { localeNames, locales } from "@/i18n/config";
import { setLocaleAction } from "@/actions/account";

export async function Header() {
  const [viewer, { t }] = await Promise.all([getViewer(), getI18n()]);
  const r = rank(viewer?.role ?? null);
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-washi/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
        <Link href={viewer ? "/feed" : "/"} aria-label="Sanghu home"><Logo /></Link>
        <nav className="flex items-center gap-1 overflow-x-auto text-sm font-medium">
          <Link href="/feed" className="rounded-full px-3 py-2 hover:bg-white">{t.nav.feed}</Link>
          {r >= 1 && <Link href="/mod" className="rounded-full px-3 py-2 hover:bg-white">{t.nav.mod}</Link>}
          {r >= 2 && <Link href="/admin" className="rounded-full px-3 py-2 hover:bg-white">{t.nav.admin}</Link>}
          {viewer ? (
            <Link href={`/u/${viewer.username}`} className="rounded-full bg-white px-3 py-2 ring-1 ring-line">@{viewer.username}</Link>
          ) : (<>
            <Link href="/login" className="rounded-full px-3 py-2 hover:bg-white">{t.nav.login}</Link>
            <Link href="/register" className="btn-coral min-h-9 px-4">{t.nav.register}</Link>
          </>)}
        </nav>
      </div>
    </header>
  );
}

export async function Footer() {
  const [viewer, { t, locale }] = await Promise.all([getViewer(), getI18n()]);
  return (
    <footer className="mt-12 border-t border-line">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 text-sm text-ink-soft">
        <form action={setLocaleAction} className="flex flex-wrap gap-2" aria-label="Language">
          {locales.map((l) => (
            <button key={l} name="lang" value={l} aria-pressed={l === locale}
              className={`rounded-full px-3 py-1.5 ring-1 ring-line ${l === locale ? "bg-ink text-white" : "bg-white"}`}>{localeNames[l]}</button>
          ))}
        </form>
        <nav className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/guidelines">{t.footer.guidelines}</Link><Link href="/privacy">{t.footer.privacy}</Link>
          <Link href="/terms">{t.footer.terms}</Link><Link href="/legal/commerce">{t.footer.commerce}</Link>
          <Link href="/premium">{t.nav.premium}</Link>
          {viewer && <Link href="/settings/account">{t.nav.settings}</Link>}
        </nav>
        {viewer && <form action="/auth/signout" method="post"><button className="underline">{t.nav.logout}</button></form>}
        <p>© {new Date().getFullYear()} Sanghu · {t.footer.made}</p>
      </div>
    </footer>
  );
}
