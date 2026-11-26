export function Notice({ kind = "info", children }: { kind?: "info" | "error" | "ok"; children: React.ReactNode }) {
  const c = kind === "error" ? "bg-red-50 text-red-700" : kind === "ok" ? "bg-teal-50 text-teal-800" : "bg-amber-50 text-amber-900";
  return <p role={kind === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${c}`}>{children}</p>;
}
