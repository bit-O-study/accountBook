// 서버 안 30분 자동 동기화 (DESIGN §3 수집, §8 동기화 1단계).
// API 분리 또는 Redis + BullMQ 모드에서는 해당 프로세스가 동기화를 담당한다.

const g = globalThis as unknown as { __syncTimer?: ReturnType<typeof setInterval>; __syncRunning?: boolean };

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.ACCOUNTBOOK_API_URL) return;
  const { queueEnabled } = await import("@/lib/queue/config");
  if (queueEnabled()) return;
  // 개발 모드에서 다시 불려도 타이머는 하나만
  if (g.__syncTimer) return;

  const { SYNC_INTERVAL_MS, syncAllUsers } = await import("@/lib/sync/service");
  const interval = Number(process.env.SYNC_INTERVAL_MS) > 0 ? Number(process.env.SYNC_INTERVAL_MS) : SYNC_INTERVAL_MS;

  const run = async () => {
    if (g.__syncRunning) {
      console.log("[sync] 이전 동기화가 아직 진행 중이라 이번 차례는 건너뜀");
      return;
    }
    g.__syncRunning = true;
    const started = Date.now();
    console.log(`[sync] 시작 ${new Date().toISOString()}`);
    try {
      await syncAllUsers();
      console.log(`[sync] 완료 ${Date.now() - started}ms`);
    } catch (e) {
      console.error("[sync] 실패", e instanceof Error ? e.message : e);
    } finally {
      g.__syncRunning = false;
    }
  };

  g.__syncTimer = setInterval(run, interval);
  console.log(`[sync] 자동 동기화 켜짐: ${Math.round(interval / 1000)}초마다`);
}
