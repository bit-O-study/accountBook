import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_INTERVAL, deduplicationId, positiveInteger, queueEnabled, shardName } from "./config";
const mode = process.env.SYNC_MODE;
afterEach(() => { if (mode === undefined) delete process.env.SYNC_MODE; else process.env.SYNC_MODE = mode; });
describe("queue routing and policy", () => {
  it("keeps every request for one user on a stable shard and distributes users", () => {
    expect(shardName("owner")).toBe(shardName("owner"));
    expect(new Set(Array.from({ length: 100 }, (_, n) => shardName(`user-${n}`))).size).toBe(8);
  });
  it("never deduplicates follow-up reconciliation or merges stale and forced sync", () => {
    expect(deduplicationId({ kind: "reconcile", userId: "owner" })).toBeUndefined();
    expect(deduplicationId({ kind: "user", userId: "owner", onlyStale: true }))
      .not.toBe(deduplicationId({ kind: "user", userId: "owner", onlyStale: false }));
  });
  it("uses 30 minutes by default and rejects invalid configuration instead of falling back", () => {
    expect(DEFAULT_INTERVAL).toBe(1800000);
    expect(positiveInteger(undefined, DEFAULT_INTERVAL)).toBe(DEFAULT_INTERVAL);
    for (const value of ["0", "-1", "NaN", "1.5"]) expect(() => positiveInteger(value, DEFAULT_INTERVAL)).toThrow();
    delete process.env.SYNC_MODE; expect(queueEnabled()).toBe(false);
    process.env.SYNC_MODE = "queue"; expect(queueEnabled()).toBe(true);
    process.env.SYNC_MODE = "typo"; expect(() => queueEnabled()).toThrow();
  });
});
