import { notFound } from "next/navigation";
import { ContentForm } from "@/components/ContentForm";
import { updateCommentAction } from "@/actions/content";
import { getI18n } from "@/i18n/server";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function EditComment({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const viewer = await requireViewer(`/c/${id}/edit`);
  const [{ t }, supabase] = await Promise.all([getI18n(), createClient()]);
  const { data } = await supabase.from("comments").select("id, body, author_id, status").eq("id", Number.isSafeInteger(id) ? id : 0).maybeSingle();
  if (!data || data.author_id !== viewer.id || !["published", "pending_review"].includes(data.status)) notFound();
  return (<div className="space-y-4"><h1 className="text-xl font-bold">{t.post.editComment}</h1><div className="card">
    <ContentForm action={updateCommentAction} hidden={{ id }} initial={data.body} max={2000} rows={5} resetOnSuccess={false}
      labels={{ placeholder: t.post.commentPlaceholder, submit: t.post.save, postAnyway: t.post.postAnyway, charsLeft: t.post.charsLeft }} /></div></div>);
}
