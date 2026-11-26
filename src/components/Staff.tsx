import { moderateContentAction, resolveReportAction, setUserStatusAction } from "@/actions/staff";

const h = (n: string, v: string | number) => <input type="hidden" name={n} value={v} />;
export function ContentActions({ type, id, status, report, back = "/mod" }: { type: "post" | "comment"; id: number; status: string; report?: number; back?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {status === "pending_review" && <form action={moderateContentAction}>{h("type", type)}{h("id", id)}{h("action", "approve")}{h("back", back)}{report ? h("report", report) : null}<button className="btn min-h-9 bg-teal-600 px-3 text-white">Approve</button></form>}
      {status === "removed" ? <form action={moderateContentAction}>{h("type", type)}{h("id", id)}{h("action", "restore")}{h("back", back)}<button className="btn-ghost min-h-9 px-3">Restore</button></form> : (
        <form action={moderateContentAction} className="flex gap-1">{h("type", type)}{h("id", id)}{h("action", "remove")}{h("back", back)}{report ? h("report", report) : null}
          <input name="reason" required placeholder="Reason (recorded)" className="input min-h-9 w-44 py-1 text-xs" /><button className="btn min-h-9 bg-red-600 px-3 text-white">Remove</button></form>)}
    </div>
  );
}
export function ReportActions({ id }: { id: number }) {
  return (
    <form action={resolveReportAction} className="flex flex-wrap gap-1">{h("id", id)}
      <input name="note" placeholder="Note" className="input min-h-9 w-40 py-1 text-xs" />
      <button name="status" value="resolved" className="btn-ghost min-h-9 px-3">Resolve</button>
      <button name="status" value="dismissed" className="btn-ghost min-h-9 px-3">Dismiss</button>
    </form>
  );
}
export function UserStatusForm({ user, back, allowBan }: { user: string; back: string; allowBan: boolean }) {
  return (
    <form action={setUserStatusAction} className="flex flex-wrap gap-1">{h("user", user)}{h("back", back)}
      <select name="status" className="input min-h-9 w-auto py-1 text-xs"><option value="suspended">Suspend</option>{allowBan && <option value="banned">Ban</option>}<option value="active">Reactivate</option></select>
      <input name="days" type="number" min={1} max={365} placeholder="days" className="input min-h-9 w-20 py-1 text-xs" />
      <input name="reason" required placeholder="Reason (recorded)" className="input min-h-9 w-40 py-1 text-xs" /><button className="btn-ghost min-h-9 px-3">Apply</button>
    </form>
  );
}
