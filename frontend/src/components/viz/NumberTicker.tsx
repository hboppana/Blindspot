"use client";

import { useEffect, useRef } from "react";

// A figure that counts up once when it first scrolls into view: the data
// arriving. The pattern follows 21st.dev's "Number Ticker"; no motion library.
// The server renders the final value, so there is no layout shift and nothing
// to wait for; reduced motion keeps it static.
const format = (v: number, decimals: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export function NumberTicker({
  value,
  decimals = 0,
  suffix = "",
  className,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / 800);
          const eased = 1 - (1 - t) ** 3;
          el.textContent = format(value * eased, decimals) + suffix;
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, decimals, suffix]);

  return (
    <span ref={ref} className={`tabular-nums ${className ?? ""}`}>
      {format(value, decimals) + suffix}
    </span>
  );
}
