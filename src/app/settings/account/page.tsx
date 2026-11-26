import { ActionForm } from "@/components/ActionForm";
import { AuthForm } from "@/components/AuthForm";
import { changeUsernameAction, deleteAccountAction } from "@/actions/account";
import { getI18n } from "@/i18n/server";
import { requireViewer } from "@/lib/auth";
import { authDict } from "@/lib/authDict";

export default async function AccountSettings() {
  const viewer = await requireViewer("/settings/account");
  const { t } = await getI18n();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">{t.settings.title}</h1>
      <p className="text-sm text-ink-soft">🔒 {t.settings.emailPrivate}</p>
      <section className="card space-y-3"><h2 className="font-bold">{t.settings.username}</h2>
        <ActionForm action={changeUsernameAction} submit={t.settings.change}>
          <input name="username" defaultValue={viewer.username} pattern="[a-z0-9]{3,20}" required className="input" autoCapitalize="none" />
          <p className="text-xs text-ink-soft">{t.settings.usernameRule} {t.errors.premium_required}</p>
        </ActionForm></section>
      <section className="card space-y-3"><h2 className="font-bold">{t.settings.password}</h2><AuthForm mode="change" t={authDict(t)} /></section>
      <section className="card space-y-3 border-red-200"><h2 className="font-bold text-red-700">{t.settings.delete}</h2>
        <p className="text-sm text-ink-soft">{t.settings.deleteWarn}</p>
        <ActionForm action={deleteAccountAction} submit={t.settings.delete} danger>
          <input name="password" type="password" required placeholder={t.auth.currentPassword} className="input" autoComplete="current-password" />
          <input name="confirm" required placeholder={t.settings.deleteConfirm} className="input" />
        </ActionForm></section>
    </div>
  );
}
