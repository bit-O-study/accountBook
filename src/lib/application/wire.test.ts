import { describe, expect, it } from "vitest";
import { decode, encode } from "./wire";
describe("API value transport", () => {
  it("preserves dates, nulls, nested values and date-like user text", () => {
    const source = { at: new Date("2026-10-25T00:00:00.123Z"), note: "2026-10-25T00:00:00.123Z", rows: [null, true, -4321], literal: ["date", "user input"], object: { $date: "memo" } };
    expect(decode(JSON.parse(JSON.stringify(encode(source))))).toEqual(source);
  });
  it("does not assign prototype properties when decoding arbitrary keys", () => {
    const value = decode(encode(JSON.parse('{"__proto__":{"polluted":true}}')));
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});
