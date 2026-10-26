import { query } from "./gateway";
export { requireUser as getUser } from "../auth/request";
// userId is retained in the page-facing signatures; the gateway always uses the session owner.
export const loadTransactions = (_userId: string, month: string) => query("loadTransactions", { month });
export const loadOccurrences = (_userId: string, month: string) => query("loadOccurrences", { month });
export const loadBudget = (_userId: string, month: string) => query("loadBudget", { month });
export const loadMonthSummary = (_userId: string, month: string, today?: string) => query("loadMonthSummary", { month, ...(today ? { today } : {}) });
export const loadShellInfo = (_userId: string) => query("loadShellInfo");
export const getSuggestions = (_userId: string, today?: string) => query("getSuggestions", today ? { today } : {});
export const loadAccounts = (_userId: string) => query("loadAccounts");
export const loadAccountCounts = (_userId: string, month: string) => query("loadAccountCounts", { month });
export const loadRules = (_userId: string, month: string) => query("loadRules", { month });
export const loadNotifications = (_userId: string) => query("loadNotifications");
export const loadUnread = (_userId: string) => query("loadUnread");
export const loadOwnBudget = (_userId: string, month: string) => query("loadOwnBudget", { month });
export async function categoryMaps() {
  const list = await query("categories");
  return { list, byName: new Map(list.map(c => [c.name, c.id])), byId: new Map(list.map(c => [c.id, c.name])) };
}
