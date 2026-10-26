// 합성 브라우저 진단 전용. 요청 본문·쿠키·응답 본문을 기록하지 않는다.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const actions = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.next/server/server-reference-manifest.json'))).node;
const original = http.Server.prototype.emit;
let sequence = 0;
http.Server.prototype.emit = function (event, ...args) {
  if (event === 'request') {
    const [req, res] = args;
    if (req.method === 'POST' || req.url?.includes('_rsc=') || req.url?.startsWith('/_next/static/')) {
      const id = ++sequence, started = Date.now();
      const label = actions[req.headers['next-action']]?.exportedName || req.method + ' ' + req.url?.slice(0, 160);
      let bytes = 0;
      const write = res.write;
      res.write = function (chunk, ...rest) { bytes += Buffer.byteLength(chunk); return write.call(this, chunk, ...rest); };
      console.log(JSON.stringify({ trace: 'start', id, action: label }));
      res.once('finish', () => console.log(JSON.stringify({ trace: 'finish', id, action: label, ms: Date.now() - started, status: res.statusCode, bytes })));
      res.once('close', () => console.log(JSON.stringify({ trace: 'close', id, action: label, ms: Date.now() - started, finished: res.writableFinished, bytes })));
    }
  }
  return original.call(this, event, ...args);
};
