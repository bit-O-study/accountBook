import { prisma } from "../db";
import { kstMonthKey, shiftMonth } from "../dates";
import type { FormState } from "../application/commands";
import { installmentAmount, validateInstallment } from "./schedule";

export async function saveInstallmentAction(user: { id: string }, _: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get("id") ?? "");
  const months = Number(form.get("months"));
  const firstMonth = String(form.get("firstMonth") ?? "");
  const tx = await prisma.transaction.findFirst({ where: { id, userId: user.id } });
  if (!tx) return { ok: false, message: "거래를 찾지 못했어요." };
  if (months !== 1 && (tx.kind !== "EXPENSE" || tx.amount >= 0 || tx.status !== "APPROVED"))
    return { ok: false, message: "승인된 지출 거래에만 할부를 설정할 수 있어요." };
  const error = validateInstallment(months, firstMonth, kstMonthKey(tx.occurredAt));
  if (error) return { ok: false, message: error };
  await prisma.transaction.updateMany({ where: { id, userId: user.id },
    data: { installmentMonths: months, firstBillingMonth: months === 1 ? null : firstMonth } });
  return { ok: true, message: months === 1 ? "일시불로 저장했어요." : "할부 예상 청구를 저장했어요." };
}

export async function loadInstallments(userId: string, month: string) {
  const transactions = await prisma.transaction.findMany({ where: {
    userId, kind: "EXPENSE", status: "APPROVED", excluded: false, amount: { lt: 0 },
    installmentMonths: { gt: 1 }, firstBillingMonth: { gte: shiftMonth(month, -59), lte: month },
  }, include: { account: { select: { name: true } } }, orderBy: [{ firstBillingMonth: "asc" }, { id: "asc" }] });
  return transactions.flatMap(tx => {
    const payment = installmentAmount(-tx.amount, tx.installmentMonths, tx.firstBillingMonth!, month);
    return payment ? [{ id: tx.id, merchant: tx.merchantNorm, accountName: tx.account?.name ?? "직접 입력 / CSV",
      approvalMonth: kstMonthKey(tx.occurredAt), total: -tx.amount, firstMonth: tx.firstBillingMonth!, ...payment }] : [];
  });
}
