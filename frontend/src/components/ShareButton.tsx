"use client";

import { useState } from "react";
import { Check, LinkSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

// Shares a page of this site: the phone's share sheet where there is one,
// otherwise the link goes to the clipboard.
export function ShareButton({ path, title, label = "Share the Link" }: { path: string; title: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ title, url }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="outline" onClick={share}>
      {copied ? <Check weight="bold" aria-hidden /> : <LinkSimple weight="bold" aria-hidden />}
      <span aria-live="polite">{copied ? "Link Copied" : label}</span>
    </Button>
  );
}
