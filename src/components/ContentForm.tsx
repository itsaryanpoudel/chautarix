"use client";
import { useActionState, useState } from "react";
import type { FormState } from "@/actions/content";

type Props = {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  hidden?: Record<string, string | number>;
  initial?: string; max: number; rows?: number; resetOnSuccess?: boolean;
  labels: { placeholder: string; submit: string; postAnyway: string; charsLeft: string };
};

/** Shared composer for posts/comments: server-side filter verdicts (warn / block / review) are shown inline. */
export function ContentForm({ action, hidden = {}, initial = "", max, rows = 4, resetOnSuccess = true, labels }: Props) {
  const [text, setText] = useState(initial);
  const [state, formAction, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const res = await action(prev, fd);
    if (res.ok && resetOnSuccess) setText("");
    return res;
  }, {});
  const left = max - text.length;
  return (
    <form action={formAction} className="space-y-2">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <textarea name="body" value={text} onChange={(e) => setText(e.target.value)} rows={rows} maxLength={max} required
        placeholder={labels.placeholder} className="input resize-y leading-7" aria-label={labels.placeholder} />
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.info && <p role="status" className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">{state.info}</p>}
      {state.warning && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{state.warning}</p>}
      <div className="flex items-center justify-end gap-3">
        <span className={`text-xs ${left < 100 ? "text-coral" : "text-ink-soft"}`}>{labels.charsLeft.replace("{n}", String(left))}</span>
        {state.warning && <button name="ack" value="1" disabled={pending} className="btn-ghost">{labels.postAnyway}</button>}
        <button disabled={pending || !text.trim()} className="btn-primary">{labels.submit}</button>
      </div>
    </form>
  );
}
