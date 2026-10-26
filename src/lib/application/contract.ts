import { isValidDateStr, isValidMonthKey } from "../dates";
import { commandNames, formCommands, scalarCommands, type CommandName } from "./command-names";
import type * as Commands from "./commands";
import type * as Reads from "./read";

export class InputError extends Error {}
export const queryNames = ["loadTransaction", "loadRefunds", "loadInstallments", "loadNotificationSettings", "categories", "loadTransactions", "loadOccurrences", "loadBudget", "loadMonthSummary", "loadShellInfo", "getSuggestions", "loadAccounts", "loadAccountCounts", "loadRules", "loadNotifications", "loadUnread", "loadOwnBudget"] as const;
export type QueryName = typeof queryNames[number];
export type QueryResult<K extends QueryName> = Awaited<ReturnType<typeof Reads[K]>>;
export type CommandResult<K extends CommandName> = Awaited<ReturnType<typeof Commands[K]>>;
export type Fields = Record<string, string>;

export function fields(input: unknown): Fields {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new InputError("입력 형식을 확인해 주세요.");
  const entries = Object.entries(input);
  if (entries.length > 40 || entries.some(([key, value]) => key.length > 80 || typeof value !== "string" || value.length > 500000))
    throw new InputError("입력 크기와 형식을 확인해 주세요.");
  return Object.fromEntries(entries) as Fields;
}

export function validateQuery(name: string, input: unknown) {
  if (!(queryNames as readonly string[]).includes(name)) throw new InputError("지원하지 않는 조회예요.");
  const data = fields(input);
  if (name === "loadTransaction") {
    if (Object.keys(data).length !== 1 || !/^[A-Za-z0-9_-]{1,128}$/.test(data.id ?? "")) throw new InputError("거래를 확인해 주세요.");
    return data;
  }
  if (Object.keys(data).some(key => !["month", "today"].includes(key))) throw new InputError("지원하지 않는 조회 조건이에요.");
  const monthly = ["loadRefunds", "loadInstallments", "loadTransactions", "loadOccurrences", "loadBudget", "loadMonthSummary", "loadAccountCounts", "loadRules", "loadOwnBudget"];
  if (monthly.includes(name) && !isValidMonthKey(data.month)) throw new InputError("월을 확인해 주세요.");
  if (data.today !== undefined && !isValidDateStr(data.today)) throw new InputError("날짜를 확인해 주세요.");
  return data;
}

export async function runQuery<K extends QueryName>(name: K, userId: string, input: unknown): Promise<QueryResult<K>> {
  const data = validateQuery(name, input);
  const reads = await import("./read");
  const fn = reads[name] as (user: string, month?: string, today?: string) => Promise<unknown>;
  const value = name === "categories" ? await reads.categories()
    : name === "loadTransaction" ? await reads.loadTransaction(userId, data.id)
    : name === "getSuggestions" ? await reads.getSuggestions(userId, data.today)
    : await fn(userId, data.month, data.today);
  return value as QueryResult<K>;
}

export async function runCommand<K extends CommandName>(name: K, userId: string, input: unknown): Promise<CommandResult<K>> {
  if (!(commandNames as readonly string[]).includes(name)) throw new InputError("지원하지 않는 작업이에요.");
  const data = fields(input);
  if (Object.hasOwn(data, "userId")) throw new InputError("사용자는 로그인 정보로 확인해요.");
  const commands = await import("./commands");
  const fn = commands[name] as (...args: unknown[]) => Promise<unknown>;
  let value;
  if ((formCommands as readonly string[]).includes(name)) {
    const form = new FormData();
    for (const [key, value] of Object.entries(data)) form.set(key, value);
    value = await fn({ id: userId }, {}, form);
  } else if ((scalarCommands as readonly string[]).includes(name)) {
    if (!data.value || data.value.length > 500 || Object.keys(data).length !== 1) throw new InputError("대상을 확인해 주세요.");
    value = await fn({ id: userId }, data.value);
  } else {
    if (Object.keys(data).length) throw new InputError("지원하지 않는 입력이에요.");
    value = await fn({ id: userId });
  }
  return value as CommandResult<K>;
}
