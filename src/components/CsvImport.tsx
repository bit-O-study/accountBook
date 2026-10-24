"use client";

import { useActionState, useMemo, useState } from "react";
import { importCsvAction, type FormState } from "@/app/actions";
import { signedWon } from "@/lib/money";
import { parseCsv } from "@/lib/sync/csv";
import { SubmitButton } from "./buttons";
import { Icon } from "./Icon";

const SAMPLE = "이용일자,이용시간,이용가맹점,이용금액,승인번호\n2026.10.21,13:05,쿠팡(주),\"38,900\",30012345\n2026.10.22,19:40,김밥천국 역삼점,8500,30012399";

/** CSV 가져오기: 파일 선택 → 해석 → 미리보기 → 저장 (A-08) */
export function CsvImport() {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [state, action] = useActionState<FormState, FormData>(async (prev: FormState, f: FormData) => {
    const r = await importCsvAction(prev, f);
    if (r.ok) {
      setText("");
      setFileName("");
    }
    return r;
  }, {});
  const parsed = useMemo(() => (text.trim() ? parseCsv(text) : null), [text]);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result as ArrayBuffer;
      // 카드사 CSV 는 EUC-KR 인 경우가 많다. UTF-8 로 읽어 깨지면 EUC-KR 로 다시 읽는다.
      let s = new TextDecoder("utf-8").decode(buf);
      if (s.includes("�")) s = new TextDecoder("euc-kr").decode(buf);
      setText(s);
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label className="btn" htmlFor="csv-file" style={{ cursor: "pointer" }}>
          <Icon name="upload" />
          파일 선택
        </label>
        <input id="csv-file" type="file" accept=".csv,.txt,text/csv" style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} onChange={(e) => onFile(e.target.files?.[0])} />
        <span className="muted" style={{ fontSize: 13 }}>{fileName || "또는 아래에 붙여넣기"}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn ghost sm" onClick={() => { setText(SAMPLE); setFileName(""); }}>
          예시 넣기
        </button>
      </div>
      <label className="label" htmlFor="csv-text">
        CSV 내용 (필수 열: 날짜, 가맹점, 금액)
        <textarea id="csv-text" name="csv" className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder={SAMPLE} rows={5} />
      </label>
      <label className="label" htmlFor="csv-label">
        어느 카드 명세서인가요? (중복 확인에 써요)
        <input id="csv-label" name="label" className="field" placeholder="신한카드" />
      </label>

      {parsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ fontSize: 13 }}>
            <b>{parsed.rows.length}건</b> 읽음
            {parsed.errors.length > 0 && <span className="bad-text"> · {parsed.errors.length}줄은 읽지 못함</span>}
          </p>
          {parsed.rows.length > 0 && (
            <div className="csv-preview">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>날짜</th>
                    <th>가맹점</th>
                    <th className="r">금액</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 20).map((r) => (
                    <tr key={r.line}>
                      <td className="mono">
                        {r.date} {r.time !== "12:00" ? r.time : ""}
                      </td>
                      <td>{r.merchant}</td>
                      <td className={`r mono ${r.amount < 0 ? "minus" : "plus"}`}>{signedWon(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.rows.length > 20 && <p className="faint" style={{ fontSize: 12, padding: "6px 10px" }}>외 {parsed.rows.length - 20}건</p>}
            </div>
          )}
          {parsed.errors.length > 0 && (
            <ul className="bad-text" style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
              {parsed.errors.slice(0, 5).map((e) => (
                <li key={e.line}>
                  {e.line}번째 줄: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <SubmitButton pending="가져오는 중…">{parsed?.rows.length ? `${parsed.rows.length}건 가져오기` : "가져오기"}</SubmitButton>
        <p className={`form-msg ${state.ok === false ? "err" : state.ok ? "ok" : ""}`} aria-live="polite">
          {state.message ?? ""}
        </p>
      </div>
    </form>
  );
}
