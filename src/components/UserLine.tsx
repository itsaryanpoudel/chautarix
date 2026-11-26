import Link from "next/link";
import { countryName, flag } from "@/lib/countries";
import { tierFor } from "@/lib/levels";
import type { Messages } from "@/i18n/server";

export function LevelBadge({ level, t, big = false }: { level: number; t: Messages; big?: boolean }) {
  const tier = tierFor(level);
  return (
    <span title={`${t.level.tiers[tier.key]} · ${t.level.level} ${level}`}
      className={`inline-flex items-center rounded-full font-extrabold tracking-wider ${big ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[10px]"} ${tier.className}`}>
      {tier.key === "legend" ? "★ " : ""}{t.level.level} {level}
    </span>
  );
}

export function UserLine(props: { username: string; country: string; level: number; isPremium: boolean; locale: string; t: Messages }) {
  const { username, country, level, isPremium, locale, t } = props;
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
      <span role="img" aria-label={countryName(country, locale)} title={countryName(country, locale)}>{flag(country)}</span>
      <Link href={`/u/${username}`} className="truncate font-semibold hover:underline">@{username}</Link>
      {isPremium && <span title={t.profile.premium} className="rounded-full bg-coral-soft px-1.5 text-[11px] font-bold text-coral">◆</span>}
      <LevelBadge level={level} t={t} />
    </span>
  );
}
