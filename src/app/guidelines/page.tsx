import { Legal } from "@/components/Legal";
export const metadata = { title: "Community Guidelines" };
export default function Page() {
  return (<Legal title="Community Guidelines" updated="2026-11-26">
    <p>Sanghu is a place for Nepalis in Japan to ask, share and help. Disagreement is welcome; disrespect is not.</p>
    <h2>Do</h2><ul><li>Ask honest questions about visas, jobs, schools, housing, family and daily life.</li><li>Share experience, not rumours. Say when you are unsure.</li><li>Be kind to newcomers. Everyone was new once.</li></ul>
    <h2>Don’t</h2><ul><li>Abusive language, harassment, threats, hate speech or discrimination (including caste, ethnicity, religion, gender, sexuality, disability or nationality).</li>
      <li>Scams, “guaranteed visa” offers, illegal jobs (闇バイト), selling bank accounts or residence cards, or other illegal activity.</li><li>Spam, repeated or copy-pasted posts, or posting other people’s personal information.</li></ul>
    <h2>How filtering works</h2><p>Text is checked automatically in English, Japanese, Nepali and Romanized Nepali. Mild language shows a warning first; clearly prohibited language is blocked; unclear content waits for a human moderator. One bad word never bans anyone automatically, but repeated attempts to bypass the filter pause posting for one hour and alert moderators.</p>
    <h2>Levels</h2><p>Levels come from original, published posts (Level 2 at 5 posts … Level 11 at 50, then +10 posts per level). Comments, duplicates, very short posts and removed posts do not count; at most 10 posts per day count. Levels you earn stay even if you delete old posts; posts removed by moderators are subtracted.</p>
    <h2>Reports & moderation</h2><p>Use “Report” on any post, reply or profile. Moderators record a reason for every action. Possible outcomes: no action, removal, temporary suspension or (by admins) a ban. Contact the operator to appeal [REVIEW: appeal contact].</p>
  </Legal>);
}
