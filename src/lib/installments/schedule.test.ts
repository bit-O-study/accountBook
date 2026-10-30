import { describe, it, expect } from "vitest";
import { installmentAmount, validateInstallment } from "./schedule";
import { shiftMonth } from "../dates";

describe("installment principal allocation", () => {
  it("allocates leftover won to early installments without duplicating principal", () => {
    for (const total of [1, 2, 100, 100001, 2147483647]) for (let months = 2; months <= 60; months++) {
      const amounts = Array.from({ length: months }, (_, n) => installmentAmount(total, months, "2026-12", shiftMonth("2026-12", n))!.amount);
      expect(amounts.reduce((sum, n) => sum + n, 0)).toBe(total);
      for (let n = 0; n < months; n++) {
        expect(installmentAmount(total, months, "2026-12", shiftMonth("2026-12", n))!.remaining)
          .toBe(amounts.slice(n + 1).reduce((sum, value) => sum + value, 0));
      }
      expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1);
    }
  });
  it("crosses December and February independently of approval day", () => {
    expect(installmentAmount(100, 3, "2026-12", "2027-01")).toMatchObject({ amount: 33, installment: 2, lastMonth: "2027-02" });
    expect(installmentAmount(100, 3, "2026-12", "2026-12")!.amount).toBe(34);
    expect(installmentAmount(100, 3, "2026-12", "2026-11")).toBeNull();
    expect(installmentAmount(100, 3, "2026-12", "2027-03")).toBeNull();
  });
  it("rejects malformed schedules and allows clearing a plan", () => {
    for (const n of [0, 1.5, 61, NaN]) expect(validateInstallment(n, "2026-10", "2026-10")).not.toBeNull();
    for (const month of ["", "2026-13", "2026-09", "9999-12"]) expect(validateInstallment(3, month, "2026-10")).not.toBeNull();
    expect(validateInstallment(1, "", "2026-10")).toBeNull();
    expect(validateInstallment(3, "2026-10", "2026-10")).toBeNull();
    expect(installmentAmount(100, 1, "2026-10", "2026-10")).toBeNull();
  });
});
