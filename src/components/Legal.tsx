export function Legal({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="card prose-legal">
      <h1 className="text-2xl font-extrabold">{title}</h1>
      <p className="text-xs">Last updated: {updated}</p>
      <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">⚖️ DRAFT — items marked [REVIEW] must be checked by a Japanese lawyer / 行政書士 before launch. Compliance has not been independently certified. The English text prevails until reviewed translations are published.</p>
      {children}
    </article>
  );
}
