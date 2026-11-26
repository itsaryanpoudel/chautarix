import { notFound } from "next/navigation";
import { ContentForm } from "@/components/ContentForm";
import { updatePostAction } from "@/actions/content";
import { getI18n } from "@/i18n/server";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function EditPost({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const viewer = await requireViewer(`/p/${id}/edit`);
  const [{ t }, supabase] = await Promise.all([getI18n(), createClient()]);
  const { data } = await supabase.from("posts").select("id, body, author_id, status").eq("id", Number.isSafeInteger(id) ? id : 0).maybeSingle();
  if (!data || data.author_id !== viewer.id || !["published", "pending_review"].includes(data.status)) notFound();
  return (<div className="space-y-4"><h1 className="text-xl font-bold">{t.post.editPost}</h1><div className="card">
    <ContentForm action={updatePostAction} hidden={{ id }} initial={data.body} max={5000} rows={8} resetOnSuccess={false}
      labels={{ placeholder: t.post.placeholder, submit: t.post.save, postAnyway: t.post.postAnyway, charsLeft: t.post.charsLeft }} /></div></div>);
}
