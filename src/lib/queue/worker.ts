import { Worker, UnrecoverableError, type Job } from "bullmq";
import { prisma } from "../db";
import { afterDataChange, syncAccount, syncUser } from "../sync/service";
import { runInWorker } from "./context";
import { queueConfig, retained, SHARDS, type SyncRequest } from "./config";
import { closeQueueClients, enqueueSync, getQueue } from "./client";

async function processRequest(data: SyncRequest) {
  if (!data || typeof data.userId !== "string" || !["account", "user", "reconcile"].includes(data.kind))
    throw new UnrecoverableError("INVALID_SYNC_REQUEST");
  const user = await prisma.user.findUnique({ where: { id: data.userId }, select: { id: true } });
  if (!user) return { skipped: true };
  if (data.kind === "account") {
    const account = await prisma.linkedAccount.findFirst({ where: { id: data.accountId, userId: data.userId } });
    if (!account) return { skipped: true, ok: false, error: "계정을 찾지 못했어요.", retryable: false };
    if (account.syncStatus === "REAUTH") return { ok: false, error: "다시 연결해 주세요.", retryable: false };
    const result = await syncAccount(account.id);
    await afterDataChange(data.userId);
    if (!result.ok && result.retryable) throw new Error("SYNC_TRANSIENT_FAILURE");
    return result;
  }
  if (data.kind === "user") {
    if (typeof data.onlyStale !== "boolean") throw new UnrecoverableError("INVALID_SYNC_REQUEST");
    const result = await syncUser(data.userId, { onlyStale: data.onlyStale });
    if (result.retryableFailures) throw new Error("SYNC_TRANSIENT_FAILURE");
    return result;
  }
  await afterDataChange(data.userId);
  return null;
}

export async function startQueueWorkers(options: { onActive?: (job: Job) => Promise<void>; lockDuration?: number; stalledInterval?: number } = {}) {
  const { prefix, connection, interval, retryMs } = queueConfig();
  const workers: Worker[] = [];
  const names = ["dispatch", ...Array.from({ length: SHARDS }, (_, index) => `sync-${index}`)];
  try {
    for (const name of names) {
      const { queue } = getQueue(name);
      await queue.waitUntilReady();
      await queue.setGlobalConcurrency(1);
      const worker = new Worker(name, async job => {
        await options.onActive?.(job);
        return runInWorker(async () => {
          if (name !== "dispatch") return processRequest(job.data);
          if (job.name !== "dispatch") throw new UnrecoverableError("INVALID_DISPATCH");
          const users = await prisma.user.findMany({ select: { id: true } });
          for (const user of users) await enqueueSync({ kind: "user", userId: user.id, onlyStale: false });
          return { queued: users.length };
        });
      }, {
        prefix, connection: { ...connection, maxRetriesPerRequest: null }, concurrency: 1, name: `accountbook-${process.pid}`,
        lockDuration: options.lockDuration ?? 30000, stalledInterval: options.stalledInterval ?? 30000, maxStalledCount: 2,
      });
      worker.on("error", () => { console.error("[queue] Redis or worker error; awaiting recovery"); });
      worker.on("failed", job => { console.error(`[queue] failed ${job?.name ?? "unknown"} attempt=${job?.attemptsMade ?? 0}`); });
      worker.on("completed", job => { console.log(`[queue] completed ${job.name}`); });
      workers.push(worker);
      await worker.waitUntilReady();
    }
    await getQueue("dispatch").queue.upsertJobScheduler("sync-every-30-minutes", { every: interval }, {
      name: "dispatch", data: {}, opts: { attempts: 3, backoff: { type: "exponential", delay: retryMs }, ...retained },
    });
  } catch (error) {
    await Promise.allSettled(workers.map(worker => worker.close(true)));
    await closeQueueClients(); throw error;
  }
  console.log(`[queue] Ready; ${SHARDS} shards, interval=${interval}ms`);
  return { workers, close: async () => {
    await Promise.all(workers.map(worker => worker.close()));
    await closeQueueClients();
  } };
}
