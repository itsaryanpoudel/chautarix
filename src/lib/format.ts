/** Only same-site paths like "/feed" (blocks "//evil.com" and "/\\evil.com" open redirects). */
export const safePath = (p: string | null | undefined, fallback = "/feed") =>
  p && /^\/(?![/\\])[^\s]*$/.test(p) ? p : fallback;
export const fmt = (s: string, vars: Record<string, string | number> = {}) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
export function formatDateTime(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "ne" ? "ne-NP" : locale, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo",
  }).format(new Date(iso));
}
export const formatDate = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale === "ne" ? "ne-NP" : locale, { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tokyo" }).format(new Date(iso));
