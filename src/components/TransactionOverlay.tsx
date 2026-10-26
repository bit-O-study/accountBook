"use client";
import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { TransactionDetail } from "@/lib/application/queries";
import type { CategoryOption } from "./AddTransaction";
import { TxDetail } from "./TxList";
import { Modal } from "./Modal";
export function TransactionOverlay({ transaction, categories }: { transaction: TransactionDetail | null; categories: CategoryOption[] }) {
  const router = useRouter();const pathname = usePathname();const params = useSearchParams();
  const close = useCallback(() => {
    const next = new URLSearchParams(params.toString());next.delete("tx");
    router.replace(pathname + (next.size ? "?" + next.toString() : ""), { scroll: false });
  }, [router, pathname, params]);
  return transaction ? <TxDetail key={transaction.id} tx={transaction} categories={categories} onClose={close} /> :
    <Modal open onClose={close} title="거래를 찾지 못했어요"><p>삭제되었거나 열 수 없는 거래예요. 목록에서 다시 선택해 주세요.</p><button className="btn" onClick={close}>목록으로 돌아가기</button></Modal>;
}
