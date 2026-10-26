"use client";

import { useActionState, useState } from "react";
import { setBudgetAction, type FormState } from "@/app/actions";
import { SubmitButton } from "./buttons";

export function BudgetForm({ month, current, label }: { month: string; current: number | null; label: string }) {
  const [state, action] = useActionState<FormState, FormData>(setBudgetAction, {});
  const [amount, setAmount] = useState(String(current ?? ""));
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input type="hidden" name="month" value={month} />
      <label className="label" htmlFor="budget-amount">
        {label} 생활비 예산 (원, 고정지출 제외)
        <div style={{ display: "flex", gap: 8 }}>
          <input
            id="budget-amount"
            name="amount"
            className="field mono"
            inputMode="numeric"
            value={amount}
            onChange={event => setAmount(event.target.value)}
            placeholder="1,500,000"
            required
            style={{ fontSize: 17 }}
          />
          <SubmitButton pending="저장 중…">저장</SubmitButton>
        </div>
      </label>
      <p className={`form-msg ${state.ok === false ? "err" : state.ok ? "ok" : ""}`} aria-live="polite">
        {state.message ?? ""}
      </p>
    </form>
  );
}
