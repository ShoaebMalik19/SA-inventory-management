"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Flashlight } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** Opens the phone/laptop camera and reads the barcode on the machine's sticker. */
export function ScanButton({ onScan, className, label = "Scan" }: { onScan: (text: string) => void; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex shrink-0 items-center gap-2 rounded-xl bg-ink px-3.5 text-sm font-semibold text-white transition hover:bg-brand-deep",
          className,
        )}
      >
        <Camera className="size-4" /> {label}
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Scan a barcode" side="center">
        {open && (
          <Scanner
            onResult={(t) => {
              setOpen(false);
              onScan(t);
            }}
          />
        )}
      </Sheet>
    </>
  );
}

function Scanner({ onResult }: { onResult: (t: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [torch, setTorch] = useState<null | ((on: boolean) => Promise<void>)>(null);
  const [lit, setLit] = useState(false);
  const done = useRef(false);
  const cb = useRef(onResult);
  useEffect(() => {
    cb.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let stop: (() => void) | undefined;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          video.current!,
          (result) => {
            if (result && !done.current) {
              done.current = true;
              navigator.vibrate?.(60);
              cb.current(result.getText().trim());
            }
          },
        );
        stop = () => controls.stop();
        if (controls.switchTorch) setTorch(() => controls.switchTorch!);
      } catch {
        setError("The camera couldn't start. Allow camera access in the browser, or type the serial number instead.");
      }
    })();
    return () => stop?.();
  }, []);

  return (
    <div className="p-5 pt-14">
      <p className="font-display text-xl font-bold">Point the camera at the barcode</p>
      <p className="mt-1 text-sm text-ink-2">It reads the serial sticker under the laptop or on our own label.</p>
      <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-2xl bg-ink">
        <video ref={video} className="size-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-tag shadow-[0_0_0_9999px_rgba(0,0,0,.35)]">
          <div className="absolute inset-x-0 top-1/2 h-0.5 animate-pulse bg-tag/80" />
        </div>
      </div>
      {torch && (
        <button
          type="button"
          onClick={async () => {
            await torch(!lit).catch(() => undefined);
            setLit(!lit);
          }}
          className={cn("mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border text-[15px] font-semibold", lit ? "border-tag bg-tag text-ink" : "border-line text-ink-2")}
        >
          <Flashlight className="size-5" /> {lit ? "Light on" : "Turn on the light"}
        </button>
      )}
      {error && <p className="mt-3 rounded-xl bg-st-repair-bg px-3.5 py-2.5 text-sm text-st-repair">{error}</p>}
    </div>
  );
}
