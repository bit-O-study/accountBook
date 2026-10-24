// 날짜는 화면·규칙 모두 KST 기준 "YYYY-MM-DD" 문자열로 다루고, DB 의 시각은 UTC 로 저장한다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DateStr = string; // YYYY-MM-DD
export type MonthKey = string; // YYYY-MM

const pad = (n: number) => String(n).padStart(2, "0");

export function kstDateStr(d: Date): DateStr {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function kstTimeStr(d: Date): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(11, 16);
}

export function kstMonthKey(d: Date): MonthKey {
  return kstDateStr(d).slice(0, 7);
}

export function todayStr(now: Date = new Date()): DateStr {
  return kstDateStr(now);
}

export function parseDate(s: DateStr): { y: number; m: number; d: number } {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

export function makeDate(y: number, m: number, d: number): DateStr {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** m 은 1~12 */
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function toUtcMs(s: DateStr): number {
  const { y, m, d } = parseDate(s);
  return Date.UTC(y, m - 1, d);
}

export function addDays(s: DateStr, n: number): DateStr {
  return new Date(toUtcMs(s) + n * DAY_MS).toISOString().slice(0, 10);
}

/** a - b (일) */
export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((toUtcMs(a) - toUtcMs(b)) / DAY_MS);
}

/** 0(일) ~ 6(토) */
export function weekday(s: DateStr): number {
  return new Date(toUtcMs(s)).getUTCDay();
}

/** KST 자정에 해당하는 UTC 시각 */
export function kstStartOfDay(s: DateStr): Date {
  return new Date(toUtcMs(s) - KST_OFFSET_MS);
}

/** KST 날짜 + "HH:MM" → UTC Date */
export function kstDateTime(s: DateStr, hhmm = "12:00"): Date {
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(toUtcMs(s) - KST_OFFSET_MS + (h * 60 + mi) * 60 * 1000);
}

export function monthOf(s: DateStr): MonthKey {
  return s.slice(0, 7);
}

export function shiftMonth(key: MonthKey, n: number): MonthKey {
  const [y, m] = key.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function monthRange(key: MonthKey) {
  const [y, m] = key.split("-").map(Number);
  const days = daysInMonth(y, m);
  const first = makeDate(y, m, 1);
  const last = makeDate(y, m, days);
  return {
    y,
    m,
    days,
    first,
    last,
    start: kstStartOfDay(first),
    end: kstStartOfDay(addDays(last, 1)), // exclusive
  };
}

export function isValidMonthKey(s: string | undefined | null): s is MonthKey {
  return !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function isValidDateStr(s: string | undefined | null): s is DateStr {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parseDate(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function weekdayLabel(s: DateStr): string {
  return WEEKDAYS[weekday(s)];
}

export function monthLabel(key: MonthKey): string {
  const [y, m] = key.split("-").map(Number);
  return `${y}년 ${m}월`;
}

/** "10.23" */
export function shortDate(s: DateStr): string {
  const { m, d } = parseDate(s);
  return `${m}.${pad(d)}`;
}

export function relativeDue(due: DateStr, today: DateStr): string {
  const n = diffDays(due, today);
  if (n === 0) return "오늘";
  if (n > 0) return `D-${n}`;
  return `D+${-n}`;
}
