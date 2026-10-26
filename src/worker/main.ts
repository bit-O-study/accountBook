import { queueEnabled } from "../lib/queue/config";
import { startQueueWorkers } from "../lib/queue/worker";
import { prisma } from "../lib/db";
import { closeQueueClients } from "../lib/queue/client";

async function main() {
  if (!queueEnabled()) throw new Error("Set SYNC_MODE=queue for the worker");
  const worker = await startQueueWorkers();
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true; await worker.close(); await prisma.$disconnect();
  };
  process.on("SIGINT", () => { void stop(); });
  process.on("SIGTERM", () => { void stop(); });
}
main().catch(async () => { console.error("[queue] Startup failed; check queue and database configuration"); await closeQueueClients(); await prisma.$disconnect(); process.exitCode = 1; });
