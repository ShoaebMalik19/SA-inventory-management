import { cn } from "@/lib/utils";
import { STAGES, type Grade, type Stage } from "@/lib/data/types";

export const STAGE_STYLE: Record<Stage, { text: string; bg: string; dot: string; bar: string }> = {
  checking: { text: "text-st-checking", bg: "bg-st-checking-bg", dot: "bg-st-checking", bar: "bg-[#e3b45c]" },
  repair: { text: "text-st-repair", bg: "bg-st-repair-bg", dot: "bg-st-repair", bar: "bg-[#e9845a]" },
  ready: { text: "text-st-ready", bg: "bg-st-ready-bg", dot: "bg-st-ready", bar: "bg-[#2f9e5e]" },
  booked: { text: "text-st-booked", bg: "bg-st-booked-bg", dot: "bg-tag", bar: "bg-tag" },
  sold: { text: "text-st-sold", bg: "bg-st-sold-bg", dot: "bg-st-sold", bar: "bg-[#94a3b8]" },
  scrap: { text: "text-st-scrap", bg: "bg-st-scrap-bg", dot: "bg-st-scrap", bar: "bg-[#c2566f]" },
};

export function StagePill({ stage, className }: { stage: Stage; className?: string }) {
  const s = STAGE_STYLE[stage];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-semibold",
        s.bg,
        s.text,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {STAGES[stage].label}
    </span>
  );
}

const GRADE_STYLE: Record<Grade, string> = {
  A: "bg-brand text-white",
  B: "bg-brand-soft text-brand-deep",
  C: "bg-line text-ink-2",
};

export const GRADE_MEANING: Record<Grade, string> = {
  A: "Like new — no visible marks",
  B: "Light marks, works perfectly",
  C: "Visible wear, works perfectly",
};

export function GradeBadge({ grade, size = "sm" }: { grade: Grade | null; size?: "sm" | "lg" }) {
  if (!grade)
    return (
      <span className={cn("inline-grid place-items-center rounded-lg border border-dashed border-line text-ink-3", size === "lg" ? "size-14 text-xl" : "size-7 text-xs")}>
        –
      </span>
    );
  return (
    <span
      title={`Grade ${grade}: ${GRADE_MEANING[grade]}`}
      className={cn(
        "font-display inline-grid place-items-center rounded-lg font-bold",
        GRADE_STYLE[grade],
        size === "lg" ? "size-14 rounded-2xl text-3xl" : "size-7 text-sm",
      )}
    >
      {grade}
    </span>
  );
}
