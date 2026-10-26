"use client";

import { useSyncExternalStore } from "react";
import { syncAge, syncTimestamp } from "@/lib/sync-time";

let now: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();
const tick = () => { now = Date.now(); listeners.forEach((listener) => listener()); };
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    tick();
    timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer) clearInterval(timer);
      timer = null; now = null;
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    }
  };
}

/** 모든 계정이 하나의 시계를 공유한다. SSR/최초 hydration은 같은 절대 시각을 쓴다. */
export function SyncTime({ at, suffix = "", empty = "대기" }: { at: string | null; suffix?: string; empty?: string }) {
  const current = useSyncExternalStore(subscribe, () => now, () => null);
  const exact = syncTimestamp(at);
  if (!exact) return <span>{empty}</span>;
  return <time dateTime={at!} title={`${exact} (한국시간)`}>{current === null ? exact : syncAge(at, current)}{suffix}</time>;
}
