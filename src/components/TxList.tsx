"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  deleteTransactionAction,
  makeRecurringFromTxAction,
  updateTransactionAction,
  type FormState,
} from "@/app/actions";
import { shortDate, weekdayLabel } from "@/lib/dates";
import { signedWon, won } from "@/lib/money";
import type { TxView } from "@/lib/queries";
import type { CategoryOption } from "./AddTransaction";
import { SubmitButton } from "./buttons";
import { Modal } from "./Modal";

const SOURCE_LABEL = { AUTO: "자동", MANUAL: "수동", CSV: "CSV" } as const;

export function TxTag({ tx }: { tx: Pick<TxView, "source" | "fixedName" | "kind"> }) {
  if (tx.kind === "CARD_BILL") return <span className="tag MUTED">카드대금</span>;
  if (tx.kind === "TRANSFER") return <span className="tag MUTED">이체</span>;
  if (tx.fixedName) return <span className="tag FIXED">고정</span>;
  return <span className={`tag ${tx.source}`}>{SOURCE_LABEL[tx.source]}</span>;
}

function sub(tx: TxView) {
  const parts = [tx.category];
  if (tx.fixedName) parts.push(`${tx.fixedName} 납부`);
  parts.push(tx.accountName ?? (tx.source === "CSV" ? "CSV" : "현금"));
  if (tx.status === "CANCELED") parts.push("승인 취소");
  else if (tx.excluded) parts.push("통계 제외");
  else if (tx.kind === "CARD_BILL") parts.push("지출에 안 셈");
  return parts.join(" · ");
}

export function TxRow({ tx, onOpen, showDate }: { tx: TxView; onOpen?: (t: TxView) => void; showDate?: boolean }) {
  const dim = tx.excluded || tx.kind === "TRANSFER" || tx.kind === "CARD_BILL";
  return (
    <button
      type="button"
      className={`tx ${dim ? "dim" : ""} ${tx.status === "CANCELED" ? "canceled" : ""}`}
      onClick={() => onOpen?.(tx)}
    >
      <span className="ico" aria-hidden="true">
        {tx.merchant.replace(/[^가-힣A-Za-z0-9]/g, "").slice(0, 1) || "·"}
      </span>
      <span className="body">
        <span className="t">
          <span className="name">{tx.merchant}</span>
          <TxTag tx={tx} />
        </span>
        <span className="s">
          {showDate ? `${shortDate(tx.date)} · ` : `${tx.time} · `}
          {sub(tx)}
        </span>
      </span>
      <span className={`a ${tx.amount < 0 ? "minus" : "plus"}`}>{signedWon(tx.amount)}</span>
    </button>
  );
}

export function TxList({ txs, categories, grouped = true }: { txs: TxView[]; categories: CategoryOption[]; grouped?: boolean }) {
  const [selected, setSelected] = useState<TxView | null>(null);

  if (!txs.length) {
    return (
      <div className="empty">
        <b>거래가 없어요</b>
        카드를 연결하거나 직접 입력해 보세요.
      </div>
    );
  }

  const days: { date: string; list: TxView[]; total: number }[] = [];
  for (const t of txs) {
    let g = days[days.length - 1];
    if (!g || g.date !== t.date) days.push((g = { date: t.date, list: [], total: 0 }));
    g.list.push(t);
    if (t.status === "APPROVED" && !t.excluded && (t.kind === "EXPENSE" || t.kind === "INCOME")) g.total += t.amount;
  }

  return (
    <>
      <div className="tx-list">
        {grouped
          ? days.map((g) => (
              <div key={g.date}>
                <div className="tx-day">
                  <span>
                    {shortDate(g.date)} {weekdayLabel(g.date)}
                  </span>
                  <span>{signedWon(g.total)}</span>
                </div>
                {g.list.map((t) => (
                  <TxRow key={t.id} tx={t} onOpen={setSelected} />
                ))}
              </div>
            ))
          : txs.map((t) => <TxRow key={t.id} tx={t} onOpen={setSelected} showDate />)}
      </div>
      <TxDetail tx={selected} categories={categories} onClose={() => setSelected(null)} />
    </>
  );
}

