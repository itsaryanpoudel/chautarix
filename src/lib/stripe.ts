import "server-only";
import Stripe from "stripe";
import { paymentsEnabled } from "@/lib/env";

let client: Stripe | null = null;
/** Returns null while payments are disabled, so the site can launch without Stripe. */
export function getStripe(): Stripe | null {
  if (!paymentsEnabled()) return null;
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY!, { appInfo: { name: "Sanghu" } });
  return client;
}
