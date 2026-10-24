export function won(n: number): string {
  return Math.round(n).toLocaleString("ko-KR");
}

/** 지출 -38,900 / 수입 +3,200,000 */
export function signedWon(n: number): string {
  if (n > 0) return `+${won(n)}`;
  if (n < 0) return `-${won(-n)}`;
  return "0";
}

/** "29,900원", "29900" → 29900. 숫자가 없으면 NaN */
export function parseWon(s: string): number {
  const digits = s.replace(/[^0-9]/g, "");
  return digits ? parseInt(digits, 10) : NaN;
}
