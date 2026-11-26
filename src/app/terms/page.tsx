import { Legal } from "@/components/Legal";
export const metadata = { title: "Terms of Service" };
export default function Page() {
  return (<Legal title="Terms of Service (利用規約)" updated="2026-11-26">
    <h2>1. Agreement</h2><p>By creating an account you agree to these Terms, the Privacy Policy and the Community Guidelines. You must be 18+ or have a parent/guardian’s consent [REVIEW minimum age].</p>
    <h2>2. Accounts</h2><p>One person, one account. Keep your password safe. Usernames must be appropriate; impersonation is not allowed. We may reclaim usernames that violate the rules.</p>
    <h2>3. Your content</h2><p>You keep ownership of your posts. You grant the operator a non-exclusive, royalty-free licence to host and display them on the service. Information shared by members (e.g. about visas) is not professional legal advice — check with official sources (出入国在留管理庁) or a licensed professional.</p>
    <h2>4. Prohibited conduct</h2><p>Anything that breaks the Community Guidelines or the law, attempts to bypass filters or rate limits, automated posting, scraping, or interfering with security.</p>
    <h2>5. Moderation</h2><p>We may remove content, suspend or ban accounts that break these Terms. Important actions are logged with a reason.</p>
    <h2>6. Premium subscription</h2><p>¥200/month (tax included), billed monthly via Stripe, renews automatically until cancelled. Cancel anytime on the Premium page; access continues until the end of the paid period. If a renewal fails, Premium continues for a 7-day grace period. When Premium ends, your previous username is restored and your short username is held for you for 30 days, then released. Refunds only where required by law [REVIEW].</p>
    <h2>7. Disclaimer & liability</h2><p>The service is provided “as is”. Liability is limited to the extent permitted by the Consumer Contract Act; nothing limits liability for intent or gross negligence [REVIEW].</p>
    <h2>8. Changes, law & court</h2><p>We will announce material changes in advance. Japanese law applies; exclusive jurisdiction: [REVIEW: district court].</p>
  </Legal>);
}
