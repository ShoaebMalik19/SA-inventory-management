import { cn } from "@/lib/utils";
import type { InvoiceStatus } from "@/lib/data/selectors";

const STYLE: Record<InvoiceStatus, string> = {
  paid: "bg-st-ready-bg text-st-ready",
  part: "bg-st-booked-bg text-st-booked",
  unpaid: "bg-st-checking-bg text-st-checking",
  overdue: "bg-st-scrap-bg text-st-scrap",
};

export function MoneyPill({ status, overdueDays, className }: { status: InvoiceStatus; overdueDays?: number; className?: string }) {
  const label =
    status === "paid" ? "Paid" : status === "part" ? "Part paid" : status === "unpaid" ? "Not paid yet" : `Overdue ${overdueDays} day${overdueDays === 1 ? "" : "s"}`;
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-semibold", STYLE[status], className)}>{label}</span>;
}
