"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { callRpc } from "./content";

// Every staff action is authorised again inside the database (rank checks + audit log).
async function run(back: string, fn: string, args: Record<string, unknown>) {
  const r = await callRpc(fn, args);
  revalidatePath(back);
  const safe = back.startsWith("/mod") || back.startsWith("/admin") ? back : "/mod";
  redirect(`${safe}${safe.includes("?") ? "&" : "?"}${r.ok ? "done=1" : `error=${encodeURIComponent(r.error ?? "generic")}`}`);
}
const s = (fd: FormData, k: string, max = 500) => String(fd.get(k) ?? "").slice(0, max);
const n = (fd: FormData, k: string) => { const v = Number(fd.get(k)); return Number.isSafeInteger(v) ? v : null; };

export async function moderateContentAction(fd: FormData) {
  await run(s(fd, "back") || "/mod", "mod_act_on_content", {
    p_type: s(fd, "type"), p_id: n(fd, "id"), p_action: s(fd, "action"), p_reason: s(fd, "reason") || null, p_report_id: n(fd, "report") || null });
}
export async function resolveReportAction(fd: FormData) {
  await run("/mod", "mod_resolve_report", { p_id: n(fd, "id"), p_status: s(fd, "status"), p_note: s(fd, "note") || null });
}
export async function setUserStatusAction(fd: FormData) {
  await run(s(fd, "back") || "/mod", "staff_set_user_status", {
    p_user_id: s(fd, "user"), p_status: s(fd, "status"), p_days: n(fd, "days") || null, p_reason: s(fd, "reason") });
}
export async function setRoleAction(fd: FormData) {
  const role = s(fd, "role");
  await run("/admin?tab=users", "admin_set_role", { p_user_id: s(fd, "user"), p_role: role === "none" ? null : role, p_can_suspend: fd.get("can_suspend") === "on" });
}
export async function upsertWordAction(fd: FormData) {
  await run("/admin?tab=words", "admin_upsert_word", { p_id: n(fd, "id") || null, p_term: s(fd, "term", 100), p_language: s(fd, "language", 10),
    p_severity: s(fd, "severity"), p_category: s(fd, "category"), p_match_type: s(fd, "match_type"), p_active: fd.get("active") !== "off" });
}
export async function deleteWordAction(fd: FormData) {
  await run("/admin?tab=words", "admin_delete_word", { p_id: n(fd, "id") });
}
export async function updateSettingAction(fd: FormData) {
  let value: unknown;
  try { value = JSON.parse(s(fd, "value", 2000)); } catch { value = s(fd, "value", 2000); }
  await run("/admin?tab=settings", "admin_update_setting", { p_key: s(fd, "key", 64), p_value: value });
}
export async function adjustProgressAction(fd: FormData) {
  await run("/admin?tab=users", "admin_adjust_progress", { p_user_id: s(fd, "user"), p_valid_posts: n(fd, "valid_posts"), p_reason: s(fd, "reason") });
}
