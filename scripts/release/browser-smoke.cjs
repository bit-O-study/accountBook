const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'docs/release-candidate/migration-results.json')));
assert.ok(path.resolve(fixture.database).startsWith(root + path.sep + '.release-test-'));
const env = { ...process.env, DATABASE_URL: `file:${fixture.database.replaceAll('\\', '/')}`, ACCOUNTBOOK_API_URL: '', REDIS_URL: '', SYNC_MODE: 'local', NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: '4428', AUTH_SCREENSHOT_DIR: 'docs/release-candidate/browser' };
const standalone = path.join(root, '.next/standalone');
let server;
async function main() {
  await new Promise((resolve, reject) => { const probe = net.createServer(); probe.once('error', reject); probe.listen(4428, '127.0.0.1', () => probe.close(resolve)); });
  fs.cpSync(path.join(root, '.next/static'), path.join(standalone, '.next/static'), { recursive: true });
  fs.cpSync(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true });
  const log = fs.openSync(path.join(root, 'docs/release-candidate/standalone.log'), 'w');
  server = spawn(process.execPath, ['--require', path.join(__dirname, 'trace-http.cjs'), 'server.js'], { cwd: standalone, env, windowsHide: true, stdio: ['ignore', log, log] });
  const exited = new Promise(resolve => server.once('exit', resolve));
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try { const r = await fetch('http://127.0.0.1:4428/login'); if (r.ok) { ready = true; break; } } catch {}
      if (server.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, 'Candidate standalone server did not start');
    const child = spawn(process.execPath, ['scripts/auth/browser-release.cjs'], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
    const code = await new Promise(resolve => child.once('exit', resolve));
    assert.equal(code, 0, 'Browser smoke failed');
  } finally { server.kill(); await exited; fs.closeSync(log); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
