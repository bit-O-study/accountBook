import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ sendMail: vi.fn(), close: vi.fn(), createTransport: vi.fn(), sendNotification: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: mocks.createTransport } }));
vi.mock("web-push", () => ({ default: { sendNotification: mocks.sendNotification } }));
import { capabilities, liveTransport } from "./transport";
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
function configure() {
  for (const [key, value] of Object.entries({ NOTIFICATION_DELIVERY: "enabled", SMTP_HOST: "smtp.example.com", SMTP_FROM: "notify@example.com", APP_ORIGIN: "https://app.example.com", VAPID_PUBLIC_KEY: "public", VAPID_PRIVATE_KEY: "private", VAPID_SUBJECT: "mailto:admin@example.com" })) vi.stubEnv(key, value);
  mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail, close: mocks.close });
  mocks.sendMail.mockResolvedValue({ rejected: [] });
}
describe("notification transport boundaries", () => {
  it("disables external delivery without explicit configuration", async () => {
    vi.stubEnv("NOTIFICATION_DELIVERY", ""); expect(capabilities().email).toBe(false);
    await expect(liveTransport.email("user@example.com", 3, "id")).rejects.toMatchObject({ kind: "FAILED" });
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });
  it("requires TLS and prevents file or URL content access", async () => {
    configure(); await liveTransport.email("user@example.com", 3, "delivery-id");
    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({ requireTLS: true, disableFileAccess: true, disableUrlAccess: true }));
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: { name: "", address: "user@example.com" }, messageId: "<delivery-id@app.example.com>", text: expect.stringContaining("3건") }));
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("distinguishes explicit SMTP rejection from unknown network outcome", async () => {
    configure(); mocks.sendMail.mockRejectedValue({ responseCode: 451 });
    await expect(liveTransport.email("user@example.com", 1, "id")).rejects.toMatchObject({ kind: "RETRY" });
    mocks.sendMail.mockRejectedValue({ code: "ECONNRESET" });
    await expect(liveTransport.email("user@example.com", 1, "id")).rejects.toMatchObject({ kind: "UNKNOWN" });
  });
  it("sets zero push TTL and distinguishes expired subscriptions", async () => {
    configure(); const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/test", p256dh: "key", auth: "auth" };
    await liveTransport.push(sub, 2, "id");
    expect(mocks.sendNotification).toHaveBeenCalledWith(expect.anything(), expect.stringContaining("2건"), expect.objectContaining({ TTL: 0, timeout: 10000 }));
    mocks.sendNotification.mockRejectedValue({ statusCode: 410 });
    await expect(liveTransport.push(sub, 2, "id")).rejects.toMatchObject({ kind: "GONE" });
  });
});
