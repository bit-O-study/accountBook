// STEP 4 · 분류: 내 규칙 → 가맹점 사전 → 업종코드 순.
// 거래 종류(지출/수입/이체/카드대금)도 여기서 판정해 이중 계산을 막는다.

export const CATEGORIES = [
  { name: "식비", kind: "EXPENSE" },
  { name: "카페", kind: "EXPENSE" },
  { name: "쇼핑", kind: "EXPENSE" },
  { name: "교통", kind: "EXPENSE" },
  { name: "주거", kind: "EXPENSE" },
  { name: "통신", kind: "EXPENSE" },
  { name: "구독", kind: "EXPENSE" },
  { name: "보험", kind: "EXPENSE" },
  { name: "건강", kind: "EXPENSE" },
  { name: "문화", kind: "EXPENSE" },
  { name: "기타", kind: "EXPENSE" },
  { name: "급여", kind: "INCOME" },
  { name: "기타수입", kind: "INCOME" },
  { name: "이체", kind: "TRANSFER" },
] as const;

export type CategoryName = (typeof CATEGORIES)[number]["name"];

const MCC: Record<string, CategoryName> = {
  "5812": "식비",
  "5813": "식비",
  "5814": "카페",
  "5411": "식비",
  "5499": "식비",
  "4121": "교통",
  "4111": "교통",
  "5311": "쇼핑",
  "5999": "쇼핑",
  "5977": "쇼핑",
  "5651": "쇼핑",
  "4814": "통신",
  "7832": "문화",
  "7997": "건강",
  "8062": "건강",
  "6300": "보험",
};

export interface CategorizeInput {
  merchantNorm: string;
  brandCategory?: string;
  mcc?: string | null;
  amount: number;
  kind: TxKind;
  userRules: Map<string, string>; // merchantNorm → category name
}

export function pickCategory(i: CategorizeInput): string {
  if (i.kind === "TRANSFER" || i.kind === "CARD_BILL") return "이체";
  const rule = i.userRules.get(i.merchantNorm);
  if (rule) return rule;
  if (i.kind === "INCOME") return /급여|월급|salary/i.test(i.merchantNorm) ? "급여" : "기타수입";
  if (i.brandCategory) return i.brandCategory;
  if (i.mcc && MCC[i.mcc]) return MCC[i.mcc];
  return "기타";
}

export type TxKind = "EXPENSE" | "INCOME" | "TRANSFER" | "CARD_BILL";

export interface KindInput {
  amount: number;
  merchantRaw: string;
  accountKind: "CARD" | "BANK" | null;
  ownAccountNames: string[]; // 내 계좌 간 이체 판정용
}

export function classifyKind(i: KindInput): TxKind {
  const raw = i.merchantRaw;
  if (i.accountKind === "BANK" && i.amount < 0 && /카드/.test(raw) && /(결제|대금)/.test(raw)) {
    // 카드 승인으로 이미 기록된 돈이 은행에서 한 번 더 빠지는 것
    return "CARD_BILL";
  }
  if (/내\s*계좌|본인\s*계좌/.test(raw) || i.ownAccountNames.some((n) => n && raw.includes(n))) {
    return "TRANSFER";
  }
  return i.amount > 0 ? "INCOME" : "EXPENSE";
}

/** 통계(지출 합계)에 들어가는 거래인가 */
export function countsAsSpending(t: { kind: string; status: string; excluded: boolean }): boolean {
  return t.kind === "EXPENSE" && t.status === "APPROVED" && !t.excluded;
}

export function countsAsIncome(t: { kind: string; status: string; excluded: boolean }): boolean {
  return t.kind === "INCOME" && t.status === "APPROVED" && !t.excluded;
}
