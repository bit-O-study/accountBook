import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type NotificationType = "DUE" | "CHANGED" | "MISSING" | "SUGGEST" | "SYNC_FAIL" | "BUDGET";

/** 사용자와 key가 같으면 한 번만 만든다. 새로 만들었으면 true */
export async function notifyOnce(
  userId: string,
  key: string,
  type: NotificationType,
  title: string,
  body: string,
  href?: string,
): Promise<boolean> {
  const exists = await prisma.notification.findUnique({ where: { userId_key: { userId, key } } });
  if (exists) return false;
  try {
    await prisma.notification.create({ data: { userId, key, type, title, body, href } });
    return true;
  } catch (error) {
    // 조회 이후 다른 요청이 같은 알림을 만들었어도 정상적인 중복으로 처리한다.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrent = await prisma.notification.findUnique({ where: { userId_key: { userId, key } } });
      if (concurrent) return false;
    }
    throw error;
  }
}
