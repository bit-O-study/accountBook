import { Queue, QueueEvents, type Job } from "bullmq";
import { deduplicationId, queueConfig, QueueUnavailableError, retained, shardName, type SyncRequest } from "./config";

interface Client { queue: Queue; events?: QueueEvents }
// BullMQ's default close waits for initial readiness, which never arrives during an outage.
class InterruptibleQueueEvents extends QueueEvents {
  override async close() {
    this.closing ??= this.connection.close(true);
    await this.closing;
    this.closed = true;
  }
}
const global = globalThis as typeof globalThis & { __accountBookQueues?: Map<string, Client> };
const clients = global.__accountBookQueues ??= new Map<string, Client>();

export function getQueue(name: string) {
  const { prefix, connection, retryMs } = queueConfig();
  const key = `${prefix}/${name}`;
  let client = clients.get(key);
  if (!client) {
    const queue = new Queue(name, {
      prefix, connection: { ...connection, maxRetriesPerRequest: 1, enableOfflineQueue: false, commandTimeout: 5000 },
      defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: retryMs }, ...retained },
    });
    queue.on("error", () => { /* caller receives a sanitized connection error */ });
    client = { queue }; clients.set(key, client);
  }
  return client;
}

async function bounded<T>(task: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new QueueUnavailableError()), milliseconds); });
  try { return await Promise.race([task, timeout]); }
  finally { clearTimeout(timer!); }
}

export async function ensureQueueReady() {
  try {
    const { queue } = getQueue("dispatch");
    await bounded(queue.waitUntilReady(), 5000);
    await queue.getJobCounts("waiting");
  } catch { throw new QueueUnavailableError(); }
}

export async function enqueueSync(data: SyncRequest): Promise<Job> {
  try {
    const { queue } = getQueue(shardName(data.userId));
    await bounded(queue.waitUntilReady(), 5000);
    const id = deduplicationId(data);
    return await queue.add(data.kind, data, id ? { deduplication: { id } } : {});
  } catch { throw new QueueUnavailableError(); }
}

export async function requestSync<T>(data: SyncRequest): Promise<T> {
  const client = getQueue(shardName(data.userId));
  const { prefix, connection, waitMs } = queueConfig();
  if (!client.events) {
    client.events = new InterruptibleQueueEvents(client.queue.name, { prefix, connection: { ...connection, maxRetriesPerRequest: null } });
    client.events.on("error", () => {});
  }
  await bounded(client.events.waitUntilReady(), 5000);
  const job = await enqueueSync(data);
  try { return await job.waitUntilFinished(client.events, waitMs) as T; }
  catch {
    // A timeout never removes the job. A delayed retry or another worker may still complete it.
    throw new QueueUnavailableError("동기화가 아직 완료되지 않았어요. 잠시 후 내역을 확인해 주세요.");
  }
}

export async function closeQueueClients() {
  const active = [...clients.values()]; clients.clear();
  await Promise.allSettled(active.flatMap(client => [client.events?.close(), client.queue.close()]));
}
