// Framework-independent commands. The caller must supply the authenticated user.

import { categoryMaps, prisma } from "@/lib/db";
import { addDays, isValidDateStr, isValidMonthKey, kstDateStr, kstDateTime, parseDate, todayStr } from "@/lib/dates";
import { parseWon, won } from "@/lib/money";
import { getSuggestions } from "@/lib/recurring/service";
import { parseCsv } from "@/lib/sync/csv";
import { normalizeMerchant } from "@/lib/sync/normalize";
import { DEMO_INSTITUTIONS } from "@/lib/sync/providers";
import { afterDataChange, ingestTransactions, syncAccount, syncUser } from "@/lib/sync/service";

export interface FormState {
  ok?: boolean;
  message?: string;
}

function done(message?: string): FormState {
  return { ok: true, message };
}

function fail(message: string): FormState {
  return { ok: false, message };
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/* ── 동기화 ── */

export async function syncNowAction(user: { id: string }) {
  await syncUser(user.id);
}

/** 앱을 열 때 한 번: 5분 넘게 지난 계정만 */
export async function syncIfStaleAction(user: { id: string }): Promise<boolean> {
  const { ran } = await syncUser(user.id, { onlyStale: true });
  return ran > 0;
}

/* ── 거래 ── */

export async function addTransactionAction(user: { id: string }, _: FormState, f: FormData): Promise<FormState> {
  const date = str(f, "date");
  const amount = parseWon(str(f, "amount"));
  const merchant = str(f, "merchant");
  const direction = str(f, "direction") === "IN" ? "IN" : "OUT";
  const categoryId = str(f, "categoryId") || null;
  if (!isValidDateStr(date)) return fail("날짜를 확인해 주세요.");
  if (!Number.isFinite(amount) || amount <= 0) return fail("금액은 1~2,147,483,647원 사이 정수로 입력해 주세요.");
  if (!merchant) return fail("어디에 썼는지 적어 주세요.");
  const time = str(f, "time") || "12:00";
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(time)) return fail("시간은 00:00~23:59 형식으로 입력해 주세요.");

  await prisma.transaction.create({
    data: {
      userId: user.id,
      occurredAt: kstDateTime(date, time),
      amount: direction === "IN" ? amount : -amount,
      kind: direction === "IN" ? "INCOME" : "EXPENSE",
      merchantRaw: merchant,
      merchantNorm: normalizeMerchant(merchant).norm,
      categoryId,
      source: "MANUAL",
      memo: str(f, "memo") || null,
    },
  });
  await afterDataChange(user.id);
  return done(`${merchant} ${won(amount)}원을 기록했어요.`);
}

export async function updateTransactionAction(user: { id: string }, _: FormState, f: FormData): Promise<FormState> {
  const id = str(f, "id");
  const tx = await prisma.transaction.findFirst({ where: { id, userId: user.id } });
  if (!tx) return fail("거래를 찾지 못했어요.");
  const categoryId = str(f, "categoryId") || null;
  const applyAll = f.get("applyAll") === "on";

  await prisma.transaction.update({
    where: { id },
    data: { categoryId, memo: str(f, "memo") || null, excluded: f.get("excluded") === "on" },
  });

  let message = "저장했어요.";
  if (applyAll && categoryId && categoryId !== tx.categoryId) {
    // 같은 가맹점은 앞으로도 이 카테고리로 (내 규칙 학습)
    await prisma.categoryRule.upsert({
      where: { userId_merchantNorm: { userId: user.id, merchantNorm: tx.merchantNorm } },
      update: { categoryId },
      create: { userId: user.id, merchantNorm: tx.merchantNorm, categoryId },
    });
    const { count } = await prisma.transaction.updateMany({
      where: { userId: user.id, merchantNorm: tx.merchantNorm },
      data: { categoryId },
    });
    message = `${tx.merchantNorm} 거래 ${count}건을 모두 바꿨어요.`;
  }
  await afterDataChange(user.id);
  return done(message);
}

export async function deleteTransactionAction(user: { id: string }, id: string): Promise<FormState> {
  const tx = await prisma.transaction.findFirst({ where: { id, userId: user.id } });
  if (!tx) return fail("거래를 찾지 못했어요.");
  if (tx.source === "AUTO") return fail("자동 기록은 삭제 대신 ‘통계에서 빼기’를 써 주세요. 다음 동기화 때 다시 들어와요.");
  await prisma.transaction.delete({ where: { id } });
  await afterDataChange(user.id);
  return done("삭제했어요.");
}

