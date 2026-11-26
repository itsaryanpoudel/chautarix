import { ActionForm } from "@/components/ActionForm";
import { reportAction } from "@/actions/content";
import { getI18n } from "@/i18n/server";
import { requireViewer } from "@/lib/auth";

export const metadata = { title: "Report" };
export default async function Report({ searchParams }: { searchParams: Promise<{ type?: string; id?: string }> }) {
  const sp = await searchParams;
  const type = ["post", "comment", "user"].includes(sp.type ?? "") ? sp.type! : "post";
  const id = String(sp.id ?? "").slice(0, 40);
  await requireViewer(`/report?type=${type}&id=${encodeURIComponent(id)}`);
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-extrabold">{t.report.title}</h1>
      <p className="text-sm text-ink-soft">{type} · {type === "user" ? `@${id}` : `#${id}`}</p>
      <ActionForm action={reportAction} submit={t.report.submit} className="card space-y-4">
        <input type="hidden" name="type" value={type} /><input type="hidden" name="id" value={id} />
        <fieldset className="space-y-2"><legend className="label">{t.report.reason}</legend>
          {Object.entries(t.report.reasons).map(([k, label], i) => (
            <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="reason" value={k} required defaultChecked={i === 0} /> {label}</label>))}
        </fieldset>
        <label className="block"><span className="label">{t.report.details}</span><textarea name="details" maxLength={1000} rows={3} className="input" /></label>
      </ActionForm>
    </div>
  );
}
