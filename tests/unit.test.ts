import { describe, expect, it } from "vitest";
import { levelForPosts, levelProgress, postsForLevel, tierFor } from "../src/lib/levels";
import { flag, isCountry } from "../src/lib/countries";
import en from "../src/i18n/messages/en.json";
import ja from "../src/i18n/messages/ja.json";
import ne from "../src/i18n/messages/ne.json";

describe("levels", () => {
  it("matches the specification table", () => {
    const table: [number, number][] = [[0, 1], [5, 2], [10, 3], [15, 4], [20, 5], [25, 6], [30, 7], [35, 8], [40, 9], [45, 10], [50, 11], [60, 12], [70, 13], [80, 14], [90, 15]];
    for (const [posts, level] of table) { expect(levelForPosts(posts)).toBe(level); expect(postsForLevel(level)).toBe(posts); }
    expect(levelForPosts(49)).toBe(10); expect(levelForPosts(59)).toBe(11); expect(levelForPosts(1000)).toBe(106);
  });
  it("progress example: level 8, 38/40, 95%, 2 to go", () => {
    expect(levelProgress(38)).toMatchObject({ level: 8, next: 40, percent: 95, remaining: 2 });
  });
  it("tiers", () => {
    expect(tierFor(10).key).toBe("beginner"); expect(tierFor(11).key).toBe("active"); expect(tierFor(21).key).toBe("trusted");
    expect(tierFor(31).key).toBe("expert"); expect(tierFor(41).key).toBe("legend");
  });
});
describe("flags", () => {
  it("renders emoji flags from ISO codes", () => { expect(flag("JP")).toBe("🇯🇵"); expect(flag("np")).toBe("🇳🇵"); expect(isCountry("AU")).toBe(true); expect(isCountry("XX")).toBe(false); });
});
describe("i18n", () => {
  const keys = (o: object, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
  it("translations only use keys that exist in English (missing keys fall back)", () => {
    const base = new Set(keys(en));
    for (const d of [ja, ne]) expect(keys(d).filter((k) => !base.has(k))).toEqual([]);
  });
});
import { safePath } from "../src/lib/format";
describe("safePath (open-redirect protection)", () => {
  it("allows same-site paths only", () => {
    expect(safePath("/reset-password")).toBe("/reset-password");
    expect(safePath("//evil.com")).toBe("/feed"); expect(safePath("/\\evil.com")).toBe("/feed");
    expect(safePath("https://evil.com")).toBe("/feed"); expect(safePath(null)).toBe("/feed");
  });
});
