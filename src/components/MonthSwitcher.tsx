import Link from "next/link";
import { monthLabel, shiftMonth, type MonthKey } from "@/lib/dates";

export function MonthSwitcher({
  month,
  current,
  basePath,
  params = {},
}: {
  month: MonthKey;
  current: MonthKey;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  const href = (m: MonthKey) => {
    const q = new URLSearchParams();
    if (m !== current) q.set("month", m);
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const next = shiftMonth(month, 1);
  return (
    <div className="month-sw">
      <Link href={href(shiftMonth(month, -1))} aria-label="이전 달">
        ‹
      </Link>
      <span>{monthLabel(month)}</span>
      <Link href={href(next)} aria-label="다음 달" aria-disabled={next > current}>
        ›
      </Link>
    </div>
  );
}
