import { describe, it, expect } from "vitest";
import { parseWon } from "./money";
import { parseCsv } from "./sync/csv";

describe("money and CSV input boundaries", () => {
  it("never changes decimal/sign/exponent input into a different amount", () => {
    for (const input of ["", " ", "1 000", "NaN", "Infinity", "99999999999999999999", "1.5", "-100", "1e3", "12abc34", "12,34", "2147483648"]) expect(Number.isNaN(parseWon(input))).toBe(true);
    expect(parseWon(" 29,900원 ")).toBe(29900);
    expect(parseWon("0")).toBe(0);
    expect(parseWon("2147483647")).toBe(2147483647);
  });
  it("rejects fractional, scientific and overflowing CSV amounts", () => {
    for (const amount of ["0.1", "1.5", "1e3", "2147483648", "-2147483648"]) {
      const result = parseCsv(`날짜,가맹점,금액\n2026-10-26,상점,${amount}`);
      expect(result.rows).toHaveLength(0);expect(result.errors).toHaveLength(1);
    }
    expect(parseCsv('날짜,가맹점,금액\n2026-10-26,상점,"-29,900원"').rows[0].amount).toBe(29900);
  });
  it("rejects invalid time rather than silently moving the transaction date", () => {
    for (const time of ["25:99", "24:00", "12:60", "abc", "12:30junk"]) {
      const result = parseCsv(`날짜,시간,가맹점,금액\n2026-10-26,${time},상점,100`);
      expect(result.rows).toHaveLength(0);expect(result.errors[0].message).toContain("시간");
    }
    expect(parseCsv('날짜,시간,가맹점,금액\n2026-10-26,9:05:30,상점,100').rows[0].time).toBe('09:05');
    expect(parseCsv('날짜,시간,가맹점,금액\n2026-10-26,,상점,100').rows[0].time).toBe('12:00');
  });
  it("reports physical line numbers despite blank lines", () => {
    const result = parseCsv('\n날짜,가맹점,금액\n\n2026-10-26,상점,abc\n2026-10-26,정상,100');
    expect(result.errors[0].line).toBe(4);expect(result.rows[0].line).toBe(5);
  });
  it("rejects malformed dates, quoting and column count", () => {
    for (const row of ['2026-10-26junk,상점,100', '2026-10-26,"상점,100', '2026-10-26,상점,1,000']) {
      expect(parseCsv('날짜,가맹점,금액\n'+row).rows).toHaveLength(0);
    }
  });
});
