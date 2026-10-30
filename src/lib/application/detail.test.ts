import { describe, expect, it } from "vitest";
import { validateQuery } from "./contract";
describe("transaction detail query contract", () => {
  it("only accepts a bounded transaction ID", () => {
    expect(validateQuery("loadTransaction", { id: "cm-own-123" })).toEqual({ id: "cm-own-123" });
    for (const input of [{}, { id: "" }, { id: "a".repeat(129) }, { id: "../x" }, { id: "a", userId: "other" }, { id: "a", month: "2026-10" }])
      expect(() => validateQuery("loadTransaction", input)).toThrow();
  });
  it("does not add ID access to the monthly query contract", () => {
    expect(() => validateQuery("loadTransactions", { month: "2026-10", id: "foreign" })).toThrow();
  });
});
