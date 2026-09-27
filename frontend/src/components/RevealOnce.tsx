"use client";

import { useEffect } from "react";

// Plays each .reveal / .reveal-grow / .reveal-grow-y animation once: the
// element gets `.is-in` the first time it scrolls into view and is then left
// alone, so scrolling back up never rewinds a bar. New elements (a client-side
// page change, streamed content) are picked up as they arrive.
const SELECTOR = ".reveal, .reveal-grow, .reveal-grow-y";

export function RevealOnce() {
  useEffect(() => {
    const root = document.documentElement;
    // Reduced motion, or no observer: show everything as it is.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      root.classList.remove("reveal-ready");
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      // Threshold 0 so a bar still at scale 0 (no area yet) counts as soon as
      // it touches the viewport; the bottom margin waits until it's properly in.
      { threshold: 0, rootMargin: "0px 0px -8% 0px" },
    );
    const watch = (scope: ParentNode) =>
      scope.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
        if (!el.classList.contains("is-in")) io.observe(el);
      });

    watch(document);
    const mo = new MutationObserver((records) => {
      for (const r of records)
        r.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (n.matches(SELECTOR) && !n.classList.contains("is-in")) io.observe(n);
          watch(n);
        });
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);

  return null;
}
