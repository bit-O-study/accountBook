import { diffDays } from "../dates";

export interface RefundTransaction {
  id: string; date: string; amount: number; kind: string; status: string; excluded: boolean; merchantNorm: string;
}
export interface RefundOriginal extends RefundTransaction { linkedAmount: number }
export function canLinkRefund(refund: RefundTransaction, original: RefundOriginal): boolean {
  const days = diffDays(refund.date, original.date);
  return refund.id !== original.id && refund.kind === "INCOME" && refund.amount > 0 && refund.status === "APPROVED" && !refund.excluded &&
    original.kind === "EXPENSE" && original.amount < 0 && original.status === "APPROVED" && !original.excluded &&
    !!original.merchantNorm && refund.merchantNorm === original.merchantNorm && days >= 0 && days <= 180 &&
    Number.isFinite(original.linkedAmount) && original.linkedAmount >= 0 && refund.amount <= -original.amount - original.linkedAmount;
}
export function refundCandidates(refund: RefundTransaction, originals: RefundOriginal[]) {
  return originals.filter(original => canLinkRefund(refund, original)).sort((a, b) =>
    Number(-b.amount - b.linkedAmount === refund.amount) - Number(-a.amount - a.linkedAmount === refund.amount) ||
    b.date.localeCompare(a.date) || a.id.localeCompare(b.id)).slice(0, 5);
}
