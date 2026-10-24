import { describe, expect, it } from "vitest";
import { detectRecurring, type DetectTx } from "./detect";
import { evaluateOccurrence, type MatchTx } from "./match";
import { dueDatesInRange, isNotifyDay, nextDueDate } from "./schedule";

describe("dueDatesInRange", () => {
  const base = { cycle: "MONTHLY", dueDay: 31, startDate: "2026-01-01" };

  it("31일 결제는 짧은 달에 말일로 보정한다", () => {
    expect(dueDatesInRange(base, "2026-01-01", "2026-04-30")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("시작일 이전과 종료일 이후는 만들지 않는다", () => {
    const r = { ...base, dueDay: 10, startDate: "2026-02-11", endDate: "2026-04-09" };
    expect(dueDatesInRange(r, "2026-01-01", "2026-12-31")).toEqual(["2026-03-10"]);
  });

  it("일시정지면 비어 있다", () => {
    expect(dueDatesInRange({ ...base, paused: true }, "2026-01-01", "2026-12-31")).toEqual([]);
  });

  it("매주 결제는 요일 기준", () => {
    // 2026-10-05 는 월요일
    const r = { cycle: "WEEKLY", dueDay: 1, startDate: "2026-10-01" };
    expect(dueDatesInRange(r, "2026-10-01", "2026-10-20")).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
  });

  it("매년 결제", () => {
    const r = { cycle: "YEARLY", dueDay: 29, dueMonth: 2, startDate: "2026-01-01" };
    expect(dueDatesInRange(r, "2026-01-01", "2028-12-31")).toEqual(["2026-02-28", "2027-02-28", "2028-02-29"]);
  });

  it("다음 결제일", () => {
    expect(nextDueDate({ ...base, dueDay: 25 }, "2026-10-23")).toBe("2026-10-25");
    expect(nextDueDate({ ...base, dueDay: 5 }, "2026-10-23")).toBe("2026-11-05");
  });

  it("알림 날짜", () => {
    expect(isNotifyDay("2026-10-25", "2026-10-22", "3,1")).toBe(3);
    expect(isNotifyDay("2026-10-25", "2026-10-23", "3,1")).toBeNull();
  });
});

describe("evaluateOccurrence", () => {
  const rule = { name: "SKT 통신요금", amount: 59000, merchantNorm: "SKT" };
  const tx = (over: Partial<MatchTx>): MatchTx => ({
    id: "t1",
    date: "2026-10-20",
    amount: -59000,
    merchantNorm: "SKT",
    kind: "EXPENSE",
    status: "APPROVED",
    ...over,
  });

  it("결제일 ±3일 안의 같은 금액은 납부완료", () => {
    expect(evaluateOccurrence(rule, "2026-10-20", [tx({ date: "2026-10-22" })], new Set(), "2026-10-23")).toEqual({
      status: "PAID",
      txId: "t1",
      amount: 59000,
    });
  });

  it("금액이 10% 넘게 다르면 금액변동", () => {
    expect(evaluateOccurrence(rule, "2026-10-20", [tx({ amount: -71500 })], new Set(), "2026-10-23").status).toBe("CHANGED");
  });

  it("범위 밖이면 무시하고, D+3 지나면 미확인", () => {
    const far = [tx({ date: "2026-10-27" })];
    expect(evaluateOccurrence(rule, "2026-10-20", far, new Set(), "2026-10-22").status).toBe("SCHEDULED");
    expect(evaluateOccurrence(rule, "2026-10-20", far, new Set(), "2026-10-24").status).toBe("MISSING");
  });

  it("이미 다른 회차에 쓴 거래, 취소 거래는 쓰지 않는다", () => {
    expect(evaluateOccurrence(rule, "2026-10-20", [tx({})], new Set(["t1"]), "2026-10-21").status).toBe("SCHEDULED");
    expect(evaluateOccurrence(rule, "2026-10-20", [tx({ status: "CANCELED" })], new Set(), "2026-10-21").status).toBe("SCHEDULED");
  });

  it("후보가 여럿이면 금액이 맞는 것, 그다음 결제일에 가까운 것", () => {
    const res = evaluateOccurrence(
      rule,
      "2026-10-20",
      [tx({ id: "a", amount: -80000, date: "2026-10-20" }), tx({ id: "b", date: "2026-10-22" }), tx({ id: "c", date: "2026-10-21" })],
      new Set(),
      "2026-10-23",
    );
    expect(res.txId).toBe("c");
  });

  it("변동형은 금액 범위로 판정", () => {
    const util = { name: "도시가스", amount: 40000, amountMin: 20000, amountMax: 90000, merchantNorm: "도시가스" };
    const t = tx({ merchantNorm: "도시가스", amount: -85000 });
    expect(evaluateOccurrence(util, "2026-10-20", [t], new Set(), "2026-10-23").status).toBe("PAID");
  });
});

describe("detectRecurring", () => {
  const t = (date: string, amount: number, merchant = "유튜브 프리미엄"): DetectTx => ({
    date,
    amount: -amount,
    merchantNorm: merchant,
    merchantRaw: merchant,
    kind: "EXPENSE",
    status: "APPROVED",
    excluded: false,
    recurring: false,
  });

  it("3개월 연속 같은 날 비슷한 금액이면 제안", () => {
    const s = detectRecurring([t("2026-08-12", 14900), t("2026-09-12", 14900), t("2026-10-12", 14900)], new Set(), "2026-10-23");
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ merchantNorm: "유튜브 프리미엄", amount: 14900, cycle: "MONTHLY", dueDay: 12, count: 3 });
  });

  it("2번뿐이면 제안하지 않는다", () => {
    expect(detectRecurring([t("2026-09-12", 14900), t("2026-10-12", 14900)], new Set(), "2026-10-23")).toEqual([]);
  });

  it("자주 가는 가게는 제안하지 않는다", () => {
    const coffee = ["2026-08-12", "2026-08-20", "2026-09-12", "2026-09-30", "2026-10-12"].map((d) => t(d, 6500, "스타벅스"));
    expect(detectRecurring(coffee, new Set(), "2026-10-23")).toEqual([]);
  });

  it("금액 차이가 10%를 넘으면 제안하지 않는다", () => {
    expect(
      detectRecurring([t("2026-08-12", 10000), t("2026-09-12", 14900), t("2026-10-12", 14900)], new Set(), "2026-10-23"),
    ).toEqual([]);
  });

  it("무시했거나 이미 등록한 가맹점은 제외", () => {
    const list = [t("2026-08-12", 14900), t("2026-09-12", 14900), t("2026-10-12", 14900)];
    expect(detectRecurring(list, new Set(["유튜브 프리미엄"]), "2026-10-23")).toEqual([]);
  });

  it("오래 끊긴 결제는 제안하지 않는다", () => {
    const list = [t("2026-05-12", 14900), t("2026-06-12", 14900), t("2026-07-12", 14900)];
    expect(detectRecurring(list, new Set(), "2026-10-23")).toEqual([]);
  });

  it("매주 결제 감지", () => {
    const list = ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"].map((d) => t(d, 30000, "필라테스"));
    expect(detectRecurring(list, new Set(), "2026-10-23")[0]).toMatchObject({ cycle: "WEEKLY", dueDay: 1 });
  });
});
