"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { errorText, getI18n } from "@/i18n/server";
import { fmt } from "@/lib/format";

export type FormState = { ok?: boolean; error?: string; warning?: string; info?: string };
type RpcResult = { ok?: boolean; id?: number; post_id?: number; status?: string; warning?: boolean; error?: string; categories?: string[] };

/** Calls a SECURITY DEFINER function as the current user. The database validates, filters and rate-limits. */
export async function callRpc(fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  return (data ?? {}) as RpcResult;
}
const id = (v: FormDataEntryValue | null) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : 0; };
const body = (fd: FormData) => String(fd.get("body") ?? "").slice(0, 6000);

async function toState(r: RpcResult): Promise<FormState> {
  const { t } = await getI18n();
  const c = (r.categories ?? []).join(", ");
  if (r.ok) return { ok: true, info: r.status === "pending_review" ? t.post.sentForReview : undefined };
  if (r.warning) return { warning: fmt(t.post.warning, { c }) };
  if (r.error === "blocked") return { error: fmt(t.post.blocked, { c }) };
  return { error: errorText(t, r.error) };
}

export async function createPostAction(_: FormState, fd: FormData) {
  const r = await callRpc("create_post", { p_body: body(fd), p_ack_warning: fd.get("ack") === "1" });
  if (r.ok) revalidatePath("/feed");
  return toState(r);
}
export async function updatePostAction(_: FormState, fd: FormData) {
  const postId = id(fd.get("id"));
  const r = await callRpc("update_post", { p_id: postId, p_body: body(fd), p_ack_warning: fd.get("ack") === "1" });
  if (r.ok) redirect(`/p/${postId}`);
  return toState(r);
}
export async function deletePostAction(fd: FormData) {
  await callRpc("delete_post", { p_id: id(fd.get("id")) });
  revalidatePath("/feed");
  redirect("/feed");
}
export async function createCommentAction(_: FormState, fd: FormData) {
  const postId = id(fd.get("postId"));
  const r = await callRpc("create_comment", { p_post_id: postId, p_body: body(fd), p_ack_warning: fd.get("ack") === "1" });
  if (r.ok) revalidatePath(`/p/${postId}`);
  return toState(r);
}
export async function updateCommentAction(_: FormState, fd: FormData) {
  const r = await callRpc("update_comment", { p_id: id(fd.get("id")), p_body: body(fd), p_ack_warning: fd.get("ack") === "1" });
  if (r.ok) redirect(`/p/${r.post_id}`);
  return toState(r);
}
export async function deleteCommentAction(fd: FormData) {
  const r = await callRpc("delete_comment", { p_id: id(fd.get("id")) });
  redirect(r.post_id ? `/p/${r.post_id}` : "/feed");
}
export async function reportAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await callRpc("create_report", {
    p_target_type: String(fd.get("type") ?? ""), p_target_id: String(fd.get("id") ?? "").slice(0, 40),
    p_reason: String(fd.get("reason") ?? ""), p_details: String(fd.get("details") ?? "").slice(0, 1000),
  });
  const { t } = await getI18n();
  return r.ok ? { ok: true, info: t.report.thanks } : { error: errorText(t, r.error) };
}
