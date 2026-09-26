import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StreetSmart",
  description: "City audit of Gainesville intersections with repeat crashes",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="flex items-center gap-6 border-b print:hidden border-black/10 px-6 py-3 dark:border-white/15">
          <Link href="/" className="font-semibold">
            StreetSmart
          </Link>
          <nav className="flex gap-4 text-sm opacity-80">
            <Link href="/">City</Link>
            <Link href="/fix-list">Fix list</Link>
            <Link href="/backtest">Backtest</Link>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
