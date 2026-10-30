// 카드사 명세서 CSV 가져오기. 머리글 이름이 카드사마다 달라 흔한 표기를 모두 받는다.
//   필수: 날짜, 가맹점, 금액   선택: 시간, 승인번호
// 금액이 양수면 지출로 본다(카드 명세서 관례). "-" 가 붙은 금액은 취소·환급(수입)으로 본다.

import { parseWon } from "@/lib/money";
import { isValidDateStr, type DateStr } from "@/lib/dates";

export interface CsvRow {
  line: number;
  date: DateStr;
  time: string;
  merchant: string;
  amount: number; // 지출 음수
  approvalNo: string | null;
}

export interface CsvParseResult {
  rows: CsvRow[];
  errors: { line: number; message: string }[];
}

const HEADERS = {
  date: ["날짜", "일자", "이용일", "이용일자", "거래일", "거래일자", "승인일", "승인일자", "date"],
  time: ["시간", "이용시간", "승인시간", "거래시간", "time"],
  merchant: ["가맹점", "가맹점명", "이용가맹점", "이용하신곳", "내용", "적요", "merchant", "description"],
  amount: ["금액", "이용금액", "승인금액", "결제금액", "거래금액", "amount"],
  approval: ["승인번호", "approval"],
};

function splitLine(line: string): string[] | null {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === "," || c === "\t") {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  if (q) return null;
  out.push(cur.trim());
  return out;
}

function normDate(s: string): string {
  const m = s.trim().match(/^(\d{4})[.\-/년\s]*(\d{1,2})[.\-/월\s]*(\d{1,2})일?$/);
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function findCol(header: string[], names: string[]): number {
  const h = header.map((x) => x.replace(/\s/g, "").toLowerCase());
  return h.findIndex((x) => names.some((n) => x === n.toLowerCase()));
}

export function parseCsv(text: string): CsvParseResult {
  const lines = text.replace(/^﻿/, "").split(/\r\n|\n|\r/).map((text, index) => ({ text, line: index + 1 })).filter((l) => l.text.trim() !== "");
  const errors: CsvParseResult["errors"] = [];
  if (lines.length < 2) return { rows: [], errors: [{ line: 1, message: "머리글과 거래가 한 줄 이상 있어야 해요." }] };

  const header = splitLine(lines[0].text);
  if (!header) return { rows: [], errors: [{ line: lines[0].line, message: "머리글의 따옴표가 닫혔는지 확인해 주세요." }] };
  const col = {
    date: findCol(header, HEADERS.date),
    time: findCol(header, HEADERS.time),
    merchant: findCol(header, HEADERS.merchant),
    amount: findCol(header, HEADERS.amount),
    approval: findCol(header, HEADERS.approval),
  };
  const missing = (["date", "merchant", "amount"] as const).filter((k) => col[k] < 0);
  if (missing.length) {
    const label = { date: "날짜", merchant: "가맹점", amount: "금액" };
    return {
      rows: [],
      errors: [{ line: lines[0].line, message: `머리글에서 ${missing.map((k) => label[k]).join(", ")} 열을 찾지 못했어요.` }],
    };
  }

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i].text);
    const line = lines[i].line;
    if (!cells || cells.length !== header.length) {
      errors.push({ line, message: "열 개수나 따옴표를 확인해 주세요. 쉼표가 든 금액은 따옴표로 감싸 주세요." });
      continue;
    }
    const date = normDate(cells[col.date] ?? "");
    if (!isValidDateStr(date)) {
      errors.push({ line, message: `날짜를 읽을 수 없어요: "${cells[col.date] ?? ""}"` });
      continue;
    }
    const n = parseWon(cells[col.amount] ?? "", true);
    if (!Number.isFinite(n) || n === 0) {
      errors.push({ line, message: `금액은 0이 아닌 원 단위 정수(최대 2,147,483,647원)로 입력해 주세요: "${cells[col.amount] ?? ""}"` });
      continue;
    }
    const merchant = (cells[col.merchant] ?? "").trim();
    if (!merchant) {
      errors.push({ line, message: "가맹점이 비어 있어요." });
      continue;
    }
    const rawTime = col.time >= 0 ? (cells[col.time] ?? "").trim() : "";
    const t = rawTime.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
    if (rawTime && !t) {
      errors.push({ line, message: "시간은 00:00~23:59 형식으로 입력해 주세요." });
      continue;
    }
    rows.push({
      line,
      date,
      time: t ? `${t[1].padStart(2, "0")}:${t[2]}` : "12:00",
      merchant,
      amount: -n,
      approvalNo: col.approval >= 0 ? cells[col.approval] || null : null,
    });
  }
  return { rows, errors };
}
