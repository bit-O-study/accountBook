import { demoProvider } from "./demo";
import type { FinanceProvider } from "./types";

// 실제 연동사 계약 후 여기에 추가한다. 예: codef: codefProvider
const PROVIDERS: Record<string, FinanceProvider> = {
  demo: demoProvider,
};

export function getProvider(key: string): FinanceProvider {
  const p = PROVIDERS[key];
  if (!p) throw new Error(`등록되지 않은 연동사입니다: ${key}`);
  return p;
}

export const DEMO_INSTITUTIONS = [
  { name: "신한카드", kind: "CARD" },
  { name: "현대카드", kind: "CARD" },
  { name: "삼성카드", kind: "CARD" },
  { name: "KB국민카드", kind: "CARD" },
  { name: "국민은행", kind: "BANK" },
  { name: "신한은행", kind: "BANK" },
  { name: "카카오뱅크", kind: "BANK" },
  { name: "토스뱅크", kind: "BANK" },
] as const;
