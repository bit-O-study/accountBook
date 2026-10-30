import assert from "node:assert/strict";
import { prisma } from "../../src/lib/db";
import { notifyOnce } from "../../src/lib/notify";

async function main() {
  require("../db/test-target.cjs").assertTestDatabase();
  const users = await Promise.all(["notification-A", "notification-B"].map(name => prisma.user.create({ data: { name } })));
  try {
    const key = `concurrent-${Date.now()}`;
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => notifyOnce(users[0].id, key, "DUE", "첫 알림", "원본 내용", "/fixed")));
    const created = results.filter(r => r.status === "fulfilled" && r.value === true).length;
    const duplicates = results.filter(r => r.status === "fulfilled" && r.value === false).length;
    const rejected = results.filter(r => r.status === "rejected").length;
    console.log({ created, duplicates, rejected });
    assert.equal(rejected, 0, "Concurrent duplicate notifications must not reject");
    assert.equal(created, 1);
    assert.equal(duplicates, 19);
    assert.equal(await prisma.notification.count({ where: { userId: users[0].id, key } }), 1);
    const readAt = new Date("2026-10-25T00:00:00.000Z");
    const original = await prisma.notification.update({ where: { userId_key: { userId: users[0].id, key } }, data: { readAt } });
    assert.equal(await notifyOnce(users[0].id, key, "MISSING", "덮어쓰면 안 됨", "변경된 내용", "/accounts"), false);
    assert.deepEqual(await prisma.notification.findUniqueOrThrow({ where: { id: original.id } }), original);
    assert.equal(await notifyOnce(users[1].id, key, "DUE", "다른 사용자", "독립 알림"), true);
    assert.equal(await prisma.notification.count({ where: { key } }), 2);
    await assert.rejects(notifyOnce(`missing-${users[0].id}`, key, "DUE", "오류", "오류"), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2003");
    console.log("PASS: concurrent deduplication, user isolation, original content/read state preservation, foreign-key error propagation");
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
