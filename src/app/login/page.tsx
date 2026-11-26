import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { Notice } from "@/components/Notice";
import { getI18n } from "@/i18n/server";
import { authDict } from "@/lib/authDict";

export const metadata = { title: "Log in" };
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const [{ t }, sp] = await Promise.all([getI18n(), searchParams]);
  return (
    <div className="mx-auto max-w-sm space-y-5">
      <h1 className="text-2xl font-extrabold">{t.auth.loginTitle}</h1>
      {sp.error && <Notice kind="error">{sp.error === "link" ? t.auth.linkError : t.errors.generic}</Notice>}
      <div className="card"><AuthForm mode="login" t={authDict(t)} next={sp.next} /></div>
      <p className="flex justify-between text-sm"><Link href="/forgot-password" className="underline">{t.auth.forgot}</Link><Link href="/register" className="font-semibold text-coral">{t.auth.noAccount}</Link></p>
    </div>
  );
}
