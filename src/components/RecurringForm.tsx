"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { saveRecurringAction, type FormState } from "@/app/actions";
import type { CategoryOption } from "./AddTransaction";
import { SubmitButton } from "./buttons";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

export interface RuleInput {
  id: string;
  name: string;
  amount: number;
  amountMin: number | null;
  amountMax: number | null;
  cycle: string;
  dueDay: number;
  dueMonth: number | null;
  merchantNorm: string | null;
  categoryId: string | null;
  payment: string | null;
  notifyDays: string;
  endDate: string | null;
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export function RecurringFormButton({
  categories,
  rule,
  label,
  className = "btn pri",
}: {
  categories: CategoryOption[];
  rule?: RuleInput;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-label={rule ? `${rule.name} 수정` : undefined}>
        {rule ? <Icon name="edit" /> : <Icon name="plus" />}
        {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={rule ? "고정지출 수정" : "고정지출 추가"}>
        <RecurringForm categories={categories} rule={rule} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function RecurringForm({ categories, rule, onDone }: { categories: CategoryOption[]; rule?: RuleInput; onDone: () => void }) {
  const [state, action] = useActionState<FormState, FormData>(saveRecurringAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [cycle, setCycle] = useState(rule?.cycle ?? "MONTHLY");
  const [variable, setVariable] = useState(rule ? rule.amountMin != null || rule.amountMax != null : false);
  const [draft, setDraft] = useState({
    name: rule?.name ?? "", amount: String(rule?.amount ?? ""), amountMin: String(rule?.amountMin ?? ""), amountMax: String(rule?.amountMax ?? ""),
    day: String(rule && rule.cycle !== "WEEKLY" ? rule.dueDay : 25), weekday: String(rule?.cycle === "WEEKLY" ? rule.dueDay : 1),
    dueMonth: String(rule?.dueMonth ?? 1), categoryId: rule?.categoryId ?? categories.find(category => category.kind === "EXPENSE")?.id ?? "",
    payment: rule?.payment ?? "", merchant: rule?.merchantNorm ?? "", notifyDays: rule?.notifyDays ?? "3,1", endDate: rule?.endDate ?? "",
  });
  const field = (name: keyof typeof draft) => ({ value: draft[name], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft(previous => ({ ...previous, [name]: event.target.value })) });

  // React resets action forms during commit, when synthetic reset handlers are disabled.
  useEffect(() => {
    const form = formRef.current;
    const preserveDraft = (event: Event) => event.preventDefault();
    form?.addEventListener("reset", preserveDraft);
    return () => form?.removeEventListener("reset", preserveDraft);
  }, []);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="form-grid" ref={formRef}>
      {rule && <input type="hidden" name="id" value={rule.id} />}
      <label className="label" htmlFor="r-name">
        이름
        <input id="r-name" name="name" className="field" {...field("name")} placeholder="정수기 렌탈" required />
      </label>
      <label className="label" htmlFor="r-amount">
        금액 (원)
        <input id="r-amount" name="amount" className="field mono" inputMode="numeric" {...field("amount")} placeholder="29,900" required />
      </label>
      <label className="check full">
        <input type="checkbox" name="variable" checked={variable} onChange={(e) => setVariable(e.target.checked)} />
        매달 금액이 달라요 (공과금 등)
      </label>
      {variable && (
        <>
          <label className="label" htmlFor="r-min">
            최소
            <input id="r-min" name="amountMin" className="field mono" inputMode="numeric" {...field("amountMin")} placeholder="20,000" />
          </label>
          <label className="label" htmlFor="r-max">
            최대
            <input id="r-max" name="amountMax" className="field mono" inputMode="numeric" {...field("amountMax")} placeholder="90,000" />
          </label>
        </>
      )}
      <label className="label" htmlFor="r-cycle">
        주기
        <select id="r-cycle" name="cycle" className="field" value={cycle} onChange={(e) => setCycle(e.target.value)}>
          <option value="MONTHLY">매월</option>
          <option value="WEEKLY">매주</option>
          <option value="YEARLY">매년</option>
        </select>
      </label>
      {cycle === "WEEKLY" ? (
        <label className="label" htmlFor="r-day">
          요일
          <select id="r-day" name="dueDay" className="field" {...field("weekday")}>
            {WEEK.map((w, i) => (
              <option key={w} value={i}>
                {w}요일
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="label" style={{ display: "grid", gridTemplateColumns: cycle === "YEARLY" ? "1fr 1fr" : "1fr", gap: 8 }}>
          {cycle === "YEARLY" && (
            <label className="label" htmlFor="r-month">
              월
              <select id="r-month" name="dueMonth" className="field" {...field("dueMonth")}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}월
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="label" htmlFor="r-day">
            결제일
            <select id="r-day" name="dueDay" className="field" {...field("day")}>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}일{i === 30 ? " (말일)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <label className="label" htmlFor="r-cat">
        카테고리
        <select id="r-cat" name="categoryId" className="field" {...field("categoryId")}>
          {categories
            .filter((c) => c.kind === "EXPENSE")
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>
      <label className="label" htmlFor="r-pay">
        결제수단
        <input id="r-pay" name="payment" className="field" {...field("payment")} placeholder="신한카드" />
      </label>
      <label className="label full" htmlFor="r-merchant">
        내역에 찍히는 이름 (대조용, 비우면 이름으로)
        <input id="r-merchant" name="merchant" className="field" {...field("merchant")} placeholder="코웨이" />
      </label>
      <label className="label" htmlFor="r-notify">
        알림
        <select id="r-notify" name="notifyDays" className="field" {...field("notifyDays")}>
          <option value="3,1">3일 전, 1일 전</option>
          <option value="1">1일 전</option>
          <option value="0">당일</option>
          <option value="">끄기</option>
        </select>
      </label>
      <label className="label" htmlFor="r-end">
        종료일 (약정 끝, 선택)
        <input id="r-end" name="endDate" type="date" className="field" {...field("endDate")} />
      </label>
      <p className={`form-msg full ${state.ok === false ? "err" : ""}`} aria-live="polite">
        {state.ok === false ? state.message : ""}
      </p>
      <div className="full modal-foot">
        <button type="button" className="btn" onClick={onDone}>
          취소
        </button>
        <SubmitButton pending="저장 중…">저장</SubmitButton>
      </div>
    </form>
  );
}
