import { describe, it, expect } from "vitest";
import { canLinkRefund, refundCandidates, type RefundOriginal, type RefundTransaction } from "./candidates";
const refund: RefundTransaction = { id: "refund", date: "2026-10-26", amount: 3000, merchantNorm: "상점", kind: "INCOME", status: "APPROVED", excluded: false };
const original: RefundOriginal = { ...refund, id: "expense", date: "2026-10-25", amount: -10000, kind: "EXPENSE", linkedAmount: 0 };
describe("refund candidate policy", () => {
  it("supports partial and multiple refunds within remaining principal", () => {
    expect(canLinkRefund(refund, { ...original, linkedAmount: 7000 })).toBe(true);
    expect(canLinkRefund(refund, { ...original, linkedAmount: 7001 })).toBe(false);
  });
  it("includes same day and 180 days but not future or older expense", () => {
    expect(canLinkRefund(refund, { ...original, date: "2026-10-26" })).toBe(true);
    expect(canLinkRefund(refund, { ...original, date: "2026-04-29" })).toBe(true);
    expect(canLinkRefund(refund, { ...original, date: "2026-04-28" })).toBe(false);
    expect(canLinkRefund(refund, { ...original, date: "2026-10-27" })).toBe(false);
  });
  it("rejects excluded, canceled, other merchant and wrong kinds", () => {
    for (const change of [{ excluded: true }, { status: "CANCELED" }, { merchantNorm: "다른 상점" }, { kind: "CARD_BILL" }, { amount: 10000 }, { linkedAmount: NaN }])
      expect(canLinkRefund(refund, { ...original, ...change })).toBe(false);
    for (const change of [{ excluded: true }, { status: "CANCELED" }, { kind: "EXPENSE" }, { amount: 0 }])
      expect(canLinkRefund({ ...refund, ...change }, original)).toBe(false);
  });
  it("ranks exact remaining amount first, then recent and limits to five", () => {
    const list = Array.from({ length: 8 }, (_, i) => ({ ...original, id: String(i), date: "2026-10-" + String(10 + i) }));
    list[0].amount = -3000;
    expect(refundCandidates(refund, list).map(tx => tx.id)).toEqual(["0", "7", "6", "5", "4"]);
  });
});
