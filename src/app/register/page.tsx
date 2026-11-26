import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { getI18n } from "@/i18n/server";
import { authDict } from "@/lib/authDict";
import { COUNTRY_CODES, countryName, flag } from "@/lib/countries";

export const metadata = { title: "Join free" };
export default async function Register() {
  const { t, locale } = await getI18n();
  const countries = COUNTRY_CODES.map((code) => ({ code, label: `${flag(code)} ${countryName(code, locale)}` }));
  return (
    <div className="mx-auto max-w-sm space-y-5">
      <h1 className="text-2xl font-extrabold">{t.auth.registerTitle}</h1>
      <div className="card"><AuthForm mode="register" t={authDict(t)} countries={countries} /></div>
      <p className="text-sm text-ink-soft">{t.settings.emailPrivate}</p>
      <Link href="/login" className="block text-sm font-semibold text-coral">{t.auth.haveAccount}</Link>
    </div>
  );
}
