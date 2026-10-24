// STEP 3 · 중복 제거
// 1) 같은 계정의 같은 외부 거래 ID
// 2) 자동 수집끼리: 같은 금액 + 같은 가맹점 + 시각 ±10분 (승인·매입 이중 기록)
// 3) 수동/CSV 입력과 자동 수집: 같은 날 + 같은 금액 + 같은 가맹점

import { kstDateStr } from "@/lib/dates";

export const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

export interface DedupeCandidate {
  id: string;
  accountId: string | null;
  externalId: string | null;
  occurredAt: Date;
  amount: number;
  merchantNorm: string;
  source: string;
}

export interface Incoming {
  accountId: string | null;
  externalId: string | null;
  occurredAt: Date;
  amount: number;
  merchantNorm: string;
}

export type DuplicateMatch =
  | { type: "same-id"; existing: DedupeCandidate }
  | { type: "auto-twin"; existing: DedupeCandidate }
  | { type: "manual-merge"; existing: DedupeCandidate };

export function findDuplicate(inc: Incoming, existing: DedupeCandidate[]): DuplicateMatch | null {
  if (inc.externalId) {
    const same = existing.find((e) => e.accountId === inc.accountId && e.externalId === inc.externalId);
    if (same) return { type: "same-id", existing: same };
  }
  const day = kstDateStr(inc.occurredAt);
  const twin = existing.find(
    (e) =>
      e.source === "AUTO" &&
      e.amount === inc.amount &&
      e.merchantNorm === inc.merchantNorm &&
      (e.accountId === inc.accountId
        ? Math.abs(e.occurredAt.getTime() - inc.occurredAt.getTime()) <= DEDUPE_WINDOW_MS
        : // 계정 없이 들어온 CSV 가 이미 자동 기록된 거래와 같은 날이면 같은 거래
          inc.accountId === null && kstDateStr(e.occurredAt) === day),
  );
  if (twin) return { type: "auto-twin", existing: twin };

  const manual = existing.find(
    (e) =>
      (e.source === "MANUAL" || e.source === "CSV") &&
      e.amount === inc.amount &&
      e.merchantNorm === inc.merchantNorm &&
      kstDateStr(e.occurredAt) === day,
  );
  if (manual) return { type: "manual-merge", existing: manual };
  return null;
}
