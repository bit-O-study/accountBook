"use client";

import { useActionState, useEffect, useState } from "react";
import { addTransactionAction, type FormState } from "@/app/actions";
import { SubmitButton } from "./buttons";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

export interface CategoryOption {
  id: string;
  name: string;
  kind: string;
}

/** D-01 빠른 수동 입력: 금액 → 내용 → 저장 */
export function AddTransaction({ categories, today, compact }: { categories: CategoryOption[]; today: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"OUT" | "IN">("OUT");
  const [state, action] = useActionState<FormState, FormData>(addTransactionAction, {});
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      setFormKey((k) => k + 1);
    }
  }, [state]);

  const options = categories.filter((c) => c.kind === (direction === "IN" ? "INCOME" : "EXPENSE"));

  return (
    <>
      <button type="button" className="btn pri" onClick={() => setOpen(true)}>
        <Icon name="plus" />
        {compact ? "입력" : "거래 입력"}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="거래 입력">
        <form key={formKey} action={action} className="form-grid">
          <div className="full seg" role="group" aria-label="지출 또는 수입">
            <button type="button" className={direction === "OUT" ? "on" : ""} onClick={() => setDirection("OUT")}>
              지출
            </button>
            <button type="button" className={direction === "IN" ? "on" : ""} onClick={() => setDirection("IN")}>
              수입
            </button>
          </div>
          <input type="hidden" name="direction" value={direction} />
          <label className="label full" htmlFor="tx-amount">
            금액 (원)
            <input id="tx-amount" name="amount" className="field mono" inputMode="numeric" placeholder="9,000" autoFocus required style={{ fontSize: 20 }} />
          </label>
          <label className="label full" htmlFor="tx-merchant">
            내용
            <input id="tx-merchant" name="merchant" className="field" placeholder={direction === "IN" ? "용돈" : "점심 (현금)"} required />
          </label>
          <label className="label" htmlFor="tx-date">
            날짜
            <input id="tx-date" name="date" type="date" className="field" defaultValue={today} max={today} required />
          </label>
          <label className="label" htmlFor="tx-category">
            카테고리
            <select id="tx-category" name="categoryId" className="field" key={direction}>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="label full" htmlFor="tx-memo">
            메모 (선택)
            <input id="tx-memo" name="memo" className="field" />
          </label>
          <p className={`form-msg full ${state.ok === false ? "err" : ""}`} aria-live="polite">
            {state.ok === false ? state.message : ""}
          </p>
          <div className="full modal-foot">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              취소
            </button>
            <SubmitButton pending="저장 중…">저장</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
