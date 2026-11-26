export const env = {
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};
export const isSupabaseConfigured = () => Boolean(env.supabaseUrl && env.supabaseAnonKey);
// Payments stay OFF until explicitly enabled AND all Stripe secrets exist (server-side only).
export const paymentsEnabled = () =>
  process.env.PAYMENTS_ENABLED === "true" &&
  Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_PRICE_ID);
