// 자동 기록 파이프라인: 수집 → 정리 → 중복 제거 → 분류·대조 (검수보고서 4장)

import type { Prisma } from "@prisma/client";
import { categoryMaps, prisma } from "@/lib/db";
import { kstStartOfDay, todayStr, addDays, kstDateStr } from "@/lib/dates";
import { notifyOnce } from "@/lib/notify";
import { notifySuggestions, reconcileRecurring } from "@/lib/recurring/service";
import { classifyKind, pickCategory } from "./categorize";
import { findDuplicate, type DedupeCandidate } from "./dedupe";
import { normalizeMerchant } from "./normalize";
import { getProvider } from "./providers";
import { ProviderAuthError, type ProviderTx } from "./providers/types";

export const SYNC_INTERVAL_MS = 30 * 60 * 1000;
const OVERLAP_MS = 3 * 24 * 60 * 60 * 1000; // 늦게 들어오는 매입·취소를 잡기 위해 겹쳐서 가져온다

export interface IngestStats {
  added: number;
  duplicates: number;
  merged: number;
  canceled: number;
}

export interface IngestInput {
  userId: string;
  accountId: string | null;
  accountKind: "CARD" | "BANK" | null;
  source: "AUTO" | "CSV";
  items: ProviderTx[];
}

/** 수집한 거래를 정리·중복 제거·분류해서 저장한다. 자동 연동과 CSV 가져오기가 함께 쓴다. */
export async function ingestTransactions(input: IngestInput): Promise<IngestStats> {
  const { userId, accountId, accountKind, source, items } = input;
  const stats: IngestStats = { added: 0, duplicates: 0, merged: 0, canceled: 0 };
  if (!items.length) return stats;

  const cats = await categoryMaps();
  const userRules = new Map(
    (await prisma.categoryRule.findMany({ where: { userId }, include: { category: true } })).map((r) => [
      r.merchantNorm,
      r.category.name,
    ]),
  );
  const ownAccountNames = (await prisma.linkedAccount.findMany({ where: { userId }, select: { name: true } }))
    .map((a) => a.name)
    .filter((n) => n !== "") as string[];

  const times = items.map((t) => t.occurredAt.getTime());
  const existing: DedupeCandidate[] = await prisma.transaction.findMany({
    where: {
      userId,
      occurredAt: {
        gte: kstStartOfDay(addDays(kstDateStr(new Date(Math.min(...times))), -1)),
        lt: kstStartOfDay(addDays(kstDateStr(new Date(Math.max(...times))), 2)),
      },
    },
    select: { id: true, accountId: true, externalId: true, occurredAt: true, amount: true, merchantNorm: true, source: true },
  });

  // 승인 먼저, 취소는 나중에 처리
  const ordered = [...items].sort((a, b) => {
    const ca = a.type === "CANCEL" || a.type === "PARTIAL_CANCEL" ? 1 : 0;
    const cb = b.type === "CANCEL" || b.type === "PARTIAL_CANCEL" ? 1 : 0;
    return ca - cb || a.occurredAt.getTime() - b.occurredAt.getTime();
  });

  for (const t of ordered) {
    if (t.type === "CANCEL" || t.type === "PARTIAL_CANCEL") {
      if (existing.some((e) => e.accountId === accountId && e.externalId === t.externalId)) {
        stats.duplicates++;
        continue;
      }
      const orig = await prisma.transaction.findFirst({ where: { userId, accountId, externalId: t.originalExternalId } });
      if (orig) {
        if (t.type === "CANCEL") {
          await prisma.transaction.update({ where: { id: orig.id }, data: { status: "CANCELED" } });
        } else {
          await prisma.transaction.update({ where: { id: orig.id }, data: { amount: orig.amount + Math.abs(t.amount) } });
        }
        stats.canceled++;
      }
      // 취소 기록 자체는 외부 ID 만 남겨 다음 동기화 때 다시 처리하지 않게 한다
      const rec = await prisma.transaction.create({
        data: {
          userId,
          accountId,
          externalId: t.externalId,
          occurredAt: t.occurredAt,
          amount: 0,
          kind: "TRANSFER",
          merchantRaw: `${t.merchantRaw} (취소)`,
          merchantNorm: normalizeMerchant(t.merchantRaw).norm,
          source,
          status: "CANCELED",
          excluded: true,
        },
      });
      existing.push({ ...rec });
      continue;
    }

    const { norm, brandCategory } = normalizeMerchant(t.merchantRaw);
    const dup = findDuplicate(
      { accountId, externalId: t.externalId, occurredAt: t.occurredAt, amount: t.amount, merchantNorm: norm },
      existing,
    );
    if (dup?.type === "same-id" || dup?.type === "auto-twin") {
      stats.duplicates++;
      continue;
    }
    if (dup?.type === "manual-merge") {
      // 손으로 적어둔 거래가 자동으로 들어왔다 → 하나로 합친다
      await prisma.transaction.update({
        where: { id: dup.existing.id },
        data: { source, accountId, externalId: t.externalId, occurredAt: t.occurredAt, merchantRaw: t.merchantRaw, mcc: t.mcc },
      });
      dup.existing.source = source;
      dup.existing.externalId = t.externalId;
      dup.existing.accountId = accountId;
      stats.merged++;
      continue;
    }

    const kind = classifyKind({ amount: t.amount, merchantRaw: t.merchantRaw, accountKind, ownAccountNames });
    const categoryName = pickCategory({ merchantNorm: norm, brandCategory, mcc: t.mcc, amount: t.amount, kind, userRules });
    const data: Prisma.TransactionUncheckedCreateInput = {
      userId,
      accountId,
      externalId: t.externalId,
      occurredAt: t.occurredAt,
      amount: t.amount,
      kind,
      merchantRaw: t.merchantRaw,
      merchantNorm: norm,
      categoryId: cats.byName.get(categoryName) ?? cats.byName.get("기타") ?? null,
      source,
      mcc: t.mcc ?? null,
    };
    const created = await prisma.transaction.create({ data });
    existing.push({ ...created });
    stats.added++;
  }
  return stats;
}

