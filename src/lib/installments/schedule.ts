import { isValidMonthKey, shiftMonth } from "../dates";

export function validateInstallment(months: number, firstMonth: string, approvalMonth: string): string | null {
  if (!Number.isInteger(months) || months < 1 || months > 60) return "할부 개월 수는 1~60 사이 정수로 입력해 주세요.";
  if (months === 1) return null;
  if (!isValidMonthKey(firstMonth) || firstMonth < approvalMonth || firstMonth > "9995-01")
    return "첫 청구 월은 승인 월 이후의 올바른 월로 입력해 주세요.";
  return null;
}

export function installmentAmount(total: number, months: number, firstMonth: string, month: string) {
  if (!Number.isSafeInteger(total) || total <= 0 || !Number.isInteger(months) || months < 2 || months > 60 ||
      !isValidMonthKey(firstMonth) || !isValidMonthKey(month)) return null;
  const index = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5)) - 1;
  const offset = index(month) - index(firstMonth);
  if (offset < 0 || offset >= months) return null;
  return { amount: Math.floor(total / months) + (offset < total % months ? 1 : 0),
    remaining: total - Math.floor(total / months) * (offset + 1) - Math.min(total % months, offset + 1),
    installment: offset + 1, months, lastMonth: shiftMonth(firstMonth, months - 1) };
}
