/**
 * 工具箱开发与部署服务器：提供前端静态资源，并代理同源 API 与健康检查请求。
 * @module
 */
import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const hopHeaders = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade'];

/** 过滤逐跳头及 Connection 指定的头，仅向上下游转发端到端请求或响应头。 */
function endToEndHeaders(headers) {
    const excluded = new Set([...hopHeaders, ...(headers.connection || '').toLowerCase().split(/\s*,\s*/)]);
    return Object.fromEntries(Object.entries(headers).filter(([name]) => !excluded.has(name.toLowerCase())));
}

/** 创建静态资源服务器及固定目标的后端代理，数据库访问和后端目标配置留在服务端。 */
export function createToolboxServer({ backendTarget = process.env.BACKEND_TARGET || 'http://127.0.0.1:8080' } = {}) {
    const target = new URL(backendTarget);
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('BACKEND_TARGET must use HTTP or HTTPS');
    const transport = target.protocol === 'https:' ? https : http;

    return http.createServer(async (request, response) => {
        let requestedUrl;
        try { requestedUrl = new URL(request.url, 'http://localhost'); }
        catch { response.writeHead(400); response.end(); return; }
        const pathname = requestedUrl.pathname;
        const isBackend = pathname === '/api' || pathname.startsWith('/api/')
            || pathname === '/actuator/health' || pathname.startsWith('/actuator/health/');
        if (isBackend) {
            const headers = { ...endToEndHeaders(request.headers), host: target.host };
            const upstream = transport.request(new URL(pathname + requestedUrl.search, target), {
                method: request.method, headers
            }, backendResponse => {
                response.writeHead(backendResponse.statusCode, endToEndHeaders(backendResponse.headers));
                backendResponse.on('error', () => response.destroy());
                backendResponse.pipe(response);
            });
            upstream.setTimeout(15000, () => upstream.destroy(new Error('Backend timeout')));
            upstream.on('error', () => {
                if (response.headersSent) { response.destroy(); return; }
                response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
                response.end(JSON.stringify({ code: 'BACKEND_UNAVAILABLE', message: 'Java 服务暂时不可用' }));
            });
            request.on('aborted', () => upstream.destroy());
            response.on('close', () => { if (!response.writableEnded) upstream.destroy(); });
            request.pipe(upstream);
            return;
        }
        try {
            const requested = decodeURIComponent(pathname);
            const file = path.resolve(root, `.${requested === '/' ? '/index.html' : requested}`);
            if (!file.startsWith(`${path.resolve(root)}${path.sep}`)) {
                response.writeHead(403); response.end(); return;
            }
            const content = await readFile(file);
            response.writeHead(200, {
                'Content-Type': `${mime[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`
            });
            response.end(content);
        } catch {
            response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
            response.end('<h1>这里没有工具</h1><a href="/">返回拾用工具箱</a>');
        }
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const port = Number(process.env.PORT || 4173);
    createToolboxServer().listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
}
