// Original Sanghu mark: two peaks (Himalaya + Fuji) joined by a coral footbridge ("sanghu" in Nepali).
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#1b2440" />
      <path d="M6 46 22 19l8 13 7-11 21 25z" fill="#fff" />
      <path d="M22 19l-4.6 7.8 2.8-1.2 1.8 1.6 1.9-1.6 2.6 1.4zM37 21l-3.6 5.6 2-.8 1.6 1.2 1.6-1.2 2.2 1z" fill="#c9d2ec" />
      <path d="M8 53c7-6.5 15.5-9.8 24-9.8S49 46.5 56 53" fill="none" stroke="#e9503f" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}
export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark />
      <span className="text-xl font-extrabold tracking-tight">sangh<span className="text-coral">u</span></span>
    </span>
  );
}
