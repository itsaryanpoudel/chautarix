"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { safePath } from "@/lib/format";

type Mode = "login" | "register" | "forgot" | "reset" | "change";
type Dict = Record<string, string>;
type Props = { mode: Mode; t: { auth: Dict; errors: Dict; legal: Dict }; next?: string; countries?: { code: string; label: string }[] };

/** Auth runs in the browser so Supabase's per-IP rate limits apply to each visitor. */
export function AuthForm({ mode, t, next = "/feed", countries = [] }: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [usernameOk, setUsernameOk] = useState<string | null>(null);
  const sb = () => createBrowserSupabase();   // created lazily: never during server render
  const safeNext = safePath(next);

  async function checkUsername(name: string) {
    setUsernameOk(null);
    if (!/^[a-z0-9]{5,20}$/.test(name)) return setMsg({ type: "error", text: t.auth.usernameHint });
    const { data } = await sb().rpc("username_available", { p_name: name });
    if (data?.available && !data?.premium_only) { setMsg(null); setUsernameOk(name); return true; }
    setMsg({ type: "error", text: t.errors[data?.problem ?? "taken"] ?? t.errors.generic });
    return false;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim(), password = String(f.get("password") ?? "");
    setBusy(true); setMsg(null);
    try {
      if (mode === "login") {
        const { error } = await sb().auth.signInWithPassword({ email, password });
        if (error) return setMsg({ type: "error", text: t.auth.invalidLogin });
        router.replace(safeNext); router.refresh();
      } else if (mode === "register") {
        const username = String(f.get("username") ?? "").toLowerCase();
        if (password.length < 8) return setMsg({ type: "error", text: t.errors.weak_password });
        if (!(await checkUsername(username))) return;
        const { error } = await sb().auth.signUp({ email, password, options: {
          emailRedirectTo: `${location.origin}/auth/confirm?next=/feed`,
          data: { username, residence_country: String(f.get("country") ?? "JP") } } });
        if (error) return setMsg({ type: "error", text: error.message.includes("registration_closed") ? t.errors.registration_closed : error.message });
        setMsg({ type: "ok", text: t.auth.checkEmail }); e.currentTarget?.reset();
      } else if (mode === "forgot") {
        await sb().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/confirm?next=/reset-password` });
        setMsg({ type: "ok", text: t.auth.linkSent });
      } else {
        const newPassword = String(f.get("newPassword") ?? "");
        if (newPassword.length < 8) return setMsg({ type: "error", text: t.errors.weak_password });
        if (newPassword !== String(f.get("confirm") ?? "")) return setMsg({ type: "error", text: t.errors.password_mismatch });
        if (mode === "change") {   // re-verify the current password before changing it
          const { data: u } = await sb().auth.getUser();
          const { error } = await sb().auth.signInWithPassword({ email: u.user?.email ?? "", password });
          if (error) return setMsg({ type: "error", text: t.errors.wrong_password });
        }
        const { error } = await sb().auth.updateUser({ password: newPassword });
        if (error) return setMsg({ type: "error", text: error.message });
        setMsg({ type: "ok", text: t.auth.passwordUpdated });
        if (mode === "reset") { router.replace("/feed"); router.refresh(); }
      }
    } finally { setBusy(false); }
  }

  const field = (name: string, label: string, type = "text", extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block"><span className="label">{label}</span><input name={name} type={type} required className="input" {...extra} /></label>
  );
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {(mode === "login" || mode === "register" || mode === "forgot") && field("email", t.auth.email, "email", { autoComplete: "email" })}
      {mode === "register" && (<>
        {field("username", t.auth.username, "text", { pattern: "[a-z0-9]{5,20}", minLength: 5, maxLength: 20, autoCapitalize: "none", autoComplete: "username",
          onBlur: (e) => e.currentTarget.value && checkUsername(e.currentTarget.value.toLowerCase()) })}
        <p className="-mt-3 text-xs text-ink-soft">{usernameOk ? <span className="text-teal-700">{t.auth.available} @{usernameOk}</span> : t.auth.usernameHint}</p>
        <label className="block"><span className="label">{t.auth.residence}</span>
          <select name="country" defaultValue="JP" className="input">{countries.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
      </>)}
      {(mode === "login" || mode === "register") && field("password", t.auth.password, "password", { minLength: mode === "register" ? 8 : undefined, autoComplete: mode === "login" ? "current-password" : "new-password" })}
      {mode === "change" && field("password", t.auth.currentPassword, "password", { autoComplete: "current-password" })}
      {(mode === "reset" || mode === "change") && (<>{field("newPassword", t.auth.newPassword, "password", { minLength: 8, autoComplete: "new-password" })}
        {field("confirm", t.auth.confirmPassword, "password", { minLength: 8, autoComplete: "new-password" })}</>)}
      {mode === "register" && (
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" required className="mt-1 size-4" />
          <span>{t.auth.agree} (<Link className="underline" href="/terms">{t.legal.terms}</Link> · <Link className="underline" href="/privacy">{t.legal.privacy}</Link> · <Link className="underline" href="/guidelines">{t.legal.guidelines}</Link>)</span></label>
      )}
      {msg && <p role={msg.type === "error" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${msg.type === "error" ? "bg-red-50 text-red-700" : "bg-teal-50 text-teal-800"}`}>{msg.text}</p>}
      <button disabled={busy} className="btn-primary w-full">
        {mode === "login" ? t.auth.loginTitle : mode === "register" ? t.auth.registerTitle : mode === "forgot" ? t.auth.sendLink : t.auth.newPassword}
      </button>
    </form>
  );
}
