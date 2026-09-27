import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

// shadcn/ui button, restyled to the road palette. Buttons are pills; boxes
// elsewhere keep the rounded-md corner, so a pill always means "press me".
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap transition-[background-color,color,transform] duration-150 outline-none select-none active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Lane-marking yellow with asphalt text: the one action a screen wants.
        default:
          "bg-accent text-[#1f2226] hover:bg-[#ffd633] disabled:bg-brand-soft disabled:text-muted disabled:opacity-100 disabled:ring-1 disabled:ring-line",
        outline: "border border-line bg-surface text-foreground hover:bg-brand-soft",
        ghost: "text-foreground hover:bg-brand-soft",
        // For use on the asphalt header.
        road: "text-white/70 hover:bg-white/10 hover:text-white aria-[current=page]:bg-white/10 aria-[current=page]:text-accent",
      },
      size: {
        sm: "h-8 px-3.5 text-sm",
        default: "h-10 px-5 text-sm",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
  );
}

export { Button, buttonVariants };
