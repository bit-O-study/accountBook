// 승인된 후보 경로에만 소스 파일을 이식한다. DB/환경설정/설치 디렉터리는 읽거나 복사하지 않는다.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
if (path.basename(root) !== 'accountbook-release-20261026') throw new Error('Unexpected candidate directory');
const source = path.resolve(root, '../../accountBook');
const files = [];
function walk(relative) {
  for (const entry of fs.readdirSync(path.join(source, relative), { withFileTypes: true })) {
    const file = `${relative}/${entry.name}`;
    if (entry.isDirectory()) walk(file);
    else if (/\.(tsx?|css)$/.test(file)) files.push(file);
  }
}
walk('src');
files.push('prisma/schema.prisma', 'public/notification-sw.js', 'scripts/api/build.cjs', 'scripts/auth/claim.ts', 'scripts/auth/verify.ts', 'scripts/auth/verify-notifications.ts', 'scripts/db/test-target.cjs', 'docs/DESIGN.md', 'docs/TASKS.md');
const manifest = files.sort().map(file => {
  const bytes = fs.readFileSync(path.join(source, file));
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), bytes);
  return { file, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
});
const base = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
const local = JSON.parse(fs.readFileSync(path.join(source, 'package.json')));
base.dependencies = { ...local.dependencies, ...base.dependencies };
base.devDependencies = { ...local.devDependencies, ...base.devDependencies };
delete base.devDependencies['embedded-postgres'];
base.scripts['api:build'] = local.scripts['api:build'];
fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(base, null, 2) + '\n');
const config = path.join(root, 'next.config.ts');
fs.writeFileSync(config, fs.readFileSync(config, 'utf8').replace('["@prisma/client"]', '["@prisma/client", "bullmq", "ioredis"]'));
fs.mkdirSync(path.join(root, 'docs/release-candidate'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/release-candidate/import-manifest.json'), JSON.stringify({ base: '7f784b3', source: 'accountBook', files: manifest, excluded: ['environment files', 'databases', 'node_modules', 'local lockfile', 'unsafe apply-schema/setup scripts'], preserved: ['Next 15.5.28', 'PostCSS 8.5.31 override', 'standalone', 'CI workflows', 'deployment scripts'] }, null, 2) + '\n');
console.log(`Imported ${files.length} allowlisted source files; baseline patch versions preserved.`);
