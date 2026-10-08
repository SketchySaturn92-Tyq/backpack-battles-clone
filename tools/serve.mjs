// 背包乱斗复刻版 的公网静态服务
//
// 监听 0.0.0.0，端口直接对公网开放（本机有公网 IP），不走隧道。
// 用法：node tools/serve.mjs <目录> <端口>
//
// 只做静态文件，没有后端。带 no-cache，改完前端刷新即见效。

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const [rootArg, portArg] = process.argv.slice(2);
if (!rootArg || !portArg) {
  console.error('用法: node tools/serve.mjs <目录> <端口>');
  process.exit(2);
}
const PORT = Number(portArg);
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) {
  console.error('端口必须是 1024-65535 之间的整数');
  process.exit(2);
}
const BASE = path.resolve(rootArg);
if (!fs.existsSync(BASE) || !fs.statSync(BASE).isDirectory()) {
  console.error(`不是目录: ${BASE}`);
  process.exit(2);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm', '.map': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }

  let target = path.join(BASE, pathname);
  // 用 path.relative 判包含，挡住各种编码的 ..
  const rel = path.relative(BASE, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    target = path.join(target, 'index.html');
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
    'Content-Length': fs.statSync(target).size,
    'Cache-Control': 'no-cache',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(target).pipe(res).on('error', () => res.destroy());
});

server.on('error', (err) => {
  console.error(JSON.stringify({ state: 'failed', message: err.message }));
  process.exit(1);
});

// 绑 0.0.0.0：公网 IP 的该端口可直接访问，不需要隧道
server.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({ serving: BASE, port: PORT, listen: '0.0.0.0', state: 'listening' }));
});
