import type { Prisma } from "@prisma/client";
// 화면용 데이터 조회. 클라이언트 컴포넌트에 넘길 수 있게 Date 는 문자열로 바꾼다.

import { prisma } from "@/lib/db";
import { summarizeMonth } from "@/lib/budget";
import { kstDateStr, kstTimeStr, monthRange, todayStr, type MonthKey } from "@/lib/dates";
import { displayMerchant } from "@/lib/sync/normalize";

export type TxSource = "AUTO" | "MANUAL" | "CSV";

export interface TxView {
  id: string;
  date: string;
  time: string;
  amount: number;
  kind: string;
  status: string;
  excluded: boolean;
  source: TxSource;
  merchant: string;
  merchantNorm: string;
  categoryId: string | null;
  category: string;
  accountName: string | null;
  memo: string | null;
  fixedName: string | null;
  installmentMonths: number;
  firstBillingMonth: string | null;
}

export async function loadTransactions(userId: string, month: MonthKey): Promise<TxView[]> {
  const r = monthRange(month);
  const rows = await prisma.transaction.findMany({
    where: { userId, occurredAt: { gte: r.start, lt: r.end }, NOT: { amount: 0 } },
    include: { category: true, account: true, occurrence: { include: { rule: true } } },
    orderBy: { occurredAt: "desc" },
  });
  return rows.map(transactionView);
}

export async function loadOccurrences(userId: string, month: MonthKey) {
  const r = monthRange(month);
  return prisma.recurringOccurrence.findMany({
    where: { rule: { userId }, dueDate: { gte: r.first, lte: r.last } },
    include: { rule: true },
    orderBy: { dueDate: "asc" },
  });
}

export async function loadBudget(userId: string, month: MonthKey): Promise<number | null> {
  const b = await prisma.budget.findFirst({
    where: { userId, month: { lte: month } },
    orderBy: { month: "desc" },
  });
  return b?.livingAmount ?? null;
}

export async function loadMonthSummary(userId: string, month: MonthKey, today = todayStr()) {
  const [txs, occurrences, budget] = await Promise.all([
    loadTransactions(userId, month),
    loadOccurrences(userId, month),
    loadBudget(userId, month),
  ]);
  const summary = summarizeMonth({
    month,
    today,
    budget,
    txs: txs.map((t) => ({ ...t, recurring: !!t.fixedName })),
    occurrences: occurrences.map((o) => ({
      dueDate: o.dueDate,
      status: o.status,
      amount: o.matchedAmount ?? o.rule.amount,
    })),
  });
  return { txs, occurrences, budget, summary };
}

export async function loadShellInfo(userId: string) {
  const [accounts, unread] = await Promise.all([
    prisma.linkedAccount.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return {
    unread,
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      status: a.syncStatus,
      lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
    })),
  };
}

const transactionInclude = { category: true, account: true, occurrence: { include: { rule: true } } } satisfies Prisma.TransactionInclude;
function transactionView(t: Prisma.TransactionGetPayload<{ include: typeof transactionInclude }>): TxView {
  return ({
    id: t.id,
    date: kstDateStr(t.occurredAt),
    time: kstTimeStr(t.occurredAt),
    amount: t.amount,
    kind: t.kind,
    status: t.status,
    excluded: t.excluded,
    source: t.source as TxSource,
    merchant: displayMerchant(t.merchantRaw),
    merchantNorm: t.merchantNorm,
    categoryId: t.categoryId,
    category: t.category?.name ?? "기타",
    accountName: t.account?.name ?? null,
    memo: t.memo,
    fixedName: t.occurrence?.rule.name ?? null,
    installmentMonths: t.installmentMonths,
    firstBillingMonth: t.firstBillingMonth,
  });
}
export async function loadTransaction(userId: string, id: string) {
  const row = await prisma.transaction.findFirst({ where: { id, userId }, include: transactionInclude });
  if (!row) return null;
  const [original, refunds] = await Promise.all([
    row.refundOfId ? prisma.transaction.findFirst({ where: { id: row.refundOfId, userId }, select: { id: true, occurredAt: true, merchantNorm: true, amount: true, status: true } }) : null,
    prisma.transaction.findMany({ where: { refundOfId: id, userId }, select: { id: true, occurredAt: true, merchantNorm: true, amount: true, status: true }, orderBy: [{ occurredAt: "desc" }, { id: "asc" }] }),
  ]);
  const linkView = (tx: NonNullable<typeof original>) => ({ id: tx.id, date: kstDateStr(tx.occurredAt), merchant: tx.merchantNorm, amount: tx.amount, status: tx.status });
  return { ...transactionView(row), refundOriginal: original ? linkView(original) : null, refunds: refunds.map(linkView) };
}
export type TransactionDetail = NonNullable<Awaited<ReturnType<typeof loadTransaction>>>;
