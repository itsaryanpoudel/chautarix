import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import en from "./messages/en.json";
import ja from "./messages/ja.json";
import ne from "./messages/ne.json";
import { defaultLocale, isLocale, type Locale } from "./config";

export type Messages = typeof en;
type Deep = { [k: string]: string | Deep };
const dictionaries: Record<Locale, Deep> = { en, ja, ne };

function merge(base: Deep, over: Deep): Deep {
  const out: Deep = { ...base };
  for (const [k, v] of Object.entries(over ?? {})) {
    out[k] = typeof v === "object" && typeof base[k] === "object" ? merge(base[k] as Deep, v) : v;
  }
  return out;
}

export const getI18n = cache(async () => {
  const value = (await cookies()).get("lang")?.value;
  const locale: Locale = isLocale(value) ? value : defaultLocale;
  return { locale, t: merge(en, dictionaries[locale]) as Messages };
});

export function errorText(t: Messages, code?: string | null) {
  const map = t.errors as Record<string, string>;
  return (code && map[code]) || map.generic;
}
