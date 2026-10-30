"use client";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { linkRefundAction, unlinkRefundAction, type FormState } from "@/app/actions";
import type { loadRefunds } from "@/lib/refunds/service";
import { won } from "@/lib/money";
import { SubmitButton } from "./buttons";

type Refund = Awaited<ReturnType<typeof loadRefunds>>[number];
export function RefundCard({ refund }: { refund: Refund }) {
  const [note, setNote] = useState<FormState | null>(null);
  const [state, action] = useActionState(async (previous: FormState, form: FormData) => {
    setNote(null); return linkRefundAction(previous, form);
  }, {});
  const [pending, start] = useTransition();
  const original = refund.original;
  const message = note ?? state;
  return <article className="card pad" style={{ marginTop: 16, overflowWrap: "anywhere" }}>
    <h2 style={{ fontSize: 18 }}>{refund.merchantNorm} · <span className="plus">{won(refund.amount)}원</span></h2>
    <p className="faint">입금 {refund.date} · 기존 수입으로 집계</p>
    {original ? <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
      <b>연결된 원거래</b>
      <Link href={"/transactions?month=" + original.date.slice(0, 7) + "&tx=" + encodeURIComponent(original.id)}>{original.date} · {original.merchantNorm} · {won(-original.amount)}원</Link>
      {refund.needsReview &&
        <p className="form-msg err">연결 뒤 거래 상태가 바뀌었어요. 원거래를 확인하고 필요하면 연결을 해제하세요.</p>}
      <button className="btn sm" disabled={pending} onClick={() => start(async () => setNote(await unlinkRefundAction(refund.id)))}>{pending ? "해제 중…" : "연결 해제"}</button>
    </div> : refund.candidates.length ? <form action={action} style={{ display: "grid", gap: 12, marginTop: 12 }}>
      <input type="hidden" name="refundId" value={refund.id} />
      <label className="label">원거래 후보
        <select name="originalId" className="field" required defaultValue="">
          <option value="" disabled>실제 환불한 거래를 선택하세요</option>
          {refund.candidates.map(candidate => <option key={candidate.id} value={candidate.id}>
            {candidate.date} · {won(-candidate.amount)}원 · 연결 가능 {won(-candidate.amount - candidate.linkedAmount)}원
          </option>)}
        </select>
      </label>
      <SubmitButton pending="연결 중…">이 거래의 환불로 연결</SubmitButton>
    </form> : <p style={{ marginTop: 12 }}>맞는 원거래 후보가 없어요. 일반 입금은 연결하지 않아도 돼요.</p>}
    <p role="status" className={message.ok === false ? "form-msg err" : "form-msg"}>{message.message}</p>
  </article>;
}
