import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  sub,
  actions,
  className,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="max-w-2xl">
        <h1 className="font-display text-[30px] font-bold leading-[1.1] sm:text-[36px]">{title}</h1>
        {sub && <p className="mt-2 text-[15.5px] leading-relaxed text-ink-2">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
