import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { CATEGORIES } from "@/lib/sync/categorize";
import { hashPassword, newToken, normalizeEmail, SESSION_SECONDS, tokenHash, validEmail, validPassword, validToken, verifyPassword } from "./credentials";

export class AuthError extends Error {}
const publicUser = { id: true, name: true, email: true } as const;

/** DB의 원자적 증가로 동시 인증 요청도 제한한다. */
async function consume(key: string, limit: number, windowMs: number, now: Date) {
  await prisma.authRateLimit.deleteMany({ where: { expiresAt: { lte: now } } });
  const record = await prisma.authRateLimit.upsert({
    where: { key }, update: { attempts: { increment: 1 } },
    create: { key, attempts: 1, expiresAt: new Date(now.getTime() + windowMs) },
  });
  return record.attempts <= limit;
}

export async function allowAuthAttempt(email: string, now = new Date()) {
  if (!(await consume("all", 100, 60000, now))) return false;
  return consume(`email:${tokenHash(normalizeEmail(email))}`, 10, 15 * 60000, now);
}

export async function registerUser(input: { name: string; email: string; password: string; claimCode?: string }) {
  const name = input.name.trim(), email = normalizeEmail(input.email);
  if (!name || name.length > 50) throw new AuthError("이름은 1~50자로 입력해 주세요.");
  if (!validEmail(email)) throw new AuthError("이메일 주소를 확인해 주세요.");
  if (!validPassword(input.password)) throw new AuthError("비밀번호는 15~128자로 입력해 주세요.");
  const claimCode = input.claimCode?.trim();
  if (claimCode && !validToken(claimCode)) throw new AuthError("연결 코드를 확인하거나 새로 발급받아 주세요.");
  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.$transaction(async tx => {
      // 빈 DB에서도 카테고리 선택이 가능하다. 기존 공통 카테고리는 수정하지 않는다.
      for (const [sortOrder, category] of CATEGORIES.entries()) {
        await tx.category.upsert({ where: { name: category.name }, update: {}, create: { ...category, sortOrder } });
      }
      if (claimCode) {
        const legacy = await tx.user.findUnique({ where: { claimTokenHash: tokenHash(claimCode) } });
        if (!legacy || legacy.email || legacy.passwordHash || !legacy.claimExpiresAt || legacy.claimExpiresAt <= new Date())
          throw new AuthError("연결 코드가 만료되었거나 이미 사용됐어요. 새로 발급받아 주세요.");
        const changed = await tx.user.updateMany({
          where: { id: legacy.id, email: null, passwordHash: null, claimTokenHash: tokenHash(claimCode), claimExpiresAt: { gt: new Date() } },
          data: { name, email, passwordHash, claimTokenHash: null, claimExpiresAt: null },
        });
        if (changed.count !== 1) throw new AuthError("연결 코드를 새로 발급받아 주세요.");
        return tx.user.findUniqueOrThrow({ where: { id: legacy.id }, select: publicUser });
      }
      return tx.user.create({ data: { name, email, passwordHash }, select: publicUser });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new AuthError("이 정보로 가입할 수 없어요. 이메일을 확인하거나 로그인해 주세요.");
    throw error;
  }
}

export async function authenticate(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  const user = validEmail(email) ? await prisma.user.findUnique({ where: { email } }) : null;
  if (!(await verifyPassword(password, user?.passwordHash ?? null)) || !user)
    throw new AuthError("이메일 또는 비밀번호를 확인해 주세요.");
  return { id: user.id, name: user.name, email: user.email };
}

export async function createSession(userId: string, now = new Date()) {
  const token = newToken(), expiresAt = new Date(now.getTime() + SESSION_SECONDS * 1000);
  await prisma.session.deleteMany({ where: { expiresAt: { lte: now } } });
  await prisma.session.create({ data: { tokenHash: tokenHash(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function findSessionUser(token: string | undefined, now = new Date()) {
  if (!token || !validToken(token)) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: { select: publicUser } } });
  return session && session.expiresAt > now && session.user.email ? session.user : null;
}

export async function revokeSession(token: string | undefined) {
  if (token && validToken(token)) await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
}

/** 서버 CLI에서만 호출. 기존 데이터를 이동하지 않고 소유 사용자에 인증 정보를 연결한다. */
export async function issueClaimCode(userId: string) {
  const token = newToken(), expiresAt = new Date(Date.now() + 30 * 60000);
  const result = await prisma.user.updateMany({
    where: { id: userId, email: null, passwordHash: null },
    data: { claimTokenHash: tokenHash(token), claimExpiresAt: expiresAt },
  });
  if (result.count !== 1) throw new AuthError("로그인 정보가 없는 기존 사용자 ID를 지정해 주세요.");
  return { token, expiresAt };
}
