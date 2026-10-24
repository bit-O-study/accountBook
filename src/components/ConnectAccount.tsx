"use client";

import { useActionState, useState } from "react";
import { connectAccountAction, disconnectAccountAction, type FormState } from "@/app/actions";
import { SubmitButton } from "./buttons";

export function ConnectAccount({ options }: { options: { name: string; kind: string }[] }) {
  const [state, action] = useActionState<FormState, FormData>(connectAccountAction, {});
  if (!options.length) return <p className="muted">데모 기관을 모두 연결했어요.</p>;
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label className="label" htmlFor="acc-inst">
        카드사·은행
        <select id="acc-inst" name="institution" className="field" defaultValue={options[0].name}>
          {options.map((o) => (
            <option key={o.name} value={o.name}>
              {o.name} ({o.kind === "CARD" ? "카드" : "계좌"})
            </option>
          ))}
        </select>
      </label>
      <SubmitButton pending="연결하고 내역 가져오는 중…">연결하기</SubmitButton>
      <p className={`form-msg ${state.ok === false ? "err" : state.ok ? "ok" : ""}`} aria-live="polite">
        {state.message ?? ""}
      </p>
    </form>
  );
}

/** 연결 해제: 두 번 눌러 확인, 거래 삭제 여부 선택 (G-04) */
export function DisconnectAccount({ id, name }: { id: string; name: string }) {
  const [state, action] = useActionState<FormState, FormData>(disconnectAccountAction, {});
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" className="btn ghost sm" onClick={() => setArmed(true)}>
        연결 해제
      </button>
    );
  }
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
      <input type="hidden" name="id" value={id} />
      <label className="check">
        <input type="checkbox" name="deleteData" />
        {name}에서 가져온 거래도 삭제
      </label>
      <div style={{ display: "flex", gap: 6 }}>
        <SubmitButton className="btn danger sm" pending="해제 중…">
          연결 해제
        </SubmitButton>
        <button type="button" className="btn sm" onClick={() => setArmed(false)}>
          취소
        </button>
      </div>
      {state.ok === false && <p className="form-msg err">{state.message}</p>}
    </form>
  );
}
