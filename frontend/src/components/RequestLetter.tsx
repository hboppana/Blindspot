"use client";

import { useState } from "react";
import { Check, Copy, EnvelopeSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// A draft request to the city for one fix, written by Snowflake Cortex from the
// Fix Plan's figures. Closed, it's one small button, so the page stays as
// short as it was; open, it's the letter and a Copy button.
export function RequestLetter({
  subject,
  body,
  about,
  source,
}: {
  subject: string;
  body: string;
  about: string; // what the letter asks for, for the button's accessible name
  source: string; // "snowflake-cortex-<model>"
}) {
  const [copied, setCopied] = useState(false);
  const model = source.replace(/^snowflake-cortex-/, "");

  async function copy() {
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Draft a request to the city: ${about}`}>
          <EnvelopeSimple weight="bold" aria-hidden />
          Draft Request
        </Button>
      </DialogTrigger>
      <DialogContent>
        <div className="border-b border-line px-6 pt-5 pb-4 pr-14">
          <DialogDescription>Draft request to the City of Gainesville</DialogDescription>
          <DialogTitle className="mt-1">{subject}</DialogTitle>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <p className="text-[15px] leading-relaxed whitespace-pre-line">{body}</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-brand-soft/60 px-6 py-4">
          <p className="text-xs text-muted">
            Written by Snowflake Cortex ({model}) from the figures on this page. Add your name before sending.
          </p>
          <Button onClick={copy} size="sm">
            {copied ? <Check weight="bold" aria-hidden /> : <Copy weight="bold" aria-hidden />}
            <span aria-live="polite">{copied ? "Copied" : "Copy Letter"}</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
