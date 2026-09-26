"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const LINKS = [
  { href: "/", label: "City", match: (p: string) => p === "/" || p.startsWith("/intersections") },
  { href: "/fix-list", label: "Fix list", match: (p: string) => p.startsWith("/fix-list") },
  { href: "/backtest", label: "Backtest", match: (p: string) => p.startsWith("/backtest") },
];

export function NavLinks() {
  const pathname = usePathname();
  const nav = useRef<HTMLElement>(null);

  // After a page change (including the browser's Back button) the link that
  // was clicked keeps focus and looks highlighted. Release it so only the
  // current page stands out.
  useEffect(() => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && nav.current?.contains(focused)) focused.blur();
  }, [pathname]);

  return (
    <nav ref={nav} className="flex gap-3 text-sm whitespace-nowrap sm:gap-5">
      {LINKS.map((l) => {
        const active = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`px-1 py-1.5 font-semibold transition-colors ${
              active ? "text-accent" : "text-white/60 hover:text-white"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
