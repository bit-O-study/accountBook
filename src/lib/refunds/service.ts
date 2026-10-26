import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { addDays, kstDateStr, kstStartOfDay, monthRange } from "../dates";
import type { FormState } from "../application/commands";
import { canLinkRefund, refundCandidates } from "./candidates";

const view = (tx: { id: string; occurredAt: Date; amount: number; kind: string; status: string; excluded: boolean; merchantNorm: string }) => ({
  id: tx.id, date: kstDateStr(tx.occurredAt), amount: tx.amount, kind: tx.kind, status: tx.status, excluded: tx.excluded, merchantNorm: tx.merchantNorm,
});
const failure = (message: string): FormState => ({ ok: false, message });

export async function linkRefundAction(user: { id: string }, _: FormState, form: FormData): Promise<FormState> {
  const refundId = String(form.get("refundId") ?? "");
  const originalId = String(form.get("originalId") ?? "");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async db => {
        const refund = await db.transaction.findFirst({ where: { id: refundId, userId: user.id } });
        const original = await db.transaction.findFirst({ where: { id: originalId, userId: user.id },
          include: { refunds: { where: { userId: user.id }, select: { amount: true } } } });
        if (!refund || !original) return failure("연결할 거래를 찾지 못했어요.");
        if (refund.refundOfId === original.id) return { ok: true, message: "이미 연결된 환불이에요." };
        if (refund.refundOfId) return failure("기존 연결을 먼저 해제해 주세요.");
        const linkedAmount = original.refunds.reduce((sum, item) => sum + Math.max(0, item.amount), 0);
        if (!canLinkRefund(view(refund), { ...view(original), linkedAmount }))
          return failure("거래 상태나 남은 원금이 바뀌었어요. 후보를 새로 조회해 주세요.");
        const changed = await db.transaction.updateMany({ where: { id: refundId, userId: user.id, refundOfId: null }, data: { refundOfId: original.id } });
        return changed.count === 1 ? { ok: true, message: "환불 원거래를 연결했어요. 기존 지출과 수입 합계는 그대로예요." }
          : failure("연결 상태가 바뀌었어요. 다시 조회해 주세요.");
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034") throw error;
      if (attempt === 2) return failure("다른 저장이 진행 중이에요. 잠시 후 다시 시도해 주세요.");
    }
  }
  return failure("다시 시도해 주세요.");
}

export async function unlinkRefundAction(user: { id: string }, id: string): Promise<FormState> {
  const changed = await prisma.transaction.updateMany({ where: { id, userId: user.id, refundOfId: { not: null } }, data: { refundOfId: null } });
  return changed.count ? { ok: true, message: "환불 연결을 해제했어요." } : failure("연결된 환불을 찾지 못했어요.");
}

export async function loadRefunds(userId: string, month: string) {
  const range = monthRange(month);
  const refunds = await prisma.transaction.findMany({ where: { userId, occurredAt: { gte: range.start, lt: range.end },
    OR: [{ kind: "INCOME", amount: { gt: 0 }, status: "APPROVED", excluded: false }, { refundOfId: { not: null } }] },
    include: { refundOriginal: { select: { id: true, userId: true, occurredAt: true, merchantNorm: true, amount: true, status: true, excluded: true, kind: true, refunds: { where: { userId }, select: { amount: true } } } } },
    orderBy: [{ occurredAt: "desc" }, { id: "asc" }] });
  const originals = await prisma.transaction.findMany({ where: { userId, kind: "EXPENSE", amount: { lt: 0 }, status: "APPROVED", excluded: false,
    occurredAt: { gte: kstStartOfDay(addDays(range.first, -180)), lt: range.end } },
    include: { refunds: { where: { userId }, select: { amount: true } } } });
  const candidates = originals.map(tx => ({ ...view(tx), linkedAmount: tx.refunds.reduce((sum, r) => sum + Math.max(0, r.amount), 0) }));
  return refunds.map(refund => ({ ...view(refund), needsReview: !!refund.refundOriginal && (
    refund.status !== "APPROVED" || refund.excluded || refund.kind !== "INCOME" || refund.amount <= 0 ||
    refund.refundOriginal.status !== "APPROVED" || refund.refundOriginal.excluded || refund.refundOriginal.kind !== "EXPENSE" ||
    refund.refundOriginal.refunds.reduce((sum, item) => sum + Math.max(0, item.amount), 0) > -refund.refundOriginal.amount), original: refund.refundOriginal?.userId === userId ? view(refund.refundOriginal) : null,
    candidates: refund.refundOfId ? [] : refundCandidates(view(refund), candidates) }));
}
