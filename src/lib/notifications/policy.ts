import { addDays, kstDateStr, kstDateTime, kstTimeStr } from "../dates";

/** KST: at most three batches per day. Late starts use only the current slot. */
export function deliveryWindow(now: Date) {
  const day = kstDateStr(now), hour = Number(kstTimeStr(now).slice(0, 2));
  if (hour < 8 || hour >= 22) return null;
  const slot = hour >= 19 ? 19 : hour >= 13 ? 13 : 8;
  const end = slot === 8 ? 13 : slot === 13 ? 19 : 22;
  return { key: `${day}-${slot}`, startsAt: kstDateTime(day, `${String(slot).padStart(2, "0")}:00`), expiresAt: kstDateTime(day, `${end}:00`) };
}
export function nextDeliveryTime(now: Date) {
  const day = kstDateStr(now), time = kstTimeStr(now);
  for (const slot of ["08:00", "13:00", "19:00"]) if (time < slot) return kstDateTime(day, slot);
  return kstDateTime(addDays(day, 1), "08:00");
}
export function summary(count: number) {
  return { title: "가계부 알림", body: `확인할 새 알림이 ${count}건 있어요. 가계부에서 확인해 주세요.`, href: "/notifications" };
}
export class SettingsError extends Error {}
export function validateSubscription(value: string) {
  if (value.length > 4096) throw new SettingsError("푸시 구독 정보를 확인해 주세요.");
  const parsed = JSON.parse(value);
  const endpoint = new URL(parsed.endpoint);
  // Only known browser push services; never fetch arbitrary user-supplied addresses.
  const host = endpoint.hostname;
  const trusted = host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com"
    || host === "web.push.apple.com" || /^[a-z0-9-]+\.notify\.windows\.com$/.test(host);
  if (!trusted || endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.port || endpoint.hash
    || endpoint.href.length > 2048) throw new SettingsError("지원하지 않는 푸시 주소예요.");
  const p256dh = parsed.keys?.p256dh, auth = parsed.keys?.auth;
  if (typeof p256dh !== "string" || typeof auth !== "string" || !/^[A-Za-z0-9_-]+={0,2}$/.test(p256dh)
    || !/^[A-Za-z0-9_-]+={0,2}$/.test(auth) || Buffer.from(p256dh, "base64url").length !== 65
    || Buffer.from(auth, "base64url").length !== 16) throw new SettingsError("푸시 구독 키를 확인해 주세요.");
  return { endpoint: endpoint.href, p256dh, auth };
}
