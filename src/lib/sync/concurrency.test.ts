import { describe, expect, it, vi } from "vitest";
import { enqueue, shareInFlight } from "./concurrency";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("계정 동기화 실행 공유", () => {
  it("동시에 들어온 요청은 하나만 실행하고 같은 결과를 받는다", async () => {
    const pending = new Map<string, Promise<number>>();
    const gate = deferred<number>();
    const run = vi.fn(() => gate.promise);
    const jobs = Array.from({ length: 20 }, () => shareInFlight(pending, "card", run));
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);
    expect(new Set(jobs).size).toBe(1);
    gate.resolve(7);
    expect(await Promise.all(jobs)).toEqual(Array(20).fill(7));
    expect(pending.size).toBe(0);
    expect(await shareInFlight(pending, "card", async () => 8)).toBe(8);
  });

  it("느린 계정이 다른 계정을 막지 않는다", async () => {
    const pending = new Map<string, Promise<number>>();
    const gate = deferred<number>();
    const slow = shareInFlight(pending, "slow", () => gate.promise);
    expect(await shareInFlight(pending, "fast", async () => 2)).toBe(2);
    expect(pending.has("slow")).toBe(true);
    gate.resolve(1);
    await slow;
    expect(pending.size).toBe(0);
  });

  it("실패를 모든 대기자에게 전달하고 다음 호출에서 재시도한다", async () => {
    const pending = new Map<string, Promise<number>>();
    const gate = deferred<number>();
    const jobs = [shareInFlight(pending, "card", () => gate.promise), shareInFlight(pending, "card", async () => 0)];
    const outcomes = Promise.allSettled(jobs);
    const error = new Error("provider failed");
    gate.reject(error);
    expect(await outcomes).toEqual(Array(2).fill({ status: "rejected", reason: error }));
    expect(pending.size).toBe(0);
    expect(await shareInFlight(pending, "card", async () => 3)).toBe(3);
  });

  it("동기 예외도 실행 기록을 남기지 않는다", async () => {
    const pending = new Map<string, Promise<number>>();
    await expect(shareInFlight(pending, "card", () => { throw new Error("setup failed"); })).rejects.toThrow("setup failed");
    expect(pending.size).toBe(0);
  });
});

describe("변경 후처리 순차 실행", () => {
  it("후속 변경을 생략하지 않고 앞 작업이 끝난 뒤 조회한다", async () => {
    const tails = new Map<string, Promise<unknown>>();
    const gate = deferred<void>();
    const started = deferred<void>();
    let data = 1;
    const seen: number[] = [];
    const first = enqueue(tails, "user", async () => { seen.push(data); started.resolve(); await gate.promise; });
    await started.promise;
    data = 2;
    const second = enqueue(tails, "user", async () => { seen.push(data); });
    await Promise.resolve();
    expect(seen).toEqual([1]);
    gate.resolve();
    await Promise.all([first, second]);
    expect(seen).toEqual([1, 2]);
    expect(tails.size).toBe(0);
  });

  it("앞 작업 실패 후에도 대기 중인 작업을 실행한다", async () => {
    const tails = new Map<string, Promise<unknown>>();
    const gate = deferred<void>();
    const first = enqueue(tails, "user", () => gate.promise);
    const second = enqueue(tails, "user", async () => 2);
    const outcomes = Promise.allSettled([first, second]);
    gate.reject(new Error("reconcile failed"));
    const result = await outcomes;
    expect(result[0].status).toBe("rejected");
    expect(result[1]).toEqual({ status: "fulfilled", value: 2 });
    expect(tails.size).toBe(0);
  });

  it("다른 사용자의 후처리는 독립적으로 실행한다", async () => {
    const tails = new Map<string, Promise<unknown>>();
    const gate = deferred<void>();
    const first = enqueue(tails, "a", () => gate.promise);
    expect(await enqueue(tails, "b", async () => 9)).toBe(9);
    expect(tails.has("a")).toBe(true);
    gate.resolve(); await first;
    expect(tails.size).toBe(0);
  });
});
