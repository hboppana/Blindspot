import type { Metadata } from "next";
import Link from "next/link";
import { Geist_Mono, Overpass } from "next/font/google";
import { CarProfile } from "@phosphor-icons/react/ssr";
import "./globals.css";
import { NavLinks } from "@/components/NavLinks";
import { RevealOnce } from "@/components/RevealOnce";

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
      // The script below adds a class before React loads.
      suppressHydrationWarning
    >
      <head>
        {/* Before first paint: hold scroll-in elements back so RevealOnce can play
            them once, without a flash. Skipped for reduced motion, and without
            JavaScript it never runs, so everything shows. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'if(!matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.classList.add("reveal-ready")',
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <RevealOnce />
        <header className="site-header print:hidden">
          <div className="flex h-[var(--header-h)] items-center gap-3 bg-brand px-4 text-white sm:gap-8 sm:px-8">
            <Link href="/" className="flex shrink-0 items-center gap-2.5 text-xl font-extrabold tracking-tight sm:gap-3.5 sm:text-2xl lg:text-3xl">
              {/* The cross-road warning sign (MUTCD W2-1). */}
              <svg aria-hidden viewBox="0 0 24 24" className="size-8 sm:size-10">
                <rect x="4.5" y="4.5" width="15" height="15" rx="2" transform="rotate(45 12 12)" fill="var(--accent)" />
                <path d="M10.9 6.5h2.2v4.4h4.4v2.2h-4.4v4.4h-2.2v-4.4H6.5v-2.2h4.4z" fill="var(--brand)" />
              </svg>
              {/* Trimmed to the capital letters, so centring lines the letters
                  (not Overpass's roomy line box) up with the sign. */}
              <span className="block leading-none [text-box:trim-both_cap_alphabetic] max-[430px]:sr-only">
                StreetSmart
                <span className="ml-3 hidden font-normal text-white/55 xl:inline">Gainesville</span>
              </span>
            </Link>
            <NavLinks />
          </div>
        </header>
        {/* The road under the header. It sticks to the top of the screen and a
            car drives along it as the page scrolls: a scroll-progress bar. */}
        <div className="lane-road print:hidden" aria-hidden>
          <CarProfile weight="fill" className="lane-car" />
        </div>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
