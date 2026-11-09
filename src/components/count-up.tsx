"use client";

import { useEffect, useRef } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";

/** Number that rolls up once when it appears (React Bits–style CountUp). */
export function CountUp({ to, format = (n) => Math.round(n).toLocaleString("en-IN"), duration = 1.1 }: {
  to: number;
  format?: (n: number) => string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce || !inView) {
      el.textContent = format(to);
      return;
    }
    const controls = animate(0, to, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => (el.textContent = format(v)),
    });
    return () => controls.stop();
  }, [to, inView, reduce, duration, format]);

  return <span ref={ref}>{format(to)}</span>;
}
