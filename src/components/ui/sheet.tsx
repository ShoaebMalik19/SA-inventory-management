"use client";

import * as React from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Side panel (desktop) / bottom sheet (phone). */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  side = "right",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  side?: "right" | "center";
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/35 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_.18s_ease-out]" />
        <Dialog.Content
          className={cn(
            "fixed z-50 flex flex-col bg-surface shadow-[0_24px_80px_-20px_rgba(15,42,38,.45)] outline-none",
            side === "right"
              ? "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[22px] data-[state=open]:animate-[sheet-up_.26s_cubic-bezier(.2,.8,.2,1)] sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[460px] sm:rounded-none sm:rounded-l-[22px] sm:data-[state=open]:animate-[sheet-left_.26s_cubic-bezier(.2,.8,.2,1)]"
              : "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[22px] data-[state=open]:animate-[sheet-up_.26s_cubic-bezier(.2,.8,.2,1)] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[520px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[22px] sm:data-[state=open]:animate-[fade-in_.18s_ease-out]",
            className,
          )}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          {description && <Dialog.Description className="sr-only">{description}</Dialog.Description>}
          <Dialog.Close className="absolute right-4 top-4 z-10 grid size-9 place-items-center rounded-full bg-mist text-ink-2 transition hover:bg-line hover:text-ink">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </Dialog.Close>
          <div className="overflow-y-auto overscroll-contain">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
