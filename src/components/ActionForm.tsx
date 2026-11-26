"use client";
import { startTransition, useActionState } from "react";
import type { FormState } from "@/actions/content";

/** Server-action form that keeps user input on error (no automatic form reset). */
export function ActionForm({ action, children, submit, className = "space-y-4", danger = false }: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>; children: React.ReactNode; submit: string; className?: string; danger?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form className={className} onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
      startTransition(() => formAction(fd));
    }}>
      {children}
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.info && <p role="status" className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">{state.info}</p>}
      <button disabled={pending} className={danger ? "btn bg-red-600 text-white" : "btn-primary"}>{submit}</button>
    </form>
  );
}
