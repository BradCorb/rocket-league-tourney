import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bradzaz' Rocket League",
  description: "League fixtures, table, and gauntlet bracket",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="rocket-grid-overlay" aria-hidden />
        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-6">
          <header className="site-header fade-in-up space-y-4">
            <div className="scorebug surface-card p-3">
              <p className="scorebug__line">
                LIVE SEASON FEED · BRADZAZ ROCKET LEAGUE · COMPETITIVE 1V1
              </p>
            </div>
            <div>
              <h1 className="page-title text-3xl font-black tracking-tight md:text-5xl">
                Bradzaz&apos; Rocket League
              </h1>
              <p className="muted mt-2 max-w-2xl text-sm leading-relaxed md:text-base">
                Match centre coverage, league analytics, and gauntlet pressure - all in one arena.
              </p>
              <div className="site-header__accent mt-4 h-1 max-w-xs rounded-full" aria-hidden />
            </div>
          </header>
          <Nav />
          <main className="page-main flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
