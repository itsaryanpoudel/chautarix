import { Legal } from "@/components/Legal";
export const metadata = { title: "Privacy Policy" };
export default function Page() {
  return (<Legal title="Privacy Policy (個人情報保護方針)" updated="2026-11-26">
    <p>Operator: [REVIEW: legal name, address, contact email]. We handle personal information in line with Japan’s Act on the Protection of Personal Information (APPI).</p>
    <h2>What we collect</h2><ul><li>Account: email address and password hash (stored by our auth provider, never shown publicly).</li><li>Profile: username, country of residence, and optional age, nationality, city and bio — you choose which optional items are public.</li><li>Content you post, reports you file, moderation and security logs (e.g. filter events, rate-limit data).</li><li>Payments: handled by Stripe; we never receive or store card numbers. We keep subscription status and invoice records.</li></ul>
    <h2>Why</h2><p>To run the service, keep the community safe (moderation, spam and abuse prevention), process subscriptions, meet legal obligations and answer enquiries. No advertising profiles, no sale of data.</p>
    <h2>Service providers & overseas transfer</h2><p>Supabase (database/auth), Vercel (hosting), Stripe (payments) and our email provider may process data on servers outside Japan (e.g. the United States, Singapore, EU). [REVIEW: APPI Art. 28 information on the countries, their data-protection systems and the providers’ safeguards.]</p>
    <h2>Retention</h2><ul><li>Deleted posts/replies: text erased immediately; a non-readable fingerprint is kept to stop duplicate spam.</li><li>Account deletion (Settings → Delete account): profile, posts, replies and private details are deleted immediately; moderation records are kept without your identity; payment records are kept as required by Japanese tax law (up to 7 years) [REVIEW].</li><li>Backups roll off within the provider’s backup window.</li></ul>
    <h2>Your rights</h2><p>You can view and edit your profile at any time and request disclosure, correction, suspension of use or deletion of your personal information by contacting us [REVIEW: contact + identity verification procedure]. Minors under 18 need guardian consent.</p>
    <h2>Security</h2><p>Encrypted connections, row-level database security, least-privilege access, audit logs for administrative actions. If a breach likely harms you we will notify you and the Personal Information Protection Commission as required.</p>
  </Legal>);
}
