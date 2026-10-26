import nodemailer from "nodemailer";
import webpush from "web-push";
import { summary } from "./policy";

export class DeliveryError extends Error {
  constructor(public readonly kind: "RETRY" | "GONE" | "FAILED" | "UNKNOWN") { super(kind); }
}
export interface NotificationTransport {
  verification(address: string, code: string): Promise<void>;
  email(address: string, count: number, id: string): Promise<void>;
  push(subscription: { endpoint: string; p256dh: string; auth: string }, count: number, id: string): Promise<void>;
}
export function capabilities() {
  const enabled = process.env.NOTIFICATION_DELIVERY === "enabled";
  return {
    email: enabled && !!process.env.SMTP_HOST && !!process.env.SMTP_FROM && !!process.env.APP_ORIGIN,
    push: enabled && !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY && !!process.env.VAPID_SUBJECT,
    publicKey: enabled ? process.env.VAPID_PUBLIC_KEY || "" : "",
  };
}
function origin() {
  const url = new URL(process.env.APP_ORIGIN!);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new DeliveryError("FAILED");
  return url.origin;
}
async function mail(address: string, subject: string, text: string, id?: string) {
  if (!capabilities().email) throw new DeliveryError("FAILED");
  const port = Number(process.env.SMTP_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new DeliveryError("FAILED");
  const smtp = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465, requireTLS: true,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true,
  });
  try {
    const result = await smtp.sendMail({ from: process.env.SMTP_FROM, to: { name: "", address }, subject, text,
      ...(id ? { messageId: `<${id}@${new URL(origin()).hostname}>` } : {}) });
    if (result.rejected.length) throw new DeliveryError("FAILED");
  } catch (error) {
    if (error instanceof DeliveryError) throw error;
    const code = (error as { responseCode?: number }).responseCode;
    throw new DeliveryError(code && code >= 400 && code < 500 ? "RETRY" : code && code >= 500 ? "FAILED" : "UNKNOWN");
  } finally { smtp.close(); }
}
export const liveTransport: NotificationTransport = {
  async verification(address, code) {
    await mail(address, "가계부 이메일 알림 확인", `확인 코드는 ${code}입니다. 10분 안에 가계부 알림 설정에 입력해 주세요.\n요청하지 않았다면 이 메일을 무시해 주세요.`);
  },
  async email(address, count, id) {
    if (!capabilities().email) throw new DeliveryError("FAILED");
    const message = summary(count);
    await mail(address, message.title, `${message.body}\n${origin()}/notifications\n\n알림 설정에서 이메일 수신을 끌 수 있어요.`, id);
  },
  async push(subscription, count, id) {
    if (!capabilities().push) throw new DeliveryError("FAILED");
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify({ ...summary(count), count, tag: id }), { TTL: 0, timeout: 10000, urgency: "normal", vapidDetails: {
          subject: process.env.VAPID_SUBJECT!, publicKey: process.env.VAPID_PUBLIC_KEY!, privateKey: process.env.VAPID_PRIVATE_KEY!,
        } });
    } catch (error) {
      const code = (error as { statusCode?: number }).statusCode;
      throw new DeliveryError(code === 404 || code === 410 ? "GONE" : code === 429 || (code && code >= 500) ? "RETRY" : code ? "FAILED" : "UNKNOWN");
    }
  },
};
