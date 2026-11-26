import { AuthForm } from "@/components/AuthForm";
import { getI18n } from "@/i18n/server";
import { authDict } from "@/lib/authDict";

export default async function Forgot() {
  const { t } = await getI18n();
  return (<div className="mx-auto max-w-sm space-y-5"><h1 className="text-2xl font-extrabold">{t.auth.forgotTitle}</h1>
    <div className="card"><AuthForm mode="forgot" t={authDict(t)} /></div></div>);
}