function TxDetail({ tx, categories, onClose }: { tx: TxView | null; categories: CategoryOption[]; onClose: () => void }) {
  const [state, action] = useActionState<FormState, FormData>(updateTransactionAction, {});
  const [note, setNote] = useState<FormState>({});
  const [pending, start] = useTransition();
  const [catId, setCatId] = useState<string>("");

  useEffect(() => {
    setNote({});
    setCatId(tx?.categoryId ?? "");
  }, [tx]);
  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  const run = (fn: () => Promise<FormState>) =>
    start(async () => {
      const r = await fn();
      setNote(r);
      if (r.ok) onClose();
    });

  const kind = tx && tx.amount > 0 ? "INCOME" : "EXPENSE";
  const options = categories.filter((c) => c.kind === kind || c.kind === "TRANSFER");
  const changed = !!tx && catId !== (tx.categoryId ?? "");

  return (
    <Modal open={!!tx} onClose={onClose} title="거래 상세">
      {tx && (
        <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input type="hidden" name="id" value={tx.id} />
          <div>
            <div className={`detail-amt ${tx.amount < 0 ? "minus" : "plus"}`}>{signedWon(tx.amount)}원</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
              <b>{tx.merchant}</b>
              <TxTag tx={tx} />
            </div>
          </div>
          <dl className="kv">
            <dt>일시</dt>
            <dd className="mono">
              {tx.date} {tx.time}
            </dd>
            <dt>출처</dt>
            <dd>{tx.accountName ? `${tx.accountName} 자동 기록` : tx.source === "CSV" ? "CSV 가져오기" : "직접 입력"}</dd>
            {tx.fixedName && (
              <>
                <dt>고정지출</dt>
                <dd>{tx.fixedName} 납부로 확인됨</dd>
              </>
            )}
            {tx.status === "CANCELED" && (
              <>
                <dt>상태</dt>
                <dd className="bad-text">승인 취소됨 · 합계에서 빠짐</dd>
              </>
            )}
          </dl>
          <label className="label" htmlFor="d-cat">
            카테고리
            <select id="d-cat" name="categoryId" className="field" value={catId} onChange={(e) => setCatId(e.target.value)}>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {changed && (
            <label className="check">
              <input type="checkbox" name="applyAll" defaultChecked />
              {tx.merchantNorm} 거래 모두 바꾸고 앞으로도 적용
            </label>
          )}
          <label className="label" htmlFor="d-memo">
            메모
            <input id="d-memo" name="memo" className="field" defaultValue={tx.memo ?? ""} />
          </label>
          <label className="check">
            <input type="checkbox" name="excluded" defaultChecked={tx.excluded} />
            통계에서 빼기 (회사 경비 등)
          </label>
          <p className={`form-msg ${(state.ok === false || note.ok === false) ? "err" : ""}`} aria-live="polite">
            {state.ok === false ? state.message : note.ok === false ? note.message : ""}
          </p>
          <div className="modal-foot">
            {tx.amount < 0 && !tx.fixedName && tx.kind === "EXPENSE" && (
              <button type="button" className="btn sm" disabled={pending} onClick={() => run(() => makeRecurringFromTxAction(tx.id))}>
                고정지출로 지정
              </button>
            )}
            {tx.source !== "AUTO" && (
              <button type="button" className="btn danger sm" disabled={pending} onClick={() => run(() => deleteTransactionAction(tx.id))}>
                삭제
              </button>
            )}
            <span className="grow" />
            <SubmitButton pending="저장 중…">저장</SubmitButton>
          </div>
          {tx.source === "AUTO" && (
            <p className="faint" style={{ fontSize: 12 }}>
              자동 기록은 {won(Math.abs(tx.amount))}원 그대로 카드사 내역과 맞춰 두고, 필요하면 통계에서만 빼요.
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
