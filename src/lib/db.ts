import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = g.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") g.prisma = prisma;

/** 1단계는 1인 사용. 로그인(G-01) 붙이면 세션의 사용자로 바꾼다. */
export async function getUser() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (user) return user;
  return prisma.user.create({ data: { name: "나" } });
}

export async function categoryMaps() {
  const list = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
  return {
    list,
    byName: new Map(list.map((c) => [c.name, c.id])),
    byId: new Map(list.map((c) => [c.id, c.name])),
  };
}
