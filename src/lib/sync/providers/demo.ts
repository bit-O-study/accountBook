// 데모 연동사: 실제 금융 API 계약 전까지 쓰는 가짜 카드사·은행.
// 같은 계정·같은 날짜에는 항상 같은 거래(같은 외부 ID)를 돌려줘서 중복 제거를 실제로 검증할 수 있다.
// providerConfig 가 "fail" 이면 인증 실패를 흉내 낸다.

import { addDays, daysInMonth, kstDateStr, kstDateTime, parseDate, type DateStr } from "@/lib/dates";
import { ProviderAuthError, type FinanceProvider, type ProviderAccount, type ProviderTx } from "./types";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHOPS: { raw: string; mcc: string; min: number; max: number; weight: number }[] = [
  { raw: "스타벅스 역삼점", mcc: "5814", min: 4500, max: 7500, weight: 5 },
  { raw: "(주)우아한형제들", mcc: "5812", min: 15000, max: 34000, weight: 3 },
  { raw: "쿠팡(주)", mcc: "5999", min: 9000, max: 68000, weight: 3 },
  { raw: "이마트 성수점", mcc: "5411", min: 18000, max: 92000, weight: 2 },
  { raw: "카카오T 택시", mcc: "4121", min: 4800, max: 18500, weight: 3 },
  { raw: "GS25 역삼점", mcc: "5499", min: 1800, max: 9500, weight: 4 },
  { raw: "올리브영 강남점", mcc: "5977", min: 9000, max: 42000, weight: 1 },
  { raw: "김밥천국 역삼점", mcc: "5812", min: 6000, max: 12000, weight: 3 },
  { raw: "CGV 강남", mcc: "7832", min: 14000, max: 32000, weight: 1 },
  { raw: "티머니 교통카드", mcc: "4111", min: 1400, max: 2900, weight: 4 },
];
const TOTAL_WEIGHT = SHOPS.reduce((s, x) => s + x.weight, 0);

// 매달 같은 날 나가는 결제 (유튜브는 고정지출 미등록 → 자동 감지 제안 대상)
const CARD_MONTHLY = [
  { day: 12, raw: "Google *YouTube Premium", mcc: "5815", amount: 14900 },
  { day: 15, raw: "넷플릭스", mcc: "5815", amount: 17000 },
  { day: 20, raw: "SK텔레콤 통신요금", mcc: "4814", amount: 59000 },
  { day: 28, raw: "에이블짐 역삼", mcc: "7997", amount: 70000 },
];
const BANK_MONTHLY = [
  { day: 5, raw: "DB손해보험", amount: -84000 },
  { day: 15, raw: "(주)비트오 급여", amount: 3200000 },
  { day: 25, raw: "월세 김민수", amount: -550000 },
];

function round100(n: number) {
  return Math.round(n / 100) * 100;
}

function time(r: () => number, from = 8, to = 22): string {
  const h = from + Math.floor(r() * (to - from));
  const m = Math.floor(r() * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function monthlyDay(date: DateStr, day: number): boolean {
  const { y, m, d } = parseDate(date);
  return Math.min(day, daysInMonth(y, m)) === d;
}

function cardDay(acc: ProviderAccount, date: DateStr): ProviderTx[] {
  const r = rng(hash(acc.id + date));
  const out: ProviderTx[] = [];
  const id = (n: number | string) => `${acc.id}:${date}:${n}`;

  const count = Math.floor(r() * 3.2);
  for (let i = 0; i < count; i++) {
    let pick = r() * TOTAL_WEIGHT;
    const shop = SHOPS.find((s) => (pick -= s.weight) < 0) ?? SHOPS[0];
    const amount = round100(shop.min + r() * (shop.max - shop.min));
    out.push({
      externalId: id(i),
      type: "APPROVAL",
      occurredAt: kstDateTime(date, time(r)),
      amount: -amount,
      merchantRaw: shop.raw,
      mcc: shop.mcc,
    });
  }
  // 가끔 결제 취소
  if (out.length && r() < 0.06) {
    const orig = out[0];
    out.push({
      externalId: id("c"),
      type: "CANCEL",
      occurredAt: new Date(orig.occurredAt.getTime() + 30 * 60 * 1000),
      amount: -orig.amount,
      merchantRaw: orig.merchantRaw,
      mcc: orig.mcc,
      originalExternalId: orig.externalId,
    });
  }
  for (const f of CARD_MONTHLY) {
    if (!monthlyDay(date, f.day)) continue;
    out.push({
      externalId: id(`f${f.day}`),
      type: "APPROVAL",
      occurredAt: kstDateTime(date, "06:10"),
      amount: -f.amount,
      merchantRaw: f.raw,
      mcc: f.mcc,
    });
  }
  return out;
}

function bankDay(acc: ProviderAccount, date: DateStr): ProviderTx[] {
  const r = rng(hash(acc.id + date));
  const out: ProviderTx[] = [];
  const id = (n: number | string) => `${acc.id}:${date}:${n}`;
  for (const f of BANK_MONTHLY) {
    if (!monthlyDay(date, f.day)) continue;
    out.push({
      externalId: id(`f${f.day}`),
      type: f.amount > 0 ? "DEPOSIT" : "WITHDRAWAL",
      occurredAt: kstDateTime(date, "09:00"),
      amount: f.amount,
      merchantRaw: f.raw,
    });
  }
  // 카드대금 (이미 카드 승인으로 기록된 돈 → 지출 아님)
  if (monthlyDay(date, 14)) {
    out.push({
      externalId: id("bill"),
      type: "WITHDRAWAL",
      occurredAt: kstDateTime(date, "07:00"),
      amount: -round100(620000 + r() * 260000),
      merchantRaw: "신한카드 결제대금",
    });
  }
  // 내 계좌 간 이체 (저축)
  if (monthlyDay(date, 16)) {
    out.push({
      externalId: id("save"),
      type: "WITHDRAWAL",
      occurredAt: kstDateTime(date, "10:30"),
      amount: -300000,
      merchantRaw: "내계좌 카카오뱅크 저축",
    });
  }
  // 가끔 계좌에서 바로 결제
  if (r() < 0.12) {
    out.push({
      externalId: id(0),
      type: "WITHDRAWAL",
      occurredAt: kstDateTime(date, time(r)),
      amount: -round100(10000 + r() * 50000),
      merchantRaw: "쿠팡(주)",
      mcc: "5999",
    });
  }
  return out;
}

export const HISTORY_DAYS = 100;

export const demoProvider: FinanceProvider = {
  key: "demo",
  label: "데모 연동",
  async fetchTransactions(account, since, until) {
    if (account.providerConfig === "fail") throw new ProviderAuthError();
    const earliest = addDays(kstDateStr(account.createdAt), -HISTORY_DAYS);
    let day = kstDateStr(since) < earliest ? earliest : kstDateStr(since);
    const last = kstDateStr(until);
    const out: ProviderTx[] = [];
    while (day <= last) {
      const list = account.kind === "CARD" ? cardDay(account, day) : bankDay(account, day);
      for (const t of list) if (t.occurredAt >= since && t.occurredAt <= until) out.push(t);
      day = addDays(day, 1);
    }
    return out;
  },
};
