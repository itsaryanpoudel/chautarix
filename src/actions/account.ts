"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getStripe } from "@/lib/stripe";
import { errorText, getI18n } from "@/i18n/server";
import { isLocale } from "@/i18n/config";
import { callRpc, type FormState } from "./content";

export async function setLocaleAction(fd: FormData) {
  const lang = String(fd.get("lang"));
  if (isLocale(lang)) (await cookies()).set("lang", lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function updateProfileAction(_: FormState, fd: FormData): Promise<FormState> {
  const age = String(fd.get("age") ?? "").trim();
  const r = await callRpc("update_my_profile", {
    p_residence: String(fd.get("residence") ?? ""), p_nationality: String(fd.get("nationality") ?? ""),
    p_city: String(fd.get("city") ?? "").slice(0, 80), p_age: age ? Number.parseInt(age, 10) || -1 : null,
    p_bio: String(fd.get("bio") ?? "").slice(0, 400),
    p_show_age: fd.get("show_age") === "on", p_show_nationality: fd.get("show_nationality") === "on",
    p_show_city: fd.get("show_city") === "on", p_show_bio: fd.get("show_bio") === "on",
  });
  const { t } = await getI18n();
  if (r.ok) { revalidatePath("/", "layout"); return { ok: true, info: t.profile.saved }; }
  return { error: errorText(t, r.error) };
}

export async function changeUsernameAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await callRpc("change_username", { p_name: String(fd.get("username") ?? "").trim().toLowerCase().slice(0, 30) });
  const { t } = await getI18n();
  if (r.ok) { revalidatePath("/", "layout"); return { ok: true, info: t.profile.saved }; }
  return { error: errorText(t, r.error) };
}

/** Verifies the password, cancels Stripe, then deletes the auth user (DB cascades remove personal data). */
export async function deleteAccountAction(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getI18n();
  if (String(fd.get("confirm")) !== "DELETE") return { error: t.errors.confirm_text };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: t.errors.not_authenticated };
  const check = createPlainClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false } });
  const { error: pwError } = await check.auth.signInWithPassword({ email: user.email, password: String(fd.get("password") ?? "") });
  if (pwError) return { error: t.errors.wrong_password };
  const admin = createAdminClient();
  const { data: sub } = await admin.from("subscriptions").select("stripe_subscription_id, status").eq("user_id", user.id).maybeSingle();
  const stripe = getStripe();
  if (stripe && sub?.stripe_subscription_id && !["canceled", "incomplete_expired"].includes(sub.status)) {
    await stripe.subscriptions.cancel(sub.stripe_subscription_id).catch(() => null);
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: t.errors.generic };
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
