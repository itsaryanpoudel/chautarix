import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header, Footer } from "@/components/Chrome";
import { getI18n } from "@/i18n/server";

export const metadata: Metadata = {
  title: { default: "Sanghu — Nepalis in Japan, helping each other", template: "%s · Sanghu" },
  description: "A simple, safe, text-first community for Nepali people living in Japan: visas, jobs, schools, housing and daily life.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1b2440" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale } = await getI18n();
  return (
    <html lang={locale}>
      <body className="min-h-dvh antialiased">
        <Header />
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