export async function syncAccount(accountId: string, now = new Date()) {
  const account = await prisma.linkedAccount.findUniqueOrThrow({ where: { id: accountId } });
  await prisma.linkedAccount.update({ where: { id: accountId }, data: { syncStatus: "SYNCING" } });
  const provider = getProvider(account.provider);
  const since = account.lastSyncedAt
    ? new Date(account.lastSyncedAt.getTime() - OVERLAP_MS)
    : new Date(0); // 처음이면 연동사가 주는 만큼 전부

  try {
    const items = await provider.fetchTransactions(
      { ...account, kind: account.kind as "CARD" | "BANK" },
      since,
      now,
    );
    const stats = await ingestTransactions({
      userId: account.userId,
      accountId,
      accountKind: account.kind as "CARD" | "BANK",
      source: "AUTO",
      items,
    });
    await prisma.linkedAccount.update({
      where: { id: accountId },
      data: { syncStatus: "OK", lastSyncedAt: now, lastError: null, failCount: 0 },
    });
    return { ok: true as const, stats };
  } catch (e) {
    const isAuth = e instanceof ProviderAuthError;
    const failCount = account.failCount + 1;
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    await prisma.linkedAccount.update({
      where: { id: accountId },
      data: { syncStatus: isAuth ? "REAUTH" : "ERROR", lastError: message, failCount },
    });
    if (isAuth || failCount >= 2) {
      await notifyOnce(
        account.userId,
        `syncfail:${accountId}:${account.lastSyncedAt?.toISOString() ?? "never"}`,
        "SYNC_FAIL",
        "연동 끊김",
        `${account.name} 내역을 가져오지 못했어요. 다시 연결해 주세요.`,
        "/accounts",
      );
    }
    return { ok: false as const, error: message };
  }
}

/** 사용자의 모든 계정을 동기화하고 고정지출 대조·감지까지 돌린다 */
export async function syncUser(userId: string, opts: { onlyStale?: boolean } = {}) {
  const accounts = await prisma.linkedAccount.findMany({ where: { userId } });
  const cutoff = Date.now() - (opts.onlyStale ? 5 * 60 * 1000 : 0);
  let ran = 0;
  for (const a of accounts) {
    if (a.syncStatus === "REAUTH") continue; // 사용자가 다시 연결해야 함
    if (opts.onlyStale && a.lastSyncedAt && a.lastSyncedAt.getTime() > cutoff) continue;
    await syncAccount(a.id);
    ran++;
  }
  await afterDataChange(userId);
  return { ran };
}

export async function afterDataChange(userId: string) {
  const today = todayStr();
  await reconcileRecurring(userId, today);
  await notifySuggestions(userId, today);
}

export async function syncAllUsers() {
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const u of users) await syncUser(u.id);
}
