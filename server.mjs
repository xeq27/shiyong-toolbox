import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
http.createServer(async (request, response) => {
    try {
        const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const file = path.resolve(root, `.${requested === '/' ? '/index.html' : requested}`);
        if (!file.startsWith(`${root}${path.sep}`)) { response.writeHead(403); response.end(); return; }
        const content = await readFile(file);
        response.writeHead(200, { 'Content-Type': `${mime[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` });
        response.end(content);
    } catch { response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); response.end('<h1>这里没有工具</h1><a href="/">返回拾用工具箱</a>'); }
}).listen(4173, '127.0.0.1', () => console.log('Local: http://127.0.0.1:4173'));
