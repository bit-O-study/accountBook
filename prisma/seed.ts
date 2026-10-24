// 데모 데이터: 데모 연동 계정 3개(1개는 재인증 필요), 고정지출 5건, 생활비 예산, 수동 입력 몇 건.
// 실행: npm run setup  (DB 초기화 + 이 스크립트)

import { prisma } from "../src/lib/db";
import { addDays, kstDateTime, shiftMonth, todayStr } from "../src/lib/dates";
import { CATEGORIES } from "../src/lib/sync/categorize";
import { normalizeMerchant } from "../src/lib/sync/normalize";
import { syncUser } from "../src/lib/sync/service";

async function main() {
  const today = todayStr();

  for (const [i, c] of CATEGORIES.entries()) {
    await prisma.category.upsert({ where: { name: c.name }, update: { sortOrder: i }, create: { name: c.name, kind: c.kind, sortOrder: i } });
  }
  const cat = new Map((await prisma.category.findMany()).map((c) => [c.name, c.id]));

  const user = await prisma.user.create({ data: { name: "나" } });

  await prisma.linkedAccount.createMany({
    data: [
      { userId: user.id, provider: "demo", name: "신한카드", kind: "CARD" },
      { userId: user.id, provider: "demo", name: "국민은행", kind: "BANK" },
      { userId: user.id, provider: "demo", name: "현대카드", kind: "CARD", providerConfig: "fail" },
    ],
  });

  const start = addDays(today, -120);
  const rules = [
    { name: "실손보험", amount: 84000, dueDay: 5, merchant: "DB손해보험", category: "보험", payment: "국민은행 자동이체" },
    { name: "넷플릭스", amount: 17000, dueDay: 15, merchant: "넷플릭스", category: "구독", payment: "신한카드" },
    { name: "SKT 통신요금", amount: 59000, dueDay: 20, merchant: "SK텔레콤", category: "통신", payment: "신한카드" },
    { name: "월세", amount: 550000, dueDay: 25, merchant: "월세 김민수", category: "주거", payment: "국민은행 이체" },
    { name: "헬스장", amount: 70000, dueDay: 28, merchant: "에이블짐", category: "건강", payment: "신한카드" },
  ];
  for (const r of rules) {
    await prisma.recurringRule.create({
      data: {
        userId: user.id,
        name: r.name,
        amount: r.amount,
        cycle: "MONTHLY",
        dueDay: r.dueDay,
        merchantNorm: normalizeMerchant(r.merchant).norm,
        categoryId: cat.get(r.category),
        payment: r.payment,
        startDate: start,
      },
    });
  }

  const month = today.slice(0, 7);
  for (let i = -3; i <= 0; i++) {
    await prisma.budget.create({ data: { userId: user.id, month: shiftMonth(month, i), livingAmount: 1500000 } });
  }

  const manual = [
    { date: addDays(today, -1), merchant: "점심 (현금)", amount: -9000, category: "식비" },
    { date: addDays(today, -6), merchant: "친구 결혼식 축의금", amount: -50000, category: "기타" },
    { date: addDays(today, -11), merchant: "세탁소", amount: -12000, category: "기타" },
  ];
  for (const m of manual) {
    await prisma.transaction.create({
      data: {
        userId: user.id,
        occurredAt: kstDateTime(m.date, "12:30"),
        amount: m.amount,
        kind: "EXPENSE",
        merchantRaw: m.merchant,
        merchantNorm: normalizeMerchant(m.merchant).norm,
        categoryId: cat.get(m.category),
        source: "MANUAL",
      },
    });
  }

  await syncUser(user.id);

  const [tx, occ, noti] = await Promise.all([
    prisma.transaction.count(),
    prisma.recurringOccurrence.count(),
    prisma.notification.count(),
  ]);
  console.log(`데모 데이터 준비 완료: 거래 ${tx}건, 고정지출 회차 ${occ}건, 알림 ${noti}건`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
