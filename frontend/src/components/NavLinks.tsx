"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ListNumbers, MapTrifold, TrendUp } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

const LINKS = [
  {
    href: "/map",
    label: "City Map",
    Icon: MapTrifold,
    match: (p: string) => p.startsWith("/map") || p.startsWith("/intersections"),
  },
  {
    href: "/red-list",
    label: "Red List",
    Icon: ListNumbers,
    match: (p: string) => p.startsWith("/red-list") || p.startsWith("/backtest"),
  },
  {
    href: "/watch-list",
    label: "Watch List",
    Icon: TrendUp,
    match: (p: string) => p.startsWith("/watch-list"),
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
    <nav ref={nav} className="ml-auto flex gap-0.5 whitespace-nowrap sm:gap-2">
      {LINKS.map(({ href, label, Icon, match }) => (
        <Button key={href} asChild variant="road" className="h-10 px-2.5 text-sm sm:h-12 sm:px-5 sm:text-lg">
          <Link href={href} aria-current={match(pathname) ? "page" : undefined}>
            <Icon weight="bold" aria-hidden className="hidden sm:block" />
            {label}
          </Link>
        </Button>
      ))}
    </nav>
  );
}
