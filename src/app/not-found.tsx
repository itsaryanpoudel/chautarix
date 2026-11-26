import Link from "next/link";
export default function NotFound() {
  return (<div className="card text-center"><h1 className="text-xl font-bold">404</h1><p className="mt-2 text-ink-soft">This page doesn’t exist or was removed.</p>
    <Link href="/feed" className="btn-primary mt-4">Feed</Link></div>);
}
