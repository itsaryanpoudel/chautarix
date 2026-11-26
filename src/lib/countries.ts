// ISO 3166-1 alpha-2. Most common destinations for Nepalis first.
export const COMMON = ["JP", "NP", "AU", "KR", "US", "GB", "CA", "IN", "AE", "QA", "SA", "KW", "MY", "PT", "DE", "NZ"];
const ALL = "AD AE AF AG AI AL AM AO AR AT AU AW AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS XK YE ZA ZM ZW".split(" ");
export const COUNTRY_CODES = [...COMMON, ...ALL.filter((c) => !COMMON.includes(c))];
export const isCountry = (c: string | null | undefined) => !!c && COUNTRY_CODES.includes(c.toUpperCase());
export function flag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "🏳️";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
export function countryName(code: string | null | undefined, locale = "en"): string {
  if (!code) return "";
  try { return new Intl.DisplayNames([locale], { type: "region" }).of(code.toUpperCase()) ?? code; } catch { return code; }
}
