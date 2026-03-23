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
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-6">
          <header className="fade-in-up">
            <h1 className="page-title text-3xl font-black tracking-tight md:text-5xl">
              Bradzaz&apos; Rocket League
            </h1>
            <p className="muted mt-2 text-sm md:text-base">
              Pro-style league fixtures, standings, and gauntlet finals.
            </p>
          </header>
          <Nav />
          {children}
        </div>
      </body>
    </html>
  );
}
