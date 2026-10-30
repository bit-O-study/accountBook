import { describe, it, expect } from "vitest";
import { syncAge, syncTimestamp } from "./sync-time";

describe("마지막 동기화 경과 시간", () => {
  const iso = "2026-10-26T00:00:00.000Z";
  const at = Date.parse(iso);
  it("초·분·시간·날짜 경계를 올바르게 표시한다", () => {
    for (const [seconds, label] of [[0, "방금"], [9, "방금"], [10, "10초 전"], [59, "59초 전"], [60, "1분 전"], [3599, "59분 전"], [3600, "1시간 전"], [86400, "1일 전"]] as const) {
      expect(syncAge(iso, at + seconds * 1000)).toBe(label);
    }
  });
  it("빈 값·잘못된 값·시계 차이를 안전하게 처리한다", () => {
    expect(syncAge(null, at)).toBeNull(); expect(syncAge("invalid", at)).toBeNull();
    expect(syncAge(iso, at - 5000)).toBe("방금");
    expect(syncTimestamp("invalid")).toBeNull();
  });
  it("상세 시각은 한국시간으로 보여준다", () => {
    expect(syncTimestamp(iso)).toContain("09:00:00");
  });
});
