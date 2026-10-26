const { build } = require('esbuild');
build({ entryPoints: { main: 'src/api/main.ts', worker: 'src/worker/main.ts', notifications: 'src/worker/notifications.ts' }, outdir: '.api', outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', target: 'node20', packages: 'external', sourcemap: true, tsconfig: 'tsconfig.json' })
  .catch(() => { process.exitCode = 1; });
