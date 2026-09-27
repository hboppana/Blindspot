"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

// shadcn/ui dialog on Radix, restyled to the road palette: an asphalt-dimmed
// backdrop and a surface card with the site's corner radius. Radix handles
// focus trapping, Escape and scroll locking.

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#0f1113]/70 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_150ms_ease-out]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[min(88dvh,760px)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-surface text-foreground shadow-2xl outline-none data-[state=open]:animate-[dialog-in_180ms_cubic-bezier(0.16,1,0.3,1)]",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute top-3.5 right-3.5 grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-brand-soft hover:text-foreground"
          aria-label="Close"
        >
          <X weight="bold" className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-lg leading-snug font-extrabold", className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-sm text-muted", className)} {...props} />;
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger };
