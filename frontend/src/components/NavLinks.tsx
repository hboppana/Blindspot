"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { MapTrifold } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

// The map, then the three signals in traffic-light order. Each list carries
// its lamp; below extra-large screens the labels shorten to fit one line.
const LINKS = [
  {
    href: "/map",
    label: "City Map",
    short: "Map",
    lamp: null,
    match: (p: string) => p.startsWith("/map") || p.startsWith("/intersections"),
  },
  {
    href: "/red-list",
    label: "Red List",
    short: "Red",
    lamp: "#ff4d5e",
    match: (p: string) => p.startsWith("/red-list") || p.startsWith("/backtest"),
  },
  {
    href: "/watch-list",
    label: "Watch List",
    short: "Watch",
    lamp: "#f6c700",
    match: (p: string) => p.startsWith("/watch-list"),
  },
  {
    href: "/road-map",
    label: "Road Map",
    short: "Plan",
    lamp: "#2fd08f",
    match: (p: string) => p.startsWith("/road-map"),
  },
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
    <nav ref={nav} className="ml-auto flex gap-0.5 whitespace-nowrap sm:gap-1 lg:gap-2">
      {LINKS.map(({ href, label, short, lamp, match }) => (
        <Button
          key={href}
          asChild
          variant="road"
          className="h-10 gap-1.5 px-2.5 text-sm sm:h-12 md:px-4 md:text-base lg:gap-2 lg:px-5 lg:text-lg"
        >
          <Link href={href} aria-current={match(pathname) ? "page" : undefined} aria-label={label}>
            {lamp ? (
              <span
                aria-hidden
                className="size-2.5 rounded-full lg:size-3"
                style={{ background: lamp, boxShadow: `0 0 8px ${lamp}99` }}
              />
            ) : (
              <MapTrifold weight="bold" aria-hidden className="hidden sm:block" />
            )}
            <span className="xl:hidden">{short}</span>
            <span className="hidden xl:inline">{label}</span>
          </Link>
        </Button>
      ))}
    </nav>
  );
}
