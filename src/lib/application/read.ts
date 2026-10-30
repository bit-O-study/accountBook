import { prisma } from "../db";
import { monthRange } from "../dates";
export { loadTransactions, loadOccurrences, loadBudget, loadMonthSummary, loadShellInfo } from "./queries";
export { getSuggestions } from "../recurring/service";

export async function categories() {
  return prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function loadAccounts(userId: string) {
  // Authentication material belongs only to the provider service.
  return prisma.linkedAccount.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: {
    id: true, name: true, kind: true, provider: true, syncStatus: true, lastSyncedAt: true,
    lastError: true, failCount: true, createdAt: true,
  } });
}

export async function loadAccountCounts(userId: string, month: string) {
  const r = monthRange(month);
  const [counts, csvCount] = await Promise.all([
    prisma.transaction.groupBy({ by: ["accountId"], where: { userId, occurredAt: { gte: r.start, lt: r.end }, NOT: { amount: 0 } }, _count: true }),
    prisma.transaction.count({ where: { userId, source: "CSV" } }),
  ]);
  return { counts, csvCount };
}

export async function loadRules(userId: string, month: string) {
  const r = monthRange(month);
  return prisma.recurringRule.findMany({ where: { userId }, include: {
    category: true, occurrences: { where: { dueDate: { lte: r.last } }, orderBy: { dueDate: "desc" }, take: 4 },
  }, orderBy: [{ paused: "asc" }, { dueDay: "asc" }] });
}

export async function loadNotifications(userId: string) {
  return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 });
}
export async function loadUnread(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
export async function loadOwnBudget(userId: string, month: string) {
  return prisma.budget.findUnique({ where: { userId_month: { userId, month } } });
}
export { loadNotificationSettings } from "../notifications/service";

export { loadInstallments } from "../installments/service";

export { loadRefunds } from "../refunds/service";

export { loadTransaction } from "./queries";
