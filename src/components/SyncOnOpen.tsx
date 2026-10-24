"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { syncIfStaleAction } from "@/app/actions";

/** 앱을 열 때 오래된 계정만 한 번 동기화한다 (A-02) */
export function SyncOnOpen() {
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    syncIfStaleAction()
      .then((ran) => {
        if (alive && ran) router.refresh();
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [router]);
  return null;
}
