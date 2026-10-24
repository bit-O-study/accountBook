// 반복 결제 감지: 같은 가맹점에서 비슷한 금액이 일정한 간격으로 이어지면 고정지출 등록을 제안한다.
// 자주 가는 가게(매일 커피 등)가 잡히지 않도록, 감지 구간 안의 거래가 모두 규칙적이어야 한다.

import { diffDays, parseDate, weekday, type DateStr } from "@/lib/dates";
import { AMOUNT_TOLERANCE } from "./match";

export interface DetectTx {
  date: DateStr;
  amount: number; // 지출은 음수
  merchantNorm: string;
  merchantRaw: string;
  kind: string;
  status: string;
  excluded: boolean;
  recurring: boolean; // 이미 고정지출에 연결됨
}

export interface Suggestion {
  merchantNorm: string;
  name: string;
  amount: number;
  cycle: "MONTHLY" | "WEEKLY";
  dueDay: number;
  count: number;
  lastDate: DateStr;
}

const MIN_COUNT = { MONTHLY: 3, WEEKLY: 4 } as const;
const GAP = { MONTHLY: [25, 35], WEEKLY: [6, 8] } as const;
const LOOKBACK = { MONTHLY: 125, WEEKLY: 45 } as const;
const STALE_AFTER = { MONTHLY: 38, WEEKLY: 10 } as const;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function tryCycle(cycle: "MONTHLY" | "WEEKLY", list: DetectTx[], today: DateStr): Suggestion | null {
  const recent = list.filter((t) => diffDays(today, t.date) <= LOOKBACK[cycle]);
  if (recent.length < MIN_COUNT[cycle]) return null;
  const last = recent[recent.length - 1];
  if (diffDays(today, last.date) > STALE_AFTER[cycle]) return null;

  const [lo, hi] = GAP[cycle];
  for (let i = 1; i < recent.length; i++) {
    const gap = diffDays(recent[i].date, recent[i - 1].date);
    if (gap < lo || gap > hi) return null;
  }
  const amounts = recent.map((t) => -t.amount);
  const med = median(amounts);
  if (amounts.some((a) => Math.abs(a - med) > med * AMOUNT_TOLERANCE)) return null;

  return {
    merchantNorm: last.merchantNorm,
    name: last.merchantNorm,
    amount: -last.amount,
    cycle,
    dueDay: cycle === "WEEKLY" ? weekday(last.date) : parseDate(last.date).d,
    count: recent.length,
    lastDate: last.date,
  };
}

export function detectRecurring(txs: DetectTx[], exclude: Set<string>, today: DateStr): Suggestion[] {
  const groups = new Map<string, DetectTx[]>();
  for (const t of txs) {
    if (t.kind !== "EXPENSE" || t.status !== "APPROVED" || t.excluded || t.amount >= 0) continue;
    if (exclude.has(t.merchantNorm)) continue;
    const g = groups.get(t.merchantNorm) ?? [];
    g.push(t);
    groups.set(t.merchantNorm, g);
  }

  const out: Suggestion[] = [];
  for (const list of groups.values()) {
    // 이미 고정지출로 연결된 거래가 있는 가맹점은 제외
    if (list.some((t) => t.recurring)) continue;
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const s = tryCycle("MONTHLY", list, today) ?? tryCycle("WEEKLY", list, today);
    if (s) out.push(s);
  }
  return out.sort((a, b) => b.amount - a.amount);
}
