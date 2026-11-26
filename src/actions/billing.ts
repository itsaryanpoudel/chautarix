"use server";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { callRpc } from "./content";

async function customerFor(userId: string) {
  const stripe = getStripe()!;
  const supabase = await createClient();
  const { data } = await supabase.from("subscriptions").select("stripe_customer_id, status").eq("user_id", userId).maybeSingle();
  if (data?.stripe_customer_id) return { id: data.stripe_customer_id as string, status: data.status as string };
  const customer = await stripe.customers.create({ metadata: { user_id: userId } }); // no email/name sent: data minimisation
  await createAdminClient().from("subscriptions").upsert({ user_id: userId, stripe_customer_id: customer.id, status: "none" });
  return { id: customer.id, status: "none" };
}

export async function startCheckoutAction(fd: FormData) {
  const viewer = await requireViewer("/premium");
  const stripe = getStripe();
  if (!stripe) redirect("/premium?error=payments_disabled");
  const wanted = String(fd.get("username") ?? "").trim().toLowerCase();
  if (wanted) {   // check + reserve the short username BEFORE payment
    const r = await callRpc("reserve_premium_username", { p_name: wanted.slice(0, 30) });
    if (!r.ok) redirect(`/premium?error=${encodeURIComponent(r.error ?? "generic")}`);
  }
  const customer = await customerFor(viewer.id);
  if (["active", "trialing", "past_due"].includes(customer.status)) redirect("/premium");  // never double-subscribe
  const session = await stripe.checkout.sessions.create({
    mode: "subscription", customer: customer.id, client_reference_id: viewer.id,
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    metadata: { user_id: viewer.id }, subscription_data: { metadata: { user_id: viewer.id } },
    success_url: `${env.siteUrl}/premium?status=success`, cancel_url: `${env.siteUrl}/premium?status=cancelled`,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60, locale: "auto",
  });
  redirect(session.url!);
}

export async function billingPortalAction() {
  const viewer = await requireViewer("/premium");
  const stripe = getStripe();
  if (!stripe) redirect("/premium?error=payments_disabled");
  const customer = await customerFor(viewer.id);
  const portal = await stripe.billingPortal.sessions.create({ customer: customer.id, return_url: `${env.siteUrl}/premium` });
  redirect(portal.url);
}
