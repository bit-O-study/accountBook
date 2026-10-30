import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { deliveryWindow } from "./policy";
import { DeliveryError, liveTransport, type NotificationTransport } from "./transport";
import { notificationTransaction } from "./transaction";

async function createBatch(userId: string, now: Date) {
  const window = deliveryWindow(now); if (!window) return;
  try {
    await notificationTransaction(async tx => {
      if (await tx.notificationBatch.findUnique({ where: { userId_slot: { userId, slot: window.key } } })) return;
      const [user, pref, subscriptions, previous] = await Promise.all([
        tx.user.findUniqueOrThrow({ where: { id: userId } }),
        tx.notificationPreference.findUnique({ where: { userId } }),
        tx.pushSubscription.findMany({ where: { userId } }),
        tx.notificationBatch.findFirst({ where: { userId }, orderBy: { cutoff: "desc" } }),
      ]);
      const targets: { channel: string; target: string; enabledAt: Date }[] = subscriptions.map(s => ({ channel: "PUSH", target: s.id, enabledAt: s.createdAt }));
      if (pref?.emailEnabled && pref.emailEnabledAt && pref.emailVerifiedAddress === user.email && user.email)
        targets.push({ channel: "EMAIL", target: user.email, enabledAt: pref.emailEnabledAt });
      const deliveries = [];
      for (const target of targets) {
        const since = new Date(Math.max(target.enabledAt.getTime(), previous?.cutoff.getTime() ?? 0));
        const count = await tx.notification.count({ where: { userId, readAt: null, createdAt: { gt: since, lte: window.startsAt } } });
        if (count) deliveries.push({ channel: target.channel, target: target.target, count, retryAt: now });
      }
      if (!deliveries.length) return;
      await tx.notificationBatch.create({ data: { userId, slot: window.key, cutoff: window.startsAt, expiresAt: window.expiresAt, deliveries: { create: deliveries } } });
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
  }
}

export async function dispatchNotifications(options: { now?: () => Date; transport?: NotificationTransport } = {}) {
  const clock = options.now ?? (() => new Date()), transport = options.transport ?? liveTransport;
  const now = clock();
  // After a crash, never repeat a possibly accepted external send.
  await prisma.notificationDelivery.updateMany({ where: { status: "SENDING", startedAt: { lt: new Date(now.getTime() - 120000) } }, data: { status: "UNKNOWN", errorCode: "INTERRUPTED" } });
  await prisma.notificationDelivery.updateMany({ where: { status: "READY", batch: { expiresAt: { lte: now } } }, data: { status: "FAILED", errorCode: "WINDOW_EXPIRED" } });
  if (!deliveryWindow(now)) return;
  const users = await prisma.user.findMany({ where: { OR: [ { notificationPreference: { emailEnabled: true } }, { pushSubscriptions: { some: {} } } ] }, select: { id: true } });
  for (const user of users) await createBatch(user.id, now);
  const pending = await prisma.notificationDelivery.findMany({ where: { status: "READY", retryAt: { lte: now }, batch: { expiresAt: { gt: now } } }, orderBy: { retryAt: "asc" }, take: 100 });
  for (const delivery of pending) {
    const started = clock(); if (!deliveryWindow(started)) break;
    const claimed = await prisma.notificationDelivery.updateMany({ where: { id: delivery.id, status: "READY", batch: { expiresAt: { gt: started } } },
      data: { status: "SENDING", startedAt: started, attempts: { increment: 1 } } });
    if (!claimed.count) continue;
    const batch = await prisma.notificationBatch.findUniqueOrThrow({ where: { id: delivery.batchId } });
    try {
      if (delivery.channel === "EMAIL") {
        const pref = await prisma.notificationPreference.findUnique({ where: { userId: batch.userId }, include: { user: true } });
        if (!pref?.emailEnabled || pref.emailVerifiedAddress !== delivery.target || pref.user.email !== delivery.target) {
          await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: "CANCELED" } }); continue;
        }
        if (!deliveryWindow(clock()) || clock() >= batch.expiresAt) throw new DeliveryError("FAILED");
        await transport.email(delivery.target, delivery.count, delivery.id);
      } else {
        const sub = await prisma.pushSubscription.findFirst({ where: { id: delivery.target, userId: batch.userId } });
        if (!sub) { await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: "CANCELED" } }); continue; }
        if (!deliveryWindow(clock()) || clock() >= batch.expiresAt) throw new DeliveryError("FAILED");
        await transport.push(sub, delivery.count, delivery.id);
      }
      await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: "SENT", sentAt: clock(), errorCode: null } });
    } catch (error) {
      const kind = error instanceof DeliveryError ? error.kind : "UNKNOWN";
      const retryAt = new Date(clock().getTime() + 60000 * 2 ** delivery.attempts);
      const retry = kind === "RETRY" && delivery.attempts + 1 < 3 && retryAt < batch.expiresAt;
      await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: {
        status: retry ? "READY" : kind === "UNKNOWN" ? "UNKNOWN" : "FAILED", errorCode: kind, ...(retry ? { retryAt } : {}),
      } });
      if (kind === "GONE" && delivery.channel === "PUSH") await prisma.pushSubscription.deleteMany({ where: { id: delivery.target, userId: batch.userId } });
    }
  }
}
