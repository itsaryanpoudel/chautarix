import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe -> Sanghu. Signature-verified, idempotent; premium is granted ONLY from Stripe-confirmed state.
export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) return new Response("payments disabled", { status: 503 });
  const signature = req.headers.get("stripe-signature");
  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature ?? "", process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }
  const admin = createAdminClient();
  const { error: seen } = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
  if (seen) return seen.code === "23505" ? Response.json({ received: true, duplicate: true }) : new Response("db error", { status: 500 });

  const userForCustomer = async (customer: string, hint?: string | null) => {
    if (hint) return hint;
    const { data } = await admin.from("subscriptions").select("user_id").eq("stripe_customer_id", customer).maybeSingle();
    return (data?.user_id as string | undefined) ?? null;
  };
  const syncSubscription = async (subscriptionId: string, hint?: string | null) => {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);      // always read the latest state (events can arrive out of order)
    const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const userId = await userForCustomer(customer, sub.metadata?.user_id || hint);
    if (!userId) throw new Error(`no user for customer ${customer}`);
    const item = sub.items.data[0];
    const { error } = await admin.rpc("billing_apply_subscription", {
      p_user_id: userId, p_customer: customer, p_subscription: sub.id, p_status: sub.status, p_price: item?.price.id ?? null,
      p_period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
      p_cancel_at_period_end: sub.cancel_at_period_end,
    });
    if (error) throw error;
  };

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        if (s.mode === "subscription" && s.subscription)
          await syncSubscription(typeof s.subscription === "string" ? s.subscription : s.subscription.id, s.client_reference_id);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        await syncSubscription(event.data.object.id);
        break;
      case "invoice.paid":
      case "invoice.payment_failed": {
        const inv = event.data.object;
        const customer = typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? "";
        const userId = await userForCustomer(customer, inv.parent?.subscription_details?.metadata?.user_id);
        const { error } = await admin.rpc("billing_record_payment", {
          p_user_id: userId, p_invoice: inv.id, p_amount: event.type === "invoice.paid" ? inv.amount_paid : inv.amount_due,
          p_currency: inv.currency, p_status: event.type === "invoice.paid" ? "paid" : "failed",
          p_url: inv.hosted_invoice_url ?? null, p_period_end: new Date(inv.period_end * 1000).toISOString(),
        });
        if (error) throw error;
        const subRef = inv.parent?.subscription_details?.subscription;
        if (subRef) await syncSubscription(typeof subRef === "string" ? subRef : subRef.id);
        break;
      }
    }
  } catch (e) {
    await admin.from("stripe_events").delete().eq("id", event.id);       // let Stripe retry
    console.error("stripe webhook failed", event.type, e);
    return new Response("handler error", { status: 500 });
  }
  return Response.json({ received: true });
}
