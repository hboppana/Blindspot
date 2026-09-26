import type { Metadata } from "next";
import Link from "next/link";
import { Geist_Mono, Overpass } from "next/font/google";
import "./globals.css";
import { NavLinks } from "@/components/NavLinks";

// Overpass descends from Highway Gothic, the lettering on US road signs.
const overpass = Overpass({
  variable: "--font-overpass",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
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
      className={`${overpass.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="print:hidden">
          <div className="flex h-11 items-center gap-5 bg-brand px-4 text-white sm:gap-8 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5 text-base font-extrabold tracking-tight">
              {/* The cross-road warning sign (MUTCD W2-1). */}
              <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6">
                <rect x="4.5" y="4.5" width="15" height="15" rx="2" transform="rotate(45 12 12)" fill="var(--accent)" />
                <path d="M10.9 6.5h2.2v4.4h4.4v2.2h-4.4v4.4h-2.2v-4.4H6.5v-2.2h4.4z" fill="var(--brand)" />
              </svg>
              StreetSmart
              <span className="hidden font-normal text-white/55 sm:inline">Gainesville</span>
            </Link>
            <NavLinks />
          </div>
          <div className="lane-line" aria-hidden />
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
