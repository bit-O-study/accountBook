import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const normalizeEmail = (value: string) => value.trim().toLowerCase();
export const validEmail = (value: string) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const validPassword = (value: string) => [...value].length >= 15 && [...value].length <= 128;
export const newToken = () => randomBytes(32).toString("hex");
export const validToken = (value: string) => /^[a-f0-9]{64}$/.test(value);
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error); else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (!validPassword(password)) throw new Error("비밀번호는 15~128자로 입력해 주세요.");
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v1:${salt}:${(await derive(password, salt)).toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!validPassword(password)) return false;
  const match = stored?.match(/^scrypt-v1:([a-f0-9]{32}):([a-f0-9]{128})$/);
  // 존재하지 않는 사용자도 동일한 비용으로 검증한다.
  const actual = await derive(password, match?.[1] ?? "0".repeat(32));
  const expected = Buffer.from(match?.[2] ?? "0".repeat(128), "hex");
  return timingSafeEqual(actual, expected) && !!match;
}
