// Add a language: create messages/<code>.json (missing keys fall back to English) and list it here.
export const locales = ["en", "ja", "ne"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const localeNames: Record<Locale, string> = { en: "English", ja: "日本語", ne: "नेपाली" };
export const isLocale = (v: unknown): v is Locale => locales.includes(v as Locale);
