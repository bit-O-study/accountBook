import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { normalizeMerchant } from "./normalize";
import type { ProviderTx } from "./providers/types";

/** Marker insertion and amount adjustment commit together, including after a worker restart. */
export async function applyCancellation(userId: string, accountId: string | null, source: "AUTO" | "CSV", item: ProviderTx) {
  try {
    return await prisma.$transaction(async tx => {
      const marker = await tx.transaction.findFirst({ where: { userId, accountId, externalId: item.externalId } });
      if (marker) return { duplicate: true, canceled: false, marker };
      const original = item.originalExternalId ? await tx.transaction.findFirst({ where: { userId, accountId, externalId: item.originalExternalId } }) : null;
      const created = await tx.transaction.create({ data: {
        userId, accountId, externalId: item.externalId, occurredAt: item.occurredAt,
        amount: 0, kind: "TRANSFER", merchantRaw: `${item.merchantRaw} (취소)`,
        merchantNorm: normalizeMerchant(item.merchantRaw).norm, source, status: "CANCELED", excluded: true,
      } });
      if (original) {
        await tx.transaction.update({ where: { id: original.id }, data: item.type === "CANCEL"
          ? { status: "CANCELED" } : { amount: { increment: Math.abs(item.amount) } } });
      }
      return { duplicate: false, canceled: !!original, marker: created };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const marker = await prisma.transaction.findFirst({ where: { userId, accountId, externalId: item.externalId } });
      if (marker) return { duplicate: true, canceled: false, marker };
    }
    throw error;
  }
}
