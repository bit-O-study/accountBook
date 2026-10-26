// 명시적으로 지정한 SQLite에만 적용. 배포 전 모든 writer를 중단해야 한다.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const connect = file => new PrismaClient({ datasourceUrl: `file:${file.replaceAll('\\', '/')}` });
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const normalize = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v);
const digest = value => crypto.createHash('sha256').update(normalize(value)).digest('hex');
const additions = {
  User: { email: 'TEXT', passwordHash: 'TEXT', claimTokenHash: 'TEXT', claimExpiresAt: 'DATETIME' },
  Transaction: { installmentMonths: 'INTEGER NOT NULL DEFAULT 1', firstBillingMonth: 'TEXT', refundOfId: 'TEXT REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE NO ACTION' },
};
const newTables = ['Session', 'AuthRateLimit', 'NotificationPreference', 'PushSubscription', 'NotificationBatch', 'NotificationDelivery'];
const oldTables = ['User', 'LinkedAccount', 'Category', 'Transaction', 'CategoryRule', 'RecurringRule', 'RecurringOccurrence', 'RecurringDismissal', 'Budget', 'Notification'];
async function snapshot(db, baseline) {
  const result = [];
  const tables = baseline ? baseline.map(t => t.table) : [...oldTables, ...newTables];
  for (const table of tables) {
    const info = await db.$queryRawUnsafe(`PRAGMA table_info(${quote(table)})`);
    if (!info.length && !baseline && newTables.includes(table)) continue;
    const columns = baseline ? baseline.find(t => t.table === table).columns : info.map(c => c.name);
    assert.ok(columns.length, `Missing legacy table: ${table}`);
    const rows = await db.$queryRawUnsafe(`SELECT ${columns.map(quote).join(',')} FROM ${quote(table)}`);
    rows.sort((a,b) => normalize(a).localeCompare(normalize(b)));
    result.push({ table, columns, count: rows.length, hash: digest(rows) });
  }
  return result;
}
async function integrity(db) {
  assert.deepEqual(await db.$queryRawUnsafe('PRAGMA foreign_key_check'), [], 'Foreign key violations');
  const check = await db.$queryRawUnsafe('PRAGMA integrity_check');
  assert.equal(check.length, 1); assert.equal(check[0].integrity_check, 'ok');
}
async function shape(db, table) {
  const columns = await db.$queryRawUnsafe(`PRAGMA table_info(${quote(table)})`);
  const fks = await db.$queryRawUnsafe(`PRAGMA foreign_key_list(${quote(table)})`);
  const indexes = await db.$queryRawUnsafe(`PRAGMA index_list(${quote(table)})`);
  const keys = [];
  for (const index of indexes.filter(i => i.origin === 'c')) {
    const cols = await db.$queryRawUnsafe(`PRAGMA index_xinfo(${quote(index.name)})`);
    keys.push({ name: index.name, unique: Number(index.unique), partial: Number(index.partial), columns: cols.filter(c => Number(c.key) === 1).map(c => ({ name: c.name, coll: c.coll, desc: Number(c.desc) })) });
  }
  return { columns: columns.map(c => ({ name: c.name, type: c.type, notnull: Number(c.notnull), default: c.dflt_value, pk: Number(c.pk) })).sort((a,b) => a.name.localeCompare(b.name)),
    foreignKeys: fks.map(k => ({ table: k.table, from: k.from, to: k.to, on_delete: k.on_delete, on_update: k.on_update })).sort((a,b) => a.from.localeCompare(b.from)),
    indexes: keys.sort((a,b) => a.name.localeCompare(b.name)) };
}
async function apply(db) {
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'target-shape.json'), 'utf8'));
  assert.deepEqual(Object.keys(expected).sort(), [...oldTables, ...newTables].sort(), 'Incomplete target shape');
  const before = await snapshot(db);
  await integrity(db);
  await db.$transaction(async tx => {
    for (const [table, columns] of Object.entries(additions)) {
      const existing = await tx.$queryRawUnsafe(`PRAGMA table_info(${quote(table)})`);
      for (const [name, declaration] of Object.entries(columns)) {
        if (!existing.some(c => c.name === name)) await tx.$executeRawUnsafe(`ALTER TABLE ${quote(table)} ADD COLUMN ${quote(name)} ${declaration}`);
      }
    }
    // Prisma가 생성한 목표 DDL의 새 테이블과 인덱스만 적용한다. 기존 표는 재생성하지 않는다.
    const sql = fs.readFileSync(path.join(__dirname, 'target-schema.sql'), 'utf8').replace(/^--.*$/gm, '');
    for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) {
      const table = statement.match(/^CREATE TABLE "([^"]+)"/);
      const index = statement.match(/^CREATE (?:UNIQUE )?INDEX "([^"]+)" ON "([^"]+)"/);
      if (table && newTables.includes(table[1])) await tx.$executeRawUnsafe(statement.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'));
      if (index && (newTables.includes(index[2]) || ['User_email_key', 'User_claimTokenHash_key', 'Transaction_refundOfId_idx', 'Notification_userId_key_key'].includes(index[1])))
        await tx.$executeRawUnsafe(statement.replace(/^(CREATE (?:UNIQUE )?INDEX)/, '$1 IF NOT EXISTS'));
    }
    await tx.$executeRawUnsafe('DROP INDEX IF EXISTS "Notification_key_key"');
    for (const [table, target] of Object.entries(expected)) assert.deepEqual(await shape(tx, table), target, `Unsupported schema drift: ${table}`);
    const keys = await tx.$queryRawUnsafe('PRAGMA foreign_key_list("Transaction")');
    assert.ok(keys.some(k => k.from === 'refundOfId' && k.table === 'Transaction' && k.on_delete === 'SET NULL' && k.on_update === 'NO ACTION'), 'Refund FK missing or incompatible');
    assert.deepEqual(await snapshot(tx, before), before, 'Existing row values changed');
    await integrity(tx);
  }, { timeout: 30000 });
  return before;
}
async function main() {
  const args = process.argv.slice(2);
  assert.equal(args.length, 4, 'Usage: node scripts/release/migrate-sqlite.cjs --database <absolute.db> --backup <new-absolute.db>');
  assert.equal(args[0], '--database'); assert.equal(args[2], '--backup');
  const [source, backup] = [args[1], args[3]];
  assert.ok(path.isAbsolute(source) && path.isAbsolute(backup), 'Absolute paths required');
  assert.ok(fs.existsSync(source) && !fs.existsSync(backup), 'Existing source and unused backup path required');
  assert.notEqual(path.resolve(source).toLowerCase(), path.resolve(backup).toLowerCase());
  const db = connect(source);
  try {
    await integrity(db); const before = await snapshot(db);
    await db.$executeRawUnsafe('VACUUM INTO ?', backup.replaceAll('\\', '/'));
    const check = connect(backup);
    try { assert.deepEqual(await snapshot(check), before); await integrity(check); } finally { await check.$disconnect(); }
    assert.deepEqual(await snapshot(db), before, 'Database changed; stop writers before migration');
    await apply(db);
    console.log(JSON.stringify({ migrated: true, backupCreated: true, preserved: before }, null, 2));
  } finally { await db.$disconnect(); }
}
module.exports = { connect, apply, snapshot, integrity, shape, oldTables, newTables };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
