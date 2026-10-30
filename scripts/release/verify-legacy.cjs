const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const migration = require('./migrate-sqlite.cjs');
const root = path.resolve(__dirname, '../..');
const sandbox = fs.mkdtempSync(path.join(root, '.release-test-'));
const database = path.join(sandbox, 'legacy-p2-auth-test.db');
const env = { ...process.env, DATABASE_URL: `file:${database.replaceAll('\\', '/')}`, ACCOUNTBOOK_API_URL: '', REDIS_URL: '', SYNC_MODE: 'local', NEXT_TELEMETRY_DISABLED: '1' };
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  assert.equal(result.status, 0, result.stderr || result.stdout); return result.stdout;
}
async function executeSchema(db, sql) {
  for (const s of sql.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) await db.$executeRawUnsafe(s);
}
async function fixture(db) {
  for (const id of ['legacy-a', 'legacy-b']) await db.$executeRawUnsafe('INSERT INTO "User" (id,name) VALUES (?,?)', id, id);
  await db.$executeRawUnsafe('INSERT INTO "Category" (id,name,kind) VALUES (?,?,?)', 'cat', 'fixture', 'EXPENSE');
  for (const suffix of ['a', 'b']) {
    await db.$executeRawUnsafe('INSERT INTO "LinkedAccount" (id,userId,provider,name,kind) VALUES (?,?,?,?,?)', `account-${suffix}`, `legacy-${suffix}`, 'fixture', 'private', 'CARD');
    await db.$executeRawUnsafe('INSERT INTO "Transaction" (id,userId,accountId,occurredAt,amount,kind,merchantRaw,merchantNorm,categoryId,source) VALUES (?,?,?,?,?,?,?,?,?,?)', `tx-${suffix}`, `legacy-${suffix}`, `account-${suffix}`, new Date('2026-10-01T01:00:00Z'), suffix === 'a' ? -12345 : 2300, suffix === 'a' ? 'EXPENSE' : 'INCOME', 'private merchant', 'merchant', 'cat', 'MANUAL');
    await db.$executeRawUnsafe('INSERT INTO "Notification" (id,userId,key,type,title,body) VALUES (?,?,?,?,?,?)', `notice-${suffix}`, `legacy-${suffix}`, `key-${suffix}`, 'DUE', 'fixture', 'body');
    await db.$executeRawUnsafe('INSERT INTO "Budget" (id,userId,month,livingAmount) VALUES (?,?,?,?)', `budget-${suffix}`, `legacy-${suffix}`, '2026-10', 250000);
    await db.$executeRawUnsafe('INSERT INTO "CategoryRule" (id,userId,merchantNorm,categoryId) VALUES (?,?,?,?)', `categoryrule-${suffix}`, `legacy-${suffix}`, 'merchant', 'cat');
    await db.$executeRawUnsafe('INSERT INTO "RecurringDismissal" (id,userId,merchantNorm,until) VALUES (?,?,?,?)', `dismissal-${suffix}`, `legacy-${suffix}`, 'other', '2026-12-31');
    await db.$executeRawUnsafe('INSERT INTO "RecurringRule" (id,userId,name,amount,cycle,dueDay,startDate,categoryId) VALUES (?,?,?,?,?,?,?,?)', `rule-${suffix}`, `legacy-${suffix}`, 'monthly', 12345, 'MONTHLY', 1, '2026-01-01', 'cat');
    await db.$executeRawUnsafe('INSERT INTO "RecurringOccurrence" (id,ruleId,dueDate,status,transactionId,matchedAmount) VALUES (?,?,?,?,?,?)', `occurrence-${suffix}`, `rule-${suffix}`, '2026-10-01', 'PAID', `tx-${suffix}`, 12345);
  }
}
async function main() {
  fs.copyFileSync(path.join(root, 'scripts/legacy-schema.prisma'), path.join(sandbox, 'legacy.prisma'));
  const cli = 'node_modules/prisma/build/index.js';
  const oldSql = run([cli, 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.join(sandbox, 'legacy.prisma'), '--script']);
  const targetSql = run([cli, 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script']);
  fs.writeFileSync(path.join(__dirname, 'target-schema.sql'), targetSql);
  const target = migration.connect(path.join(sandbox, 'target.db'));
  try {
    await executeSchema(target, targetSql);
    const shape = {};
    for (const table of [...migration.oldTables, ...migration.newTables]) shape[table] = await migration.shape(target, table);
    fs.writeFileSync(path.join(__dirname, 'target-shape.json'), JSON.stringify(shape, null, 2) + '\n');
  } finally { await target.$disconnect(); }
  const db = migration.connect(database);
  let before;
  try { await executeSchema(db, oldSql); await fixture(db); before = await migration.snapshot(db); } finally { await db.$disconnect(); }
  const migrationOutput = run(['scripts/release/migrate-sqlite.cjs', '--database', database, '--backup', path.join(sandbox, 'before.db')]);
  assert.equal(JSON.parse(migrationOutput).migrated, true);
  try {
    assert.deepEqual(await migration.snapshot(db, before), before);
    assert.equal(await db.user.count({ where: { email: null, passwordHash: null, claimTokenHash: null } }), 2);
    assert.deepEqual((await db.transaction.findMany({ orderBy: { id: 'asc' } })).map(t => [t.id,t.userId,t.amount,t.installmentMonths,t.firstBillingMonth,t.refundOfId]), [['tx-a','legacy-a',-12345,1,null,null],['tx-b','legacy-b',2300,1,null,null]]);
    await db.notification.create({ data: { userId: 'legacy-b', key: 'key-a', type: 'DUE', title: 'same key different user', body: 'allowed' } });
    await assert.rejects(db.notification.create({ data: { userId: 'legacy-a', key: 'key-a', type: 'DUE', title: 'duplicate', body: 'blocked' } }));
    await db.transaction.update({ where: { id: 'tx-a' }, data: { installmentMonths: 7, firstBillingMonth: '2026-11' } });
    await db.transaction.update({ where: { id: 'tx-b' }, data: { refundOfId: 'tx-a' } });
    await db.user.update({ where: { id: 'legacy-b' }, data: { claimTokenHash: 'fixture-claim-hash', claimExpiresAt: new Date('2026-12-31T00:00:00Z') } });
    await db.session.create({ data: { tokenHash: 'fixture-session-hash', userId: 'legacy-a', expiresAt: new Date('2026-12-31T00:00:00Z') } });
    await db.authRateLimit.create({ data: { key: 'fixture-rate-limit', attempts: 3, expiresAt: new Date('2026-12-31T00:00:00Z') } });
    await db.notificationPreference.create({ data: { userId: 'legacy-a', codeAttempts: 2 } });
    await db.pushSubscription.create({ data: { userId: 'legacy-a', endpoint: 'https://example.invalid/fixture', p256dh: 'fixture-key', auth: 'fixture-auth' } });
    const batch = await db.notificationBatch.create({ data: { userId: 'legacy-a', slot: 'fixture-slot', cutoff: new Date(), expiresAt: new Date('2026-12-31T00:00:00Z') } });
    await db.notificationDelivery.create({ data: { batchId: batch.id, channel: 'EMAIL', target: 'fixture@example.invalid', count: 1, retryAt: new Date() } });
    const rerun = await migration.snapshot(db);
    await migration.apply(db); assert.deepEqual(await migration.snapshot(db), rerun);
    await db.transaction.delete({ where: { id: 'tx-a' } });
    assert.equal((await db.transaction.findUniqueOrThrow({ where: { id: 'tx-b' } })).refundOfId, null);
    await migration.integrity(db);
  } finally { await db.$disconnect(); }
  for (const variant of ['bad-index', 'bad-partial-index', 'bad-installment']) {
    const bad = migration.connect(path.join(sandbox, `${variant}.db`));
    try {
      await executeSchema(bad, oldSql); await fixture(bad);
      if (variant === 'bad-index') await bad.$executeRawUnsafe('CREATE INDEX "Notification_userId_key_key" ON "Notification" (key)');
      else if (variant === 'bad-partial-index') await bad.$executeRawUnsafe('CREATE UNIQUE INDEX "Notification_userId_key_key" ON "Notification" (userId,key) WHERE userId = \'legacy-a\'');
      else await bad.$executeRawUnsafe('ALTER TABLE "Transaction" ADD COLUMN "installmentMonths" INTEGER');
      const original = await migration.snapshot(bad);
      await assert.rejects(migration.apply(bad), /Unsupported schema drift/);
      assert.deepEqual(await migration.snapshot(bad), original);
      assert.ok((await bad.$queryRawUnsafe('PRAGMA index_list("Notification")')).some(i => i.name === 'Notification_key_key'));
      assert.equal((await bad.$queryRawUnsafe('PRAGMA table_info("User")')).some(c => c.name === 'email'), false);
    } finally { await bad.$disconnect(); }
  }
  const authOutput = run(['node_modules/tsx/dist/cli.mjs', 'scripts/auth/verify.ts']);
  const report = { checkedAt: new Date().toISOString(), base: '7f784b3', database, backup: path.join(sandbox, 'before.db'), originalTables: before, preservedRowsAndAmounts: true, legacyOwnersUnclaimed: true, rerunPreservesNewValues: true, notificationCompositeUnique: true, refundSetNull: true, malformedSchemasRollBack: true, authVerification: authOutput.trim(), productionDatabaseTouched: false };
  fs.writeFileSync(path.join(root, 'docs/release-candidate/migration-results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('PASS: synthetic legacy migration, backup, all existing values, schema equivalence, rerun, FK, auth claim and rollback guards');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
