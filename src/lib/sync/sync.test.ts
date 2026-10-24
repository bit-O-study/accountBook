import { describe, expect, it } from "vitest";
import { kstDateTime } from "@/lib/dates";
import { classifyKind, pickCategory } from "./categorize";
import { parseCsv } from "./csv";
import { findDuplicate, type DedupeCandidate } from "./dedupe";
import { normalizeMerchant } from "./normalize";
import { demoProvider } from "./providers/demo";
import { ProviderAuthError } from "./providers/types";

describe("normalizeMerchant", () => {
  it("법인명을 브랜드명으로 바꾼다", () => {
    expect(normalizeMerchant("(주)우아한형제들").norm).toBe("배달의민족");
    expect(normalizeMerchant("STARBUCKS 역삼").norm).toBe("스타벅스");
    expect(normalizeMerchant("SK텔레콤 통신요금").norm).toBe("SKT");
    expect(normalizeMerchant("Google *YouTube Premium").norm).toBe("유튜브 프리미엄");
  });
  it("사전에 없으면 법인 표기만 지운다", () => {
    expect(normalizeMerchant("㈜  동네빵집 ").norm).toBe("동네빵집");
  });
});

describe("classifyKind / pickCategory", () => {
  const base = { ownAccountNames: ["국민은행", "카카오뱅크"] };
  it("은행의 카드대금 출금은 지출이 아니다", () => {
    expect(classifyKind({ ...base, amount: -812000, merchantRaw: "신한카드 결제대금", accountKind: "BANK" })).toBe("CARD_BILL");
  });
  it("내 계좌 간 이체", () => {
    expect(classifyKind({ ...base, amount: -300000, merchantRaw: "내계좌 카카오뱅크 저축", accountKind: "BANK" })).toBe("TRANSFER");
  });
  it("일반 지출과 수입", () => {
    expect(classifyKind({ ...base, amount: -6500, merchantRaw: "스타벅스", accountKind: "CARD" })).toBe("EXPENSE");
    expect(classifyKind({ ...base, amount: 3200000, merchantRaw: "(주)비트오 급여", accountKind: "BANK" })).toBe("INCOME");
  });
  it("내 규칙이 가맹점 사전보다 먼저", () => {
    const userRules = new Map([["쿠팡", "식비"]]);
    expect(pickCategory({ merchantNorm: "쿠팡", brandCategory: "쇼핑", amount: -1, kind: "EXPENSE", userRules })).toBe("식비");
    expect(pickCategory({ merchantNorm: "쿠팡", brandCategory: "쇼핑", amount: -1, kind: "EXPENSE", userRules: new Map() })).toBe("쇼핑");
    expect(pickCategory({ merchantNorm: "x", mcc: "4121", amount: -1, kind: "EXPENSE", userRules: new Map() })).toBe("교통");
    expect(pickCategory({ merchantNorm: "x", amount: -1, kind: "EXPENSE", userRules: new Map() })).toBe("기타");
  });
});

describe("findDuplicate", () => {
  const at = kstDateTime("2026-10-23", "08:42");
  const ex = (over: Partial<DedupeCandidate>): DedupeCandidate => ({
    id: "e1",
    accountId: "acc",
    externalId: "x1",
    occurredAt: at,
    amount: -6500,
    merchantNorm: "스타벅스",
    source: "AUTO",
    ...over,
  });
  const inc = { accountId: "acc", externalId: "x1", occurredAt: at, amount: -6500, merchantNorm: "스타벅스" };

  it("같은 외부 ID", () => {
    expect(findDuplicate(inc, [ex({})])?.type).toBe("same-id");
  });
  it("승인·매입 이중 기록 (±10분)", () => {
    const later = { ...inc, externalId: "x2", occurredAt: new Date(at.getTime() + 9 * 60 * 1000) };
    expect(findDuplicate(later, [ex({})])?.type).toBe("auto-twin");
    const tooLate = { ...inc, externalId: "x2", occurredAt: new Date(at.getTime() + 11 * 60 * 1000) };
    expect(findDuplicate(tooLate, [ex({})])).toBeNull();
  });
  it("CSV 로 다시 올린 자동 기록은 중복", () => {
    const csv = { ...inc, accountId: null, externalId: "csv:1", occurredAt: kstDateTime("2026-10-23", "12:00") };
    expect(findDuplicate(csv, [ex({})])?.type).toBe("auto-twin");
  });
  it("수동 입력과 같은 날·같은 금액이면 합친다", () => {
    const manual = ex({ source: "MANUAL", accountId: null, externalId: null, occurredAt: kstDateTime("2026-10-23", "12:00") });
    expect(findDuplicate(inc, [manual])?.type).toBe("manual-merge");
  });
});

describe("parseCsv", () => {
  it("카드사 머리글과 금액 형식을 읽는다", () => {
    const csv = '이용일자,이용시간,이용가맹점,이용금액,승인번호\n2026.10.21,13:05,"쿠팡(주)","38,900",123\n2026-10-22,,스타벅스,6500원,\n';
    const r = parseCsv(csv);
    expect(r.errors).toEqual([]);
    expect(r.rows).toMatchObject([
      { date: "2026-10-21", time: "13:05", merchant: "쿠팡(주)", amount: -38900, approvalNo: "123" },
      { date: "2026-10-22", time: "12:00", merchant: "스타벅스", amount: -6500 },
    ]);
  });
  it("잘못된 줄은 이유와 함께 알려준다", () => {
    const r = parseCsv("날짜,가맹점,금액\n2026-13-01,a,100\n2026-10-01,b,abc\n");
    expect(r.rows).toEqual([]);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3]);
  });
  it("필수 열이 없으면 알려준다", () => {
    expect(parseCsv("날짜,메모\n2026-10-01,a\n").errors[0].message).toContain("가맹점");
  });
});

describe("demoProvider", () => {
  const acc = { id: "card1", name: "신한카드", kind: "CARD" as const, providerConfig: "", tokenEnc: null, createdAt: new Date("2026-10-23T00:00:00Z") };
  it("같은 기간은 항상 같은 거래를 준다", async () => {
    const a = await demoProvider.fetchTransactions(acc, new Date("2026-10-01T00:00:00Z"), new Date("2026-10-20T00:00:00Z"));
    const b = await demoProvider.fetchTransactions(acc, new Date("2026-10-01T00:00:00Z"), new Date("2026-10-20T00:00:00Z"));
    expect(a.map((t) => t.externalId)).toEqual(b.map((t) => t.externalId));
    expect(a.some((t) => t.merchantRaw === "넷플릭스")).toBe(true);
  });
  it("fail 설정이면 인증 오류", async () => {
    await expect(demoProvider.fetchTransactions({ ...acc, providerConfig: "fail" }, new Date(0), new Date())).rejects.toBeInstanceOf(
      ProviderAuthError,
    );
  });
});
