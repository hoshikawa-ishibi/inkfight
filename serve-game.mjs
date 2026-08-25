// 给桌面一键启动用的极简静态服务器，零外部依赖（不用 npx 下载 serve）。
// 只做一件事：把当前目录当静态资源目录，按扩展名给对的 MIME type。
// ES module 的 <script type="module"> 必须收到 JS 的 MIME type 浏览器才会执行，
// 这也是为什么不能直接双击 inkfight.html 打开——file:// 协议下没有 MIME type。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5566);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/inkfight.html';
  const filePath = path.join(ROOT, reqPath);

  // 防止 ../ 越权访问 ROOT 之外的文件
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + reqPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // 游戏可能已经在跑了（比如上次没关干净），直接当作成功——
    // launch-game.vbs 接下来照样会打开浏览器指向这个端口。
    console.log(`端口 ${PORT} 已被占用，假定服务器已在运行`);
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`墨境之战服务器已启动：http://localhost:${PORT}/inkfight.html`);
});
