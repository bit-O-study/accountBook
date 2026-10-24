// 이번 달 요약: 생활비 예산은 고정지출을 뺀 돈만 계산한다.
//   하루 가능 금액 = 남은 생활비 ÷ 남은 날짜(오늘 포함)
//   월말 예상 잔액 = 수입 - 지출 - 남은 고정지출 - 남은 생활비 예산

import { diffDays, monthRange, parseDate, type DateStr, type MonthKey } from "@/lib/dates";
import { countsAsIncome, countsAsSpending } from "@/lib/sync/categorize";

export interface SummaryTx {
  date: DateStr;
  amount: number;
  kind: string;
  status: string;
  excluded: boolean;
  category: string;
  recurring: boolean;
}

export interface SummaryOccurrence {
  dueDate: DateStr;
  status: string;
  amount: number; // 규칙 금액 또는 실제 결제 금액
}

export interface MonthSummary {
  month: MonthKey;
  days: number;
  dayIndex: number; // 오늘이 몇째 날인지 (지난달이면 days, 다음달이면 0)
  daysLeft: number;
  totalSpent: number;
  fixedSpent: number;
  livingSpent: number;
  income: number;
  budget: number | null;
  budgetLeft: number | null;
  budgetUsedRate: number | null;
  dailyAllowance: number | null;
  pace: number | null; // 오늘까지 예산 속도
  paceDiff: number | null; // + 면 예산 속도보다 많이 씀
  fixedTotal: number;
  fixedRemaining: number;
  fixedRemainingCount: number;
  projectedBalance: number;
  cumulative: number[]; // 일자별 생활비 누적 (오늘까지)
  categories: { name: string; amount: number }[];
}

export function summarizeMonth(input: {
  month: MonthKey;
  today: DateStr;
  txs: SummaryTx[];
  occurrences: SummaryOccurrence[];
  budget: number | null;
}): MonthSummary {
  const { month, today, txs, occurrences, budget } = input;
  const r = monthRange(month);
  const dayIndex = today < r.first ? 0 : today > r.last ? r.days : diffDays(today, r.first) + 1;
  const daysLeft = today < r.first ? r.days : today > r.last ? 0 : r.days - dayIndex + 1;

  let totalSpent = 0;
  let fixedSpent = 0;
  let income = 0;
  const daily = new Array<number>(r.days).fill(0);
  const cats = new Map<string, number>();

  for (const t of txs) {
    if (t.date < r.first || t.date > r.last) continue;
    if (countsAsIncome(t)) income += t.amount;
    if (!countsAsSpending(t)) continue;
    const spent = -t.amount;
    totalSpent += spent;
    if (t.recurring) {
      fixedSpent += spent;
      continue;
    }
    daily[parseDate(t.date).d - 1] += spent;
    cats.set(t.category, (cats.get(t.category) ?? 0) + spent);
  }
  const livingSpent = totalSpent - fixedSpent;

  const cumulative: number[] = [];
  let acc = 0;
  for (let i = 0; i < dayIndex; i++) {
    acc += daily[i];
    cumulative.push(acc);
  }

  let fixedTotal = 0;
  let fixedRemaining = 0;
  let fixedRemainingCount = 0;
  for (const o of occurrences) {
    if (o.dueDate < r.first || o.dueDate > r.last) continue;
    fixedTotal += o.amount;
    if (o.status === "SCHEDULED" || o.status === "MISSING") {
      fixedRemaining += o.amount;
      fixedRemainingCount++;
    }
  }

  const budgetLeft = budget == null ? null : budget - livingSpent;
  const dailyAllowance =
    budgetLeft == null || daysLeft === 0 ? null : Math.max(0, Math.floor(budgetLeft / daysLeft));
  const pace = budget == null ? null : Math.round((budget * dayIndex) / r.days);

  return {
    month,
    days: r.days,
    dayIndex,
    daysLeft,
    totalSpent,
    fixedSpent,
    livingSpent,
    income,
    budget,
    budgetLeft,
    budgetUsedRate: budget ? livingSpent / budget : null,
    dailyAllowance,
    pace,
    paceDiff: pace == null ? null : livingSpent - pace,
    fixedTotal,
    fixedRemaining,
    fixedRemainingCount,
    projectedBalance: income - totalSpent - fixedRemaining - Math.max(0, budgetLeft ?? 0),
    cumulative,
    categories: [...cats.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
  };
}
