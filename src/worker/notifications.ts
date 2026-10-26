import { dispatchNotifications } from "../lib/notifications/dispatch";
import { prisma } from "../lib/db";

async function main() {
  if (process.env.NOTIFICATION_DELIVERY !== "enabled") throw new Error("External delivery is disabled");
  let running: Promise<void> | undefined;
  let stopping = false;
  const tick = () => {
    if (running || stopping) return;
    running = dispatchNotifications().catch(() => console.error("[notifications] Dispatch failed; inspect delivery status"))
      .finally(() => { running = undefined; });
  };
  const timer = setInterval(tick, 60000); tick();
  const stop = async () => { if (stopping) return; stopping = true; clearInterval(timer); await running; await prisma.$disconnect(); };
  process.on("SIGINT", () => { void stop(); }); process.on("SIGTERM", () => { void stop(); });
  console.log("[notifications] Ready; KST 08/13/19 batches");
}
main().catch(async () => { console.error("[notifications] Startup failed; check configuration"); await prisma.$disconnect(); process.exitCode = 1; });
