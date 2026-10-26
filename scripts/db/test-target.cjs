const assert = require('node:assert/strict');
function assertTestDatabase() {
  const value = process.env.DATABASE_URL || '';
  if (/^file:.*p2-auth-test\.db$/.test(value)) return;
  const url = new URL(value);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol) && url.hostname === '127.0.0.1' && url.pathname === '/accountbook_test', 'Only isolated local test databases are allowed');
}
module.exports = { assertTestDatabase };
