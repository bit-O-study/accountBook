import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiEnabled, ApiError, requestAPI } from "./transport";
import type { CommandName } from "../application/command-names";
import type { CommandResult, Fields, QueryName, QueryResult } from "../application/contract";
import type { AuthOperation, AuthResult } from "../application/auth";

export const SESSION_COOKIE = "accountbook-session";
async function token() { return (await cookies()).get(SESSION_COOKIE)?.value; }

export async function auth(operation: AuthOperation, data: Fields = {}): Promise<AuthResult> {
  const session = await token();
  if (apiEnabled()) return requestAPI(`/v1/auth/${operation}`, data, session);
  const { runAuth } = await import("../application/auth");
  const { AuthError } = await import("../auth/service");
  try { return await runAuth(operation, data, session); }
  catch (error) {
    if (error instanceof AuthError) throw new ApiError(400, error.message);
    throw error;
  }
}

export async function query<K extends QueryName>(name: K, data: Fields = {}): Promise<QueryResult<K>> {
  if (apiEnabled()) {
    try { return await requestAPI(`/v1/queries/${name}`, data, await token()); }
    catch (error) { if (error instanceof ApiError && error.status === 401) redirect("/login"); throw error; }
  }
  const { requireUser } = await import("../auth/request");
  const { runQuery } = await import("../application/contract");
  return runQuery(name, (await requireUser()).id, data);
}

export async function command<K extends CommandName>(name: K, data: Fields = {}): Promise<CommandResult<K>> {
  if (apiEnabled()) {
    try { return await requestAPI(`/v1/commands/${name}`, data, await token()); }
    catch (error) { if (error instanceof ApiError && error.status === 401) redirect("/login"); throw error; }
  }
  const { requireUser } = await import("../auth/request");
  const { runCommand } = await import("../application/contract");
  return runCommand(name, (await requireUser()).id, data);
}
