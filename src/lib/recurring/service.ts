// 고정지출 회차를 만들고 실제 거래와 대조한다. 동기화·거래 수정·규칙 변경 뒤에 호출한다.

import { prisma } from "@/lib/db";
import { addDays, kstDateStr, kstStartOfDay, monthRange, shiftMonth, todayStr, type DateStr } from "@/lib/dates";
import { won } from "@/lib/money";
import { notifyOnce } from "@/lib/notify";
import { detectRecurring, type Suggestion } from "./detect";
import { evaluateOccurrence, type MatchTx } from "./match";
import { dueDatesInRange, isNotifyDay } from "./schedule";

export async function reconcileRecurring(userId: string, today: DateStr = todayStr()) {
  const thisMonth = today.slice(0, 7);
  const from = monthRange(shiftMonth(thisMonth, -2)).first;
  const to = monthRange(thisMonth).last;

  const rules = await prisma.recurringRule.findMany({ where: { userId }, include: { occurrences: true } });
  const txRows = await prisma.transaction.findMany({
    where: {
      userId,
      occurredAt: { gte: kstStartOfDay(addDays(from, -3)), lt: kstStartOfDay(addDays(to, 4)) },
    },
    select: { id: true, occurredAt: true, amount: true, merchantNorm: true, kind: true, status: true, excluded: true },
  });
  const txs: MatchTx[] = txRows
    .filter((t) => !t.excluded)
    .map((t) => ({ ...t, date: kstDateStr(t.occurredAt) }));

  const used = new Set<string>();
  for (const r of rules) for (const o of r.occurrences) if (o.transactionId) used.add(o.transactionId);

  for (const rule of rules) {
    const dues = new Set(dueDatesInRange(rule, from, to));

    // 규칙이 바뀌어 더 이상 해당하지 않는 회차는 정리
    for (const o of rule.occurrences) {
      if (o.dueDate >= from && !dues.has(o.dueDate)) {
        await prisma.recurringOccurrence.delete({ where: { id: o.id } });
        if (o.transactionId) used.delete(o.transactionId);
      }
    }

    for (const due of dues) {
      const existing = rule.occurrences.find((o) => o.dueDate === due);
      if (existing?.transactionId) used.delete(existing.transactionId);
      const res = evaluateOccurrence(rule, due, txs, used, today);
      if (res.txId) used.add(res.txId);

      const data = { status: res.status, transactionId: res.txId ?? null, matchedAmount: res.amount ?? null };
      if (!existing) {
        await prisma.recurringOccurrence.create({ data: { ruleId: rule.id, dueDate: due, ...data } });
      } else if (
        existing.status !== data.status ||
        existing.transactionId !== data.transactionId ||
        existing.matchedAmount !== data.matchedAmount
      ) {
        await prisma.recurringOccurrence.update({ where: { id: existing.id }, data });
      }

      // 알림 (E-01 결제 예정, E-02 미확인, E-03 금액변동)
      if (res.status === "SCHEDULED") {
        const left = isNotifyDay(due, today, rule.notifyDays);
        if (left != null) {
          await notifyOnce(
            userId,
            `due:${rule.id}:${due}:${left}`,
            "DUE",
            "결제 예정",
            `${left === 0 ? "오늘" : left === 1 ? "내일" : `${left}일 뒤`} ${rule.name} ${won(rule.amount)}원이 나가요.`,
            "/fixed",
          );
        }
      } else if (res.status === "MISSING" && due >= addDays(today, -10)) {
        await notifyOnce(userId, `missing:${rule.id}:${due}`, "MISSING", "납부 미확인", `${rule.name} ${won(rule.amount)}원이 아직 안 나갔어요.`, "/fixed");
      } else if (res.status === "CHANGED" && res.amount != null) {
        await notifyOnce(
          userId,
          `changed:${rule.id}:${due}`,
          "CHANGED",
          "금액 변동",
          `${rule.name}이(가) ${won(rule.amount)} → ${won(res.amount)}원으로 바뀌었어요.`,
          "/fixed",
        );
      }
    }
  }
}

/** 등록 제안 목록 (B-02). 이미 규칙이 있거나 90일 무시한 가맹점은 뺀다. */
export async function getSuggestions(userId: string, today: DateStr = todayStr()): Promise<Suggestion[]> {
  const [rules, dismissals, rows] = await Promise.all([
    prisma.recurringRule.findMany({ where: { userId }, select: { merchantNorm: true, name: true } }),
    prisma.recurringDismissal.findMany({ where: { userId, until: { gte: today } } }),
    prisma.transaction.findMany({
      where: { userId, occurredAt: { gte: kstStartOfDay(addDays(today, -130)) } },
      select: {
        occurredAt: true,
        amount: true,
        merchantNorm: true,
        merchantRaw: true,
        kind: true,
        status: true,
        excluded: true,
        occurrence: { select: { id: true } },
      },
    }),
  ]);
  const exclude = new Set<string>([
    ...rules.map((r) => r.merchantNorm ?? r.name),
    ...dismissals.map((d) => d.merchantNorm),
  ]);
  return detectRecurring(
    rows.map((t) => ({ ...t, date: kstDateStr(t.occurredAt), recurring: !!t.occurrence })),
    exclude,
    today,
  );
}

export async function notifySuggestions(userId: string, today: DateStr = todayStr()) {
  for (const s of await getSuggestions(userId, today)) {
    await notifyOnce(
      userId,
      `suggest:${s.merchantNorm}`,
      "SUGGEST",
      "새 고정지출",
      `${s.name} ${won(s.amount)}원이 ${s.count}번 반복 결제됐어요. 등록할까요?`,
      "/fixed",
    );
  }
}
