import { createHash } from "node:crypto";
import type { RedisOptions } from "ioredis";

export const SHARDS = 8;
export const DEFAULT_INTERVAL = 30 * 60 * 1000;
export class QueueUnavailableError extends Error {
  constructor(message = "동기화 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.") { super(message); }
}
export function queueEnabled() {
  const mode = process.env.SYNC_MODE || "local";
  if (mode !== "local" && mode !== "queue") throw new Error("SYNC_MODE must be local or queue");
  return mode === "queue";
}
export function positiveInteger(value: string | undefined, fallback: number, min = 1, max = 2147483647) {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw new Error("Invalid sync configuration");
  return result;
}
export function queueConfig() {
  const url = new URL(process.env.REDIS_URL || "invalid:");
  if (!["redis:", "rediss:"].includes(url.protocol) || !url.hostname || url.search || url.hash) throw new Error("Set a valid REDIS_URL");
  const db = url.pathname === "" || url.pathname === "/" ? 0 : Number(url.pathname.slice(1));
  if (!Number.isInteger(db) || db < 0) throw new Error("Invalid Redis database");
  const prefix = process.env.SYNC_QUEUE_PREFIX || "accountbook";
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(prefix)) throw new Error("Invalid queue prefix");
  const connection: RedisOptions = {
    host: url.hostname, port: Number(url.port || 6379), db,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    connectTimeout: 3000,
  };
  return {
    prefix, connection,
    interval: positiveInteger(process.env.SYNC_INTERVAL_MS, DEFAULT_INTERVAL),
    waitMs: positiveInteger(process.env.SYNC_QUEUE_WAIT_MS, 90000, 1000, 110000),
    retryMs: positiveInteger(process.env.SYNC_RETRY_DELAY_MS, 1000, 10, 60000),
  };
}
export function shardName(userId: string) {
  return `sync-${createHash("sha256").update(userId).digest().readUInt32BE(0) % SHARDS}`;
}
export const retained = {
  removeOnComplete: { age: 3600, count: 5000 },
  removeOnFail: { age: 86400, count: 5000 },
};
export type SyncRequest =
  | { kind: "account"; userId: string; accountId: string }
  | { kind: "user"; userId: string; onlyStale: boolean }
  | { kind: "reconcile"; userId: string };
export function deduplicationId(data: SyncRequest) {
  // Reconciliation must include changes made while an earlier reconciliation is running.
  return data.kind === "reconcile" ? undefined : createHash("sha256").update(JSON.stringify(data)).digest("hex");
}
