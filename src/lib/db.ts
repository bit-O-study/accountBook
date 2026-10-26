import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = g.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") g.prisma = prisma;

/** 화면과 서버 액션은 항상 요청 세션의 사용자만 사용한다. */
export async function getUser() {
  const { requireUser } = await import("./auth/request");
  return requireUser();
}

export async function categoryMaps() {
  const list = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
  return {
    list,
    byName: new Map(list.map((c) => [c.name, c.id])),
    byId: new Map(list.map((c) => [c.id, c.name])),
  };
}
