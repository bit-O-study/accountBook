import { createHash, randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { capabilities, liveTransport, type NotificationTransport } from "./transport";
import { SettingsError, validateSubscription } from "./policy";
import { notificationTransaction } from "./transaction";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const codeHash = (userId: string, email: string, code: string) => hash(`${userId}:${email}:${code}`);
export async function loadNotificationSettings(userId: string) {
  const [preference, subscriptions, user, recent] = await Promise.all([
    prisma.notificationPreference.findUnique({ where: { userId } }),
    prisma.pushSubscription.findMany({ where: { userId }, select: { id: true, createdAt: true } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } }),
    prisma.notificationDelivery.findMany({ where: { batch: { userId } }, orderBy: { retryAt: "desc" }, take: 10,
      select: { id: true, channel: true, status: true, sentAt: true, errorCode: true } }),
  ]);
  return { email: user.email, emailEnabled: preference?.emailEnabled ?? false,
    codePending: !!preference?.codeHash && !!preference.codeExpiresAt && preference.codeExpiresAt > new Date(),
    subscriptions, recent, capabilities: capabilities() };
}
export async function changeNotificationSettings(userId: string, data: Record<string, string>, options: {
  now?: Date; transport?: NotificationTransport; available?: { email: boolean; push: boolean };
} = {}) {
  const now = options.now ?? new Date(), transport = options.transport ?? liveTransport, available = options.available ?? capabilities();
  if (Object.keys(data).some(key => !["operation", "subscription", "id", "code"].includes(key))) throw new SettingsError("입력 항목을 확인해 주세요.");
  if (data.operation === "subscribe") {
    if (!available.push) throw new SettingsError("푸시 발송이 아직 준비되지 않았어요.");
    const subscription = validateSubscription(data.subscription || "");
    await notificationTransaction(async tx => {
      const existing = await tx.pushSubscription.findUnique({ where: { endpoint: subscription.endpoint } });
      if (existing && existing.userId !== userId) throw new SettingsError("이 브라우저는 다른 계정에 연결돼 있어요. 기존 계정에서 알림을 해제해 주세요.");
      if (existing) return;
      if (await tx.pushSubscription.count({ where: { userId } }) >= 5) throw new SettingsError("브라우저는 최대 5개까지 연결할 수 있어요.");
      await tx.pushSubscription.create({ data: { ...subscription, userId, createdAt: now } });
    }); return "이 브라우저에서 알림을 받아요.";
  }
  if (data.operation === "unsubscribe") {
    await notificationTransaction(async tx => {
      const sub = await tx.pushSubscription.findFirst({ where: { id: data.id || "", userId } });
      if (!sub) throw new SettingsError("내 푸시 구독을 선택해 주세요.");
      await tx.notificationDelivery.updateMany({ where: { batch: { userId }, channel: "PUSH", target: sub.id, status: "READY" }, data: { status: "CANCELED" } });
      await tx.pushSubscription.delete({ where: { id: sub.id } });
    }); return "브라우저 알림을 해제했어요.";
  }
  if (data.operation === "emailOff") {
    await notificationTransaction(async tx => {
      await tx.notificationPreference.updateMany({ where: { userId }, data: { emailEnabled: false, emailEnabledAt: null, codeHash: null, codeExpiresAt: null } });
      await tx.notificationDelivery.updateMany({ where: { batch: { userId }, channel: "EMAIL", status: "READY" }, data: { status: "CANCELED" } });
    }); return "이메일 알림을 껐어요.";
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.email) throw new SettingsError("로그인 이메일이 필요해요.");
  if (data.operation === "emailRequest") {
    if (!available.email) throw new SettingsError("이메일 발송이 아직 준비되지 않았어요.");
    const code = String(randomInt(0, 1000000)).padStart(6, "0");
    const digest = codeHash(userId, user.email, code);
    await notificationTransaction(async tx => {
      const pref = await tx.notificationPreference.upsert({ where: { userId }, create: { userId }, update: {} });
      const sameWindow = pref.requestWindow && now.getTime() - pref.requestWindow.getTime() < 15 * 60000;
      if (pref.requestAt && now.getTime() - pref.requestAt.getTime() < 60000 || sameWindow && pref.requestCount >= 3)
        throw new SettingsError("확인 메일을 자주 요청했어요. 잠시 후 다시 시도해 주세요.");
      await tx.notificationPreference.update({ where: { userId }, data: { codeHash: digest,
        codeExpiresAt: new Date(now.getTime() + 10 * 60000), codeAttempts: 0, requestAt: now,
        requestWindow: sameWindow ? pref.requestWindow : now, requestCount: sameWindow ? pref.requestCount + 1 : 1 } });
    });
    try { await transport.verification(user.email, code); }
    catch {
      await prisma.notificationPreference.updateMany({ where: { userId, codeHash: digest }, data: { codeHash: null, codeExpiresAt: null } });
      throw new SettingsError("확인 메일을 보내지 못했어요. 잠시 후 다시 요청해 주세요.");
    }
    return "이메일로 보낸 6자리 코드를 입력해 주세요.";
  }
  if (data.operation === "emailVerify") {
    if (!available.email) throw new SettingsError("이메일 발송이 아직 준비되지 않았어요.");
    const ok = await notificationTransaction(async tx => {
      const pref = await tx.notificationPreference.findUnique({ where: { userId } });
      if (!pref?.codeHash || !pref.codeExpiresAt || pref.codeExpiresAt <= now || pref.codeAttempts >= 5) return false;
      await tx.notificationPreference.update({ where: { userId }, data: { codeAttempts: { increment: 1 } } });
      if (!/^\d{6}$/.test(data.code || "") || pref.codeHash !== codeHash(userId, user.email!, data.code)) return false;
      await tx.notificationPreference.update({ where: { userId }, data: {
        emailEnabled: true, emailVerifiedAddress: user.email, emailEnabledAt: now, codeHash: null, codeExpiresAt: null,
      } }); return true;
    });
    if (!ok) throw new SettingsError("코드가 맞지 않거나 만료됐어요. 코드를 확인하거나 다시 요청해 주세요.");
    return "이메일 알림을 켰어요.";
  }
  throw new SettingsError("지원하지 않는 알림 설정이에요.");
}

export async function notificationSettingsAction(user: { id: string }, _previous: unknown, form: FormData) {
  try {
    const data = Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, String(value)]));
    return { ok: true, message: await changeNotificationSettings(user.id, data) };
  } catch (error) {
    const internal = !(error instanceof SettingsError);
    return { ok: false, message: internal ? "알림 설정을 저장하지 못했어요. 다시 시도해 주세요." : error instanceof Error ? error.message : "알림 설정을 저장하지 못했어요." };
  }
}