/** 거래 상세 → 고정지출로 지정 (B-03) */
export async function makeRecurringFromTxAction(user: { id: string }, id: string): Promise<FormState> {
  const tx = await prisma.transaction.findFirst({ where: { id, userId: user.id } });
  if (!tx || tx.amount >= 0) return fail("지출 거래만 고정지출로 지정할 수 있어요.");
  const exists = await prisma.recurringRule.findFirst({ where: { userId: user.id, merchantNorm: tx.merchantNorm } });
  if (exists) return fail(`${exists.name}은(는) 이미 고정지출이에요.`);
  const date = kstDateStr(tx.occurredAt);
  await prisma.recurringRule.create({
    data: {
      userId: user.id,
      name: tx.merchantNorm,
      amount: -tx.amount,
      cycle: "MONTHLY",
      dueDay: parseDate(date).d,
      merchantNorm: tx.merchantNorm,
      categoryId: tx.categoryId,
      startDate: addDays(date, -1),
    },
  });
  await afterDataChange(user.id);
  return done(`${tx.merchantNorm}을(를) 매월 ${parseDate(date).d}일 고정지출로 등록했어요.`);
}

/* ── 고정지출 ── */

export async function saveRecurringAction(user: { id: string }, _: FormState, f: FormData): Promise<FormState> {
  const id = str(f, "id");
  const name = str(f, "name");
  const amount = parseWon(str(f, "amount"));
  const cycle = str(f, "cycle");
  const dueDay = parseInt(str(f, "dueDay"), 10);
  const dueMonth = parseInt(str(f, "dueMonth"), 10);
  const variable = f.get("variable") === "on";
  const amountMin = variable ? parseWon(str(f, "amountMin")) : NaN;
  const amountMax = variable ? parseWon(str(f, "amountMax")) : NaN;
  const endDate = str(f, "endDate");

  if (!name) return fail("이름을 입력해 주세요.");
  if (!Number.isFinite(amount) || amount <= 0) return fail("금액은 1~2,147,483,647원 사이 정수로 입력해 주세요.");
  if (!["MONTHLY", "WEEKLY", "YEARLY"].includes(cycle)) return fail("주기를 골라 주세요.");
  if (cycle === "WEEKLY" ? !(dueDay >= 0 && dueDay <= 6) : !(dueDay >= 1 && dueDay <= 31)) return fail("결제일을 확인해 주세요.");
  if (cycle === "YEARLY" && !(dueMonth >= 1 && dueMonth <= 12)) return fail("결제 월을 골라 주세요.");
  if (variable && (!Number.isFinite(amountMin) || !Number.isFinite(amountMax) || amountMin > amountMax))
    return fail("변동 금액의 최소·최대를 확인해 주세요.");
  if (endDate && !isValidDateStr(endDate)) return fail("종료일을 확인해 주세요.");

  const merchantInput = str(f, "merchant");
  const data = {
    name,
    amount,
    cycle,
    dueDay,
    dueMonth: cycle === "YEARLY" ? dueMonth : null,
    amountMin: variable ? amountMin : null,
    amountMax: variable ? amountMax : null,
    merchantNorm: normalizeMerchant(merchantInput || name).norm,
    categoryId: str(f, "categoryId") || null,
    payment: str(f, "payment") || null,
    notifyDays: str(f, "notifyDays"),
    endDate: endDate || null,
  };

  if (id) {
    const rule = await prisma.recurringRule.findFirst({ where: { id, userId: user.id } });
    if (!rule) return fail("고정지출을 찾지 못했어요.");
    await prisma.recurringRule.update({ where: { id }, data });
  } else {
    await prisma.recurringRule.create({
      // 등록 전 달은 대조하지 않는다 (이번 달 이미 나간 결제만 납부완료로 잡음)
      data: { ...data, userId: user.id, startDate: `${todayStr().slice(0, 7)}-01` },
    });
  }
  await afterDataChange(user.id);
  return done(id ? "수정했어요." : `${name}을(를) 추가했어요.`);
}

export async function togglePauseRecurringAction(user: { id: string }, id: string) {
  const rule = await prisma.recurringRule.findFirst({ where: { id, userId: user.id } });
  if (!rule) return;
  await prisma.recurringRule.update({ where: { id }, data: { paused: !rule.paused } });
  await afterDataChange(user.id);
}

export async function deleteRecurringAction(user: { id: string }, id: string) {
  await prisma.recurringRule.deleteMany({ where: { id, userId: user.id } });
  await afterDataChange(user.id);
}

export async function acceptSuggestionAction(user: { id: string }, merchantNorm: string) {
  const s = (await getSuggestions(user.id)).find((x) => x.merchantNorm === merchantNorm);
  if (!s) return;
  const cats = await categoryMaps();
  const sample = await prisma.transaction.findFirst({
    where: { userId: user.id, merchantNorm },
    orderBy: { occurredAt: "desc" },
    include: { account: true },
  });
  await prisma.recurringRule.create({
    data: {
      userId: user.id,
      name: s.name,
      amount: s.amount,
      cycle: s.cycle,
      dueDay: s.dueDay,
      merchantNorm: s.merchantNorm,
      categoryId: sample?.categoryId ?? cats.byName.get("구독") ?? null,
      payment: sample?.account?.name ?? null,
      startDate: addDays(todayStr(), -130),
    },
  });
  await afterDataChange(user.id);
}

