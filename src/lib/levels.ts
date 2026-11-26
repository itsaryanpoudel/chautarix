// Post-based levels: +5 valid posts per level up to Level 11 (50 posts), then +10 per level.
export function levelForPosts(posts: number): number {
  const n = Math.max(0, Math.floor(posts));
  return n < 50 ? Math.floor(n / 5) + 1 : 11 + Math.floor((n - 50) / 10);
}
export function postsForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return l <= 11 ? (l - 1) * 5 : 50 + (l - 11) * 10;
}
/** "cumulative" follows the spec example (38 / 40 = 95%); "level" shows progress inside the current level. */
export const PROGRESS_MODE: "cumulative" | "level" = "cumulative";
export function levelProgress(validPosts: number) {
  const level = levelForPosts(validPosts);
  const start = postsForLevel(level), next = postsForLevel(level + 1);
  const percent = PROGRESS_MODE === "cumulative"
    ? Math.floor((validPosts * 100) / next)
    : Math.floor(((validPosts - start) * 100) / (next - start));
  return { level, validPosts, start, next, remaining: next - validPosts, percent };
}
export type TierKey = "beginner" | "active" | "trusted" | "expert" | "legend";
export const TIERS: { key: TierKey; min: number; className: string }[] = [
  { key: "legend",   min: 41, className: "bg-linear-to-r from-amber-300 to-orange-400 text-stone-900 ring-1 ring-amber-500" },
  { key: "expert",   min: 31, className: "bg-linear-to-r from-violet-600 to-fuchsia-600 text-white" },
  { key: "trusted",  min: 21, className: "bg-ink text-white" },
  { key: "active",   min: 11, className: "bg-teal-50 text-teal-800 ring-1 ring-teal-300" },
  { key: "beginner", min: 1,  className: "bg-stone-100 text-stone-700 ring-1 ring-stone-300" },
];
export const tierFor = (level: number) => TIERS.find((t) => level >= t.min) ?? TIERS[TIERS.length - 1];
