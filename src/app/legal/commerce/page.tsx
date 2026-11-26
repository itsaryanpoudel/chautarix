import { Legal } from "@/components/Legal";
export const metadata = { title: "特定商取引法に基づく表記" };
const rows: [string, string][] = [
  ["販売事業者 / Seller", "[REVIEW: 氏名または法人名]"], ["運営統括責任者 / Manager", "[REVIEW]"],
  ["所在地 / Address", "[REVIEW: 住所（個人の場合、請求があれば遅滞なく開示する旨の記載可否を専門家に確認）]"],
  ["電話番号 / Phone", "[REVIEW]"], ["メールアドレス / Email", "[REVIEW]"],
  ["販売価格 / Price", "月額 ¥200（税込） / ¥200 per month incl. tax"], ["商品代金以外の必要料金", "インターネット接続料金・通信料金"],
  ["支払方法 / Payment", "クレジットカード（Stripe）"], ["支払時期 / Billing", "申込時に初回決済、以降毎月同日に自動更新・自動決済"],
  ["提供時期 / Delivery", "決済完了の確認後、直ちに"], ["解約 / Cancellation", "プレミアムページからいつでも解約可。次回更新日以降は請求されません"],
  ["返品・返金 / Refunds", "デジタルサービスの性質上、法令で定める場合を除き返金不可 [REVIEW]"], ["動作環境", "最新の主要ブラウザ（iOS Safari, Android Chrome ほか）"],
];
export default function Page() {
  return (<Legal title="特定商取引法に基づく表記 (Commercial Disclosure)" updated="2026-11-26">
    <dl className="mt-4 divide-y divide-line text-sm">{rows.map(([k, v]) => <div key={k} className="grid gap-1 py-2 sm:grid-cols-3"><dt className="font-semibold">{k}</dt><dd className="sm:col-span-2">{v}</dd></div>)}</dl>
  </Legal>);
}