export async function dismissSuggestionAction(user: { id: string }, merchantNorm: string) {
  const until = addDays(todayStr(), 90);
  await prisma.recurringDismissal.upsert({
    where: { userId_merchantNorm: { userId: user.id, merchantNorm } },
    update: { until },
    create: { userId: user.id, merchantNorm, until },
  });
}

/* ── 예산 ── */

export async function setBudgetAction(user: { id: string }, _: FormState, f: FormData): Promise<FormState> {
  const month = str(f, "month");
  const amount = parseWon(str(f, "amount"));
  if (!isValidMonthKey(month)) return fail("월을 확인해 주세요.");
  if (!Number.isFinite(amount) || amount <= 0) return fail("예산은 1~2,147,483,647원 사이 정수로 입력해 주세요.");
  await prisma.budget.upsert({
    where: { userId_month: { userId: user.id, month } },
    update: { livingAmount: amount },
    create: { userId: user.id, month, livingAmount: amount },
  });
  return done(`생활비 예산을 ${won(amount)}원으로 정했어요.`);
}

/* ── 연동 계정 ── */

export async function connectAccountAction(user: { id: string }, _: FormState, f: FormData): Promise<FormState> {
  const inst = DEMO_INSTITUTIONS.find((i) => i.name === str(f, "institution"));
  if (!inst) return fail("카드사나 은행을 골라 주세요.");
  if (await prisma.linkedAccount.findFirst({ where: { userId: user.id, name: inst.name } }))
    return fail(`${inst.name}은(는) 이미 연결돼 있어요.`);
  const acc = await prisma.linkedAccount.create({
    data: { userId: user.id, provider: "demo", name: inst.name, kind: inst.kind },
  });
  const res = await syncAccount(acc.id);
  await afterDataChange(user.id);
  if (!res.ok) return fail(res.error);
  return done(`${inst.name}을(를) 연결하고 거래 ${res.stats.added}건을 가져왔어요.`);
}

export async function reconnectAccountAction(user: { id: string }, id: string) {
  const acc = await prisma.linkedAccount.findFirst({ where: { id, userId: user.id } });
  if (!acc) return;
  // 데모: 다시 로그인하면 인증이 회복된다. 실제 연동사는 여기서 인증 화면으로 보낸다.
  await prisma.linkedAccount.update({ where: { id }, data: { providerConfig: "", syncStatus: "OK", failCount: 0 } });
  await syncAccount(id);
  await afterDataChange(user.id);
}

export async function syncAccountAction(user: { id: string }, id: string) {
  const acc = await prisma.linkedAccount.findFirst({ where: { id, userId: user.id } });
  if (!acc) return;
  await syncAccount(id);
  await afterDataChange(user.id);
}

export async function disconnectAccountAction(user: { id: string }, _: FormState, f: FormData): Promise<FormState> {
  const id = str(f, "id");
  const acc = await prisma.linkedAccount.findFirst({ where: { id, userId: user.id } });
  if (!acc) return fail("계정을 찾지 못했어요.");
  if (f.get("deleteData") === "on") {
    await prisma.transaction.deleteMany({ where: { accountId: id } });
  }
  await prisma.linkedAccount.delete({ where: { id } });
  await afterDataChange(user.id);
  return done(`${acc.name} 연결을 해제했어요.`);
}

/* ── CSV ── */

export async function importCsvAction(user: { id: string }, _: FormState, f: FormData): Promise<FormState> {
  const text = String(f.get("csv") ?? "");
  if (!text.trim()) return fail("CSV 내용을 붙여넣거나 파일을 골라 주세요.");
  const { rows, errors } = parseCsv(text);
  if (!rows.length) return fail(errors[0]?.message ?? "가져올 거래가 없어요.");
  const label = str(f, "label") || "CSV";
  const stats = await ingestTransactions({
    userId: user.id,
    accountId: null,
    accountKind: "CARD",
    source: "CSV",
    items: rows.map((r) => ({
      externalId: r.approvalNo ? `csv:${label}:${r.approvalNo}` : `csv:${label}:${r.date}:${r.time}:${r.merchant}:${r.amount}`,
      type: "APPROVAL",
      occurredAt: kstDateTime(r.date, r.time),
      amount: r.amount,
      merchantRaw: r.merchant,
    })),
  });
  await afterDataChange(user.id);
  const parts = [`${stats.added}건 추가`];
  if (stats.duplicates) parts.push(`${stats.duplicates}건은 이미 있어서 건너뜀`);
  if (stats.merged) parts.push(`${stats.merged}건은 수동 입력과 합침`);
  if (errors.length) parts.push(`${errors.length}줄은 읽지 못함 (${errors.map((e) => e.line).slice(0, 5).join(", ")}번째 줄)`);
  return done(parts.join(" · "));
}

/* ── 알림 ── */

export async function markAllReadAction(user: { id: string }) {
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
}
export { notificationSettingsAction } from "../notifications/service";

export { saveInstallmentAction } from "../installments/service";

export { linkRefundAction, unlinkRefundAction } from "../refunds/service";
