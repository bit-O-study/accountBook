"use client";

import { useActionState, useState } from "react";
import { saveInstallmentAction } from "@/app/actions";
import type { TxView } from "@/lib/queries";
import { installmentAmount, validateInstallment } from "@/lib/installments/schedule";
import { shiftMonth } from "@/lib/dates";
import { won } from "@/lib/money";
import { SubmitButton } from "./buttons";

export function InstallmentForm({ tx }: { tx: TxView }) {
  const [state, action] = useActionState(saveInstallmentAction, {});
  const [monthsInput, setMonths] = useState(String(tx.installmentMonths));
  const [firstMonth, setFirstMonth] = useState(tx.firstBillingMonth ?? tx.date.slice(0, 7));
  const months = Number(monthsInput);
  const error = validateInstallment(months, firstMonth, tx.date.slice(0, 7));
  const preview = !error && months > 1 && tx.amount < 0
    ? Array.from({ length: months }, (_, n) => {
        const month = shiftMonth(firstMonth, n);
        return { month, ...installmentAmount(-tx.amount, months, firstMonth, month)! };
      }) : [];
  return <form action={action} style={{ display: "grid", gap: 12, marginTop: 24 }}>
    <input type="hidden" name="id" value={tx.id} />
    <b>할부 예상 청구</b>
    <label className="label">개월 수 (1은 일시불)
      <input name="months" className="field" type="number" min="1" max="60" step="1" required value={monthsInput} onChange={e => setMonths(e.target.value)} />
    </label>
    <label className="label">첫 청구 월
      <input name="firstMonth" className="field" type="month" min={tx.date.slice(0, 7)} max="9995-01" value={firstMonth} onChange={e => setFirstMonth(e.target.value)} />
    </label>
    {error && <p className="form-msg err" aria-live="polite">{error}</p>}
    {preview.length > 0 && <details className="installment-preview">
      <summary>전체 {months}회 미리보기 · 원금 {won(-tx.amount)}원</summary>
      <ol aria-label="할부 회차별 예상 원금" style={{ paddingLeft: 24, maxHeight: 240, overflowY: "auto" }}>
        {preview.map(row => <li key={row.month} style={{ padding: "6px 0" }}>{row.month} · {won(row.amount)}원</li>)}
      </ol>
      <p className="faint">나머지 원은 앞 회차에 1원씩 더해요. 아직 저장되지 않은 미리보기예요.</p>
    </details>}
    <p className="faint">원금만 나눠 보는 예상 금액이에요. 실제 청구일·수수료는 카드사에서 확인하세요. 기존 지출·예산은 승인 총액을 유지해요.</p>
    <p className={state.ok === false ? "form-msg err" : "form-msg"} role="status">{state.message}</p>
    <SubmitButton pending="저장 중…">할부 설정 저장</SubmitButton>
  </form>;
}
