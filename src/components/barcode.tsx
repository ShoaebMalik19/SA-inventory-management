"use client";

import { useEffect, useRef } from "react";

/** A real, scannable Code 128 barcode of the serial number. */
export function Barcode({ value, height = 40, className }: { value: string; height?: number; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    let alive = true;
    import("jsbarcode").then(({ default: JsBarcode }) => {
      if (!alive || !ref.current) return;
      JsBarcode(ref.current, value, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height,
        width: 1.6,
        background: "transparent",
        lineColor: "#0f2a26",
      });
    });
    return () => {
      alive = false;
    };
  }, [value, height]);
  return <svg ref={ref} className={className} preserveAspectRatio="none" aria-label={`Barcode ${value}`} />;
}
