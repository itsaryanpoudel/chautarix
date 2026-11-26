import type { Messages } from "@/i18n/server";
/** Only the strings the client auth form needs (keeps the client bundle small). */
export const authDict = (t: Messages) => ({
  auth: t.auth as Record<string, string>, errors: t.errors as Record<string, string>,
  legal: { terms: t.footer.terms, privacy: t.footer.privacy, guidelines: t.footer.guidelines },
});
