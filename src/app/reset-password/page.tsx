import { AuthForm } from "@/components/AuthForm";
import { getI18n } from "@/i18n/server";
import { authDict } from "@/lib/authDict";
import { requireViewer } from "@/lib/auth";

export default async function Reset() {
  await requireViewer("/reset-password");   // the emailed link signs the user in first
  const { t } = await getI18n();
  return (<div className="mx-auto max-w-sm space-y-5"><h1 className="text-2xl font-extrabold">{t.auth.resetTitle}</h1>
    <div className="card"><AuthForm mode="reset" t={authDict(t)} /></div></div>);
}
