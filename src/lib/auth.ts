import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export type Role = "super_admin" | "admin" | "moderator" | null;
export type Viewer = { id: string; username: string; residence: string; isPremium: boolean; role: Role; canSuspend: boolean };

/** The signed-in user, verified server-side. Roles/premium always come from the database, never from the client. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) return null;
  const [{ data: p }, { data: r }] = await Promise.all([
    supabase.from("profiles").select("username, residence_country, premium_until").eq("id", uid).maybeSingle(),
    supabase.rpc("my_staff_role"),
  ]);
  if (!p) return null;
  return {
    id: uid, username: p.username, residence: p.residence_country,
    isPremium: !!p.premium_until && new Date(p.premium_until) > new Date(),
    role: (r?.role ?? null) as Role, canSuspend: !!r?.can_suspend,
  };
});

export async function requireViewer(next: string) {
  const v = await getViewer();
  if (!v) redirect(`/login?next=${encodeURIComponent(next)}`);
  return v;
}
export const rank = (role: Role) => (role === "super_admin" ? 3 : role === "admin" ? 2 : role === "moderator" ? 1 : 0);
