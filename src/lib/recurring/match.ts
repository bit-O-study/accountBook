// 납부 자동 대조: 결제일 ±3일 안에서 같은 가맹점 거래를 찾고 금액으로 상태를 정한다.
//   예정 → (거래 발견) 납부완료 / (금액 10% 넘게 차이) 금액변동 / (D+3 지나도 없음) 미확인

import { diffDays, type DateStr } from "@/lib/dates";
import { normalizeMerchant } from "@/lib/sync/normalize";

export const MATCH_WINDOW_DAYS = 3;
export const AMOUNT_TOLERANCE = 0.1;

export type OccurrenceStatus = "SCHEDULED" | "PAID" | "CHANGED" | "MISSING";

export interface MatchRule {
  name: string;
  amount: number; // 양수
  amountMin?: number | null;
  amountMax?: number | null;
  merchantNorm?: string | null;
}

export interface MatchTx {
  id: string;
  date: DateStr;
  amount: number; // 지출은 음수
  merchantNorm: string;
  kind: string;
  status: string;
}

export function ruleMerchant(rule: MatchRule): string {
  return rule.merchantNorm || normalizeMerchant(rule.name).norm;
}

export function amountOk(rule: MatchRule, paid: number): boolean {
  if (rule.amountMin != null || rule.amountMax != null) {
    return (rule.amountMin == null || paid >= rule.amountMin) && (rule.amountMax == null || paid <= rule.amountMax);
  }
  return Math.abs(paid - rule.amount) <= rule.amount * AMOUNT_TOLERANCE;
}

export interface MatchResult {
  status: OccurrenceStatus;
  txId?: string;
  amount?: number;
}

export function evaluateOccurrence(
  rule: MatchRule,
  due: DateStr,
  txs: MatchTx[],
  used: Set<string>,
  today: DateStr,
): MatchResult {
  const merchant = ruleMerchant(rule);
  const candidates = txs
    .filter(
      (t) =>
        !used.has(t.id) &&
        t.kind === "EXPENSE" &&
        t.status === "APPROVED" &&
        t.amount < 0 &&
        t.merchantNorm === merchant &&
        Math.abs(diffDays(t.date, due)) <= MATCH_WINDOW_DAYS,
    )
    .sort((a, b) => {
      const okA = amountOk(rule, -a.amount) ? 0 : 1;
      const okB = amountOk(rule, -b.amount) ? 0 : 1;
      if (okA !== okB) return okA - okB;
      return Math.abs(diffDays(a.date, due)) - Math.abs(diffDays(b.date, due));
    });

  const hit = candidates[0];
  if (hit) {
    const paid = -hit.amount;
    return { status: amountOk(rule, paid) ? "PAID" : "CHANGED", txId: hit.id, amount: paid };
  }
  if (diffDays(today, due) > MATCH_WINDOW_DAYS) return { status: "MISSING" };
  return { status: "SCHEDULED" };
}
