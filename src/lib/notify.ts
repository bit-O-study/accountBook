import { prisma } from "@/lib/db";

export type NotificationType = "DUE" | "CHANGED" | "MISSING" | "SUGGEST" | "SYNC_FAIL" | "BUDGET";

/** key 가 같으면 한 번만 만든다. 새로 만들었으면 true */
export async function notifyOnce(
  userId: string,
  key: string,
  type: NotificationType,
  title: string,
  body: string,
  href?: string,
): Promise<boolean> {
  const exists = await prisma.notification.findUnique({ where: { key } });
  if (exists) return false;
  await prisma.notification.create({ data: { userId, key, type, title, body, href } });
  return true;
}
