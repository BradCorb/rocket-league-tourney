import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { LeaderThemeSync } from "@/components/leader-theme-sync";
import { LiveSeasonFeed } from "@/components/live-season-feed";
import { getTournamentDataReadOnly } from "@/lib/data";
import { computeLeagueTable } from "@/lib/tournament";
import { getSession } from "@/lib/auth-session";
import { HeaderAuthControls } from "@/components/header-auth-controls";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { participants, fixtures } = await getTournamentDataReadOnly();
  const session = await getSession();
  const table = computeLeagueTable(
    participants,
    fixtures.filter((fixture) => fixture.phase === "LEAGUE"),
  );
  const leader = table[0];
  const leaderPrimary = leader?.primaryColor ?? "#24f2ff";
  const leaderSecondary = leader?.secondaryColor ?? leaderPrimary;
  const leaderMix = leaderPrimary.toLowerCase() === leaderSecondary.toLowerCase()
    ? leaderPrimary
    : leaderSecondary;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        className="min-h-full flex flex-col"
        style={
          {
            "--leader-primary": leaderPrimary,
            "--leader-secondary": leaderSecondary,
            "--brand-a": leaderPrimary,
            "--brand-b": leaderSecondary,
            "--brand-c": leaderMix,
          } as React.CSSProperties
        }
      >
        <LeaderThemeSync />
        <div className="rocket-grid-overlay" aria-hidden />
        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-6">
          <header className="site-header fade-in-up space-y-4">
            <div className="flex justify-start">
              <HeaderAuthControls
                isAuthenticated={Boolean(session)}
                displayName={session?.displayName}
              />
            </div>
            <div className="scorebug surface-card p-3">
              <LiveSeasonFeed />
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
          <Nav isAuthenticated={Boolean(session)} />
          <main className="page-main flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
