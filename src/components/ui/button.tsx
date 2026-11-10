import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-[background,color,box-shadow,transform] active:translate-y-px disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand text-white hover:bg-brand-deep shadow-[inset_0_-2px_0_rgba(0,0,0,.18)]",
        tag: "bg-tag text-ink hover:brightness-95 shadow-[inset_0_-2px_0_rgba(0,0,0,.12)]",
        outline: "border border-line bg-surface text-ink hover:border-ink-3 hover:bg-mist",
        ghost: "text-ink-2 hover:bg-line-soft hover:text-ink",
        danger: "bg-st-scrap text-white hover:brightness-110",
      },
      size: {
        sm: "h-10 rounded-lg px-3.5 text-[13.5px] sm:h-8 sm:px-3 sm:text-[13px]",
        md: "h-10 rounded-[11px] px-4 text-sm",
        lg: "h-12 rounded-xl px-5 text-[15px]",
        icon: "size-11 rounded-lg sm:size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
