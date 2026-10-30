import { describe, expect, it } from "vitest";
import { hashPassword, newToken, normalizeEmail, tokenHash, validEmail, validPassword, validToken, verifyPassword } from "./credentials";

describe("로그인 자격 정보", () => {
  it("이메일을 정규화하고 잘못된 주소를 거부한다", () => {
    expect(normalizeEmail(" User@Example.COM ")).toBe("user@example.com");
    expect(validEmail("user@example.com")).toBe(true);
    for (const email of ["", "a@b", "a b@example.com", "a@b@c.com", "a".repeat(255) + "@b.com"]) expect(validEmail(email)).toBe(false);
  });
  it("비밀번호 길이를 15~128자로 제한한다", () => {
    expect(validPassword("a".repeat(14))).toBe(false);
    expect(validPassword("한".repeat(15))).toBe(true);
    expect(validPassword("a".repeat(128))).toBe(true);
    expect(validPassword("a".repeat(129))).toBe(false);
  });
  it("동일 비밀번호도 서로 다른 salt로 저장한다", async () => {
    const password = "a long private password";
    const a = await hashPassword(password), b = await hashPassword(password);
    expect(a).not.toBe(b); expect(a).not.toContain(password);
    expect(await verifyPassword(password, a)).toBe(true);
    expect(await verifyPassword("a wrong private password", a)).toBe(false);
  });
  it("한글과 앞뒤 공백을 임의로 변경하지 않는다", async () => {
    const password = "  나의 가계부를 지키는 긴 비밀번호  ";
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword(password.trim(), hash)).toBe(false);
  });
  it("없는 사용자와 잘못된 해시는 인증하지 않는다", async () => {
    expect(await verifyPassword("a long private password", null)).toBe(false);
    expect(await verifyPassword("a long private password", "corrupted")).toBe(false);
    await expect(hashPassword("short")).rejects.toThrow();
  });
  it("세션 토큰은 무작위이고 원본과 저장 해시가 다르다", () => {
    const a = newToken(), b = newToken();
    expect(a).not.toBe(b); expect(validToken(a)).toBe(true);
    expect(tokenHash(a)).not.toBe(a); expect(tokenHash(a)).toBe(tokenHash(a));
    for (const value of ["", "../session", "f".repeat(63), "g".repeat(64)]) expect(validToken(value)).toBe(false);
  });
});
