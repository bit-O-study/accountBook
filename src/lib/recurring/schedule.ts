// 고정지출 결제일 계산. 31일 결제는 짧은 달에 말일로 보정한다.

import { addDays, daysInMonth, diffDays, makeDate, parseDate, weekday, type DateStr } from "@/lib/dates";

export type Cycle = "WEEKLY" | "MONTHLY" | "YEARLY";

export interface ScheduleRule {
  cycle: Cycle | string;
  dueDay: number;
  dueMonth?: number | null;
  startDate: DateStr;
  endDate?: DateStr | null;
  paused?: boolean;
}

function clampDay(y: number, m: number, d: number): DateStr {
  return makeDate(y, m, Math.min(d, daysInMonth(y, m)));
}

/** from ~ to (둘 다 포함) 사이의 결제일 목록 */
export function dueDatesInRange(rule: ScheduleRule, from: DateStr, to: DateStr): DateStr[] {
  if (rule.paused) return [];
  const lo = rule.startDate > from ? rule.startDate : from;
  const hi = rule.endDate && rule.endDate < to ? rule.endDate : to;
  if (lo > hi) return [];
  const out: DateStr[] = [];

  if (rule.cycle === "WEEKLY") {
    let d = addDays(lo, (rule.dueDay - weekday(lo) + 7) % 7);
    while (d <= hi) {
      out.push(d);
      d = addDays(d, 7);
    }
    return out;
  }

  const a = parseDate(lo);
  const b = parseDate(hi);
  for (let y = a.y; y <= b.y; y++) {
    const mFrom = y === a.y ? a.m : 1;
    const mTo = y === b.y ? b.m : 12;
    for (let m = mFrom; m <= mTo; m++) {
      if (rule.cycle === "YEARLY" && rule.dueMonth !== m) continue;
      const d = clampDay(y, m, rule.dueDay);
      if (d >= lo && d <= hi) out.push(d);
    }
  }
  return out;
}

export function nextDueDate(rule: ScheduleRule, today: DateStr): DateStr | null {
  return dueDatesInRange(rule, today, addDays(today, 400))[0] ?? null;
}

export function cycleLabel(rule: { cycle: string; dueDay: number; dueMonth?: number | null }): string {
  if (rule.cycle === "WEEKLY") return `매주 ${"일월화수목금토"[rule.dueDay]}요일`;
  if (rule.cycle === "YEARLY") return `매년 ${rule.dueMonth}월 ${rule.dueDay}일`;
  return `매월 ${rule.dueDay}일`;
}

export function notifyOffsets(notifyDays: string): number[] {
  return notifyDays
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0);
}

export function isNotifyDay(due: DateStr, today: DateStr, notifyDays: string): number | null {
  const left = diffDays(due, today);
  return notifyOffsets(notifyDays).includes(left) ? left : null;
}
