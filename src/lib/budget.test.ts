import { describe, expect, it } from "vitest";
import { summarizeMonth, type SummaryTx } from "./budget";

const tx = (date: string, amount: number, over: Partial<SummaryTx> = {}): SummaryTx => ({
  date,
  amount,
  kind: amount > 0 ? "INCOME" : "EXPENSE",
  status: "APPROVED",
  excluded: false,
  category: "식비",
  recurring: false,
  ...over,
});

describe("summarizeMonth", () => {
  const s = summarizeMonth({
    month: "2026-10",
    today: "2026-10-23",
    budget: 1500000,
    txs: [
      tx("2026-10-01", -100000),
      tx("2026-10-23", -24500, { category: "교통" }),
      tx("2026-10-20", -59000, { recurring: true }),
      tx("2026-10-15", 3200000),
      tx("2026-10-14", -800000, { kind: "CARD_BILL" }), // 카드대금은 지출 아님
      tx("2026-10-10", -30000, { status: "CANCELED" }),
      tx("2026-10-11", -40000, { excluded: true }),
      tx("2026-09-30", -99999), // 지난달
    ],
    occurrences: [
      { dueDate: "2026-10-20", status: "PAID", amount: 59000 },
      { dueDate: "2026-10-25", status: "SCHEDULED", amount: 550000 },
      { dueDate: "2026-10-28", status: "SCHEDULED", amount: 70000 },
    ],
  });

  it("고정지출은 생활비에서 빠진다", () => {
    expect(s.totalSpent).toBe(183500);
    expect(s.fixedSpent).toBe(59000);
    expect(s.livingSpent).toBe(124500);
    expect(s.income).toBe(3200000);
  });

  it("남은 고정지출과 하루 가능 금액", () => {
    expect(s.fixedRemaining).toBe(620000);
    expect(s.fixedRemainingCount).toBe(2);
    expect(s.daysLeft).toBe(9);
    expect(s.dailyAllowance).toBe(Math.floor((1500000 - 124500) / 9));
  });

  it("월말 예상 잔액 = 수입 - 지출 - 남은 고정 - 남은 생활비", () => {
    expect(s.projectedBalance).toBe(3200000 - 183500 - 620000 - (1500000 - 124500));
  });

  it("누적 그래프와 카테고리", () => {
    expect(s.cumulative).toHaveLength(23);
    expect(s.cumulative[0]).toBe(100000);
    expect(s.cumulative[22]).toBe(124500);
    expect(s.categories).toEqual([
      { name: "식비", amount: 100000 },
      { name: "교통", amount: 24500 },
    ]);
  });
});
