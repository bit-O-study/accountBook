import "reflect-metadata";
import { timingSafeEqual } from "node:crypto";
import { Body, Catch, Controller, Get, HttpCode, HttpException, Module, Param, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { ArgumentsHost, CanActivate, ExceptionFilter, ExecutionContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AuthError, findSessionUser } from "../lib/auth/service";
import { runAuth, type AuthOperation } from "../lib/application/auth";
import { InputError, runCommand, runQuery, type QueryName } from "../lib/application/contract";
import type { CommandName } from "../lib/application/command-names";
import { encode } from "../lib/application/wire";
import { prisma } from "../lib/db";
import { SYNC_INTERVAL_MS, syncAllUsers } from "../lib/sync/service";
import { queueEnabled, QueueUnavailableError } from "../lib/queue/config";
import { closeQueueClients, ensureQueueReady } from "../lib/queue/client";

interface Request { headers: Record<string, string | string[] | undefined> }
function sessionToken(req: Request) {
  const value = req.headers.authorization;
  return typeof value === "string" && /^Bearer [a-f0-9]{64}$/.test(value) ? value.slice(7) : undefined;
}
class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const supplied = req.headers["x-accountbook-key"];
    const expected = process.env.ACCOUNTBOOK_API_KEY!;
    if (typeof supplied !== "string" || Buffer.byteLength(supplied) !== Buffer.byteLength(expected)
      || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new UnauthorizedException("서버 인증을 확인해 주세요.");
    return true;
  }
}
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const known = error instanceof InputError || error instanceof AuthError;
    const oversized = (error as { type?: string })?.type === "entity.too.large";
    const malformed = (error as { type?: string })?.type === "entity.parse.failed";
    const status = error instanceof HttpException ? error.getStatus() : error instanceof QueueUnavailableError ? 503 : known || malformed ? 400 : oversized ? 413 : 500;
    if (status === 500) console.error("[api] Request failed", error instanceof Error ? error.constructor.name : "UnknownError");
    host.switchToHttp().getResponse().set("Cache-Control", "no-store").status(status).json({ message: known || error instanceof QueueUnavailableError ? error.message
      : status === 401 ? "다시 로그인해 주세요." : status === 413 ? "입력 파일이 너무 커요." : "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요." });
  }
}
Catch()(Errors);

class ApiController {
  async health() { await prisma.$queryRaw`SELECT 1`; return { data: encode({ ok: true }) }; }
  async auth(req: Request, operation: AuthOperation, body: unknown) {
    return { data: encode(await runAuth(operation, body, sessionToken(req))) };
  }
  async query(req: Request, operation: QueryName, body: unknown) {
    const user = await findSessionUser(sessionToken(req));
    if (!user) throw new UnauthorizedException();
    return { data: encode(await runQuery(operation, user.id, body)) };
  }
  async command(req: Request, operation: CommandName, body: unknown) {
    const user = await findSessionUser(sessionToken(req));
    if (!user) throw new UnauthorizedException();
    return { data: encode(await runCommand(operation, user.id, body)) };
  }
}
// Explicit decorators work with both TypeScript and the esbuild production bundle.
Controller("v1")(ApiController);
UseGuards(ApiKeyGuard)(ApiController);
Get("health")(ApiController.prototype, "health", Object.getOwnPropertyDescriptor(ApiController.prototype, "health")!);
for (const [method, path] of [["auth", "auth"], ["query", "queries"], ["command", "commands"]] as const) {
  const descriptor = Object.getOwnPropertyDescriptor(ApiController.prototype, method)!;
  Post(`${path}/:operation`)(ApiController.prototype, method, descriptor);
  HttpCode(200)(ApiController.prototype, method, descriptor);
  Req()(ApiController.prototype, method, 0);
  Param("operation")(ApiController.prototype, method, 1);
  Body()(ApiController.prototype, method, 2);
}
class ApiModule {}
Module({ controllers: [ApiController] })(ApiModule);

async function main() {
  if (!process.env.ACCOUNTBOOK_API_KEY || process.env.ACCOUNTBOOK_API_KEY.length < 32) throw new Error("ACCOUNTBOOK_API_KEY must contain at least 32 characters");
  const port = Number(process.env.API_PORT || 3300);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid API_PORT");
  const interval = Number(process.env.SYNC_INTERVAL_MS || SYNC_INTERVAL_MS);
  if (!Number.isFinite(interval) || interval <= 0) throw new Error("Invalid SYNC_INTERVAL_MS");
  const queued = queueEnabled();
  if (queued) await ensureQueueReady();
  const app = await NestFactory.create<NestExpressApplication>(ApiModule, { logger: ["error", "warn"] });
  app.useBodyParser("json", { limit: "1mb" });
  app.useGlobalFilters(new Errors());
  app.use((_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => { res.setHeader("Cache-Control", "no-store"); next(); });
  await app.listen(port, process.env.API_HOST || "127.0.0.1");
  let pending: Promise<void> | undefined;
  const timer = queued ? undefined : setInterval(() => {
    if (pending) return;
    pending = syncAllUsers().then(() => { console.log("[api-sync] Complete"); }).catch(() => { console.error("[api-sync] Failed"); }).finally(() => { pending = undefined; });
  }, interval);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true; if (timer) clearInterval(timer);
    await app.close(); await pending; await closeQueueClients(); await prisma.$disconnect();
  };
  process.on("SIGINT", () => { void stop(); });
  process.on("SIGTERM", () => { void stop(); });
  console.log(`[api] Ready on ${process.env.API_HOST || "127.0.0.1"}:${port}; sync ${queued ? "queue" : `interval ${interval}ms`}`);
}
main().catch(async () => { console.error("[api] Startup failed; check API key, port and database configuration"); await closeQueueClients(); await prisma.$disconnect(); process.exitCode = 1; });
