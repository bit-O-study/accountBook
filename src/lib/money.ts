export function won(n: number): string {
  return Math.round(n).toLocaleString("ko-KR");
}

/** 지출 -38,900 / 수입 +3,200,000 */
export function signedWon(n: number): string {
  if (n > 0) return `+${won(n)}`;
  if (n < 0) return `-${won(-n)}`;
  return "0";
}

/** 원 단위 정수만 받는다. CSV만 allowSign으로 부호를 허용한다. */
export function parseWon(s: string, allowSign = false): number {
  const text = s.trim().replace(/원$/, "").trim();
  const sign = allowSign && /^[+-]/.test(text) ? text[0] : "";
  const digits = sign ? text.slice(1) : text;
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(digits)) return NaN;
  const value = Number(sign + digits.replaceAll(",", ""));
  return Number.isSafeInteger(value) && Math.abs(value) <= 2147483647 ? value : NaN;
}
