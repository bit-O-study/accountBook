import { describe, expect, it } from "vitest";
import { deliveryWindow, nextDeliveryTime, summary, validateSubscription } from "./policy";
const at = (time: string) => new Date(`2026-10-25T${time}:00+09:00`);
describe("external notification policy", () => {
  it("blocks quiet hours at exact KST boundaries", () => {
    for (const time of ["00:00", "07:59", "22:00", "23:59"]) expect(deliveryWindow(at(time))).toBeNull();
    for (const time of ["08:00", "12:59", "13:00", "18:59", "19:00", "21:59"]) expect(deliveryWindow(at(time))).not.toBeNull();
  });
  it("uses exactly three slots even after downtime", () => {
    const keys = Array.from({ length: 24 }, (_, h) => deliveryWindow(at(`${h}`.padStart(2, "0") + ":30"))?.key).filter(Boolean);
    expect(new Set(keys).size).toBe(3);
    expect(deliveryWindow(at("16:00"))?.key).toBe("2026-10-25-13");
    expect(deliveryWindow(at("21:59"))?.expiresAt.toISOString()).toBe("2026-10-25T13:00:00.000Z");
  });
  it("rolls the next slot into tomorrow without UTC date confusion", () => {
    expect(nextDeliveryTime(at("23:00")).toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(nextDeliveryTime(at("08:00")).toISOString()).toBe("2026-10-25T04:00:00.000Z");
  });
  it("keeps financial details out of the external summary", () => {
    expect(summary(5)).toEqual({ title: "가계부 알림", body: "확인할 새 알림이 5건 있어요. 가계부에서 확인해 주세요.", href: "/notifications" });
  });
  it("rejects internal, spoofed and credential-bearing push URLs", () => {
    const keys = { p256dh: Buffer.alloc(65, 4).toString("base64url"), auth: Buffer.alloc(16, 1).toString("base64url") };
    for (const endpoint of ["http://127.0.0.1/x", "https://localhost/x", "https://fcm.googleapis.com.evil.example/x", "https://user@fcm.googleapis.com/x"])
      expect(() => validateSubscription(JSON.stringify({ endpoint, keys }))).toThrow();
    expect(validateSubscription(JSON.stringify({ endpoint: "https://fcm.googleapis.com/fcm/send/test", keys })).auth).toBe(keys.auth);
  });
});
