import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { checkBackendConnection } from '../dist/backend.js';

async function backend(t, handler) {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => {
        server.close(resolve);
        server.closeAllConnections();
    }));
    return `http://127.0.0.1:${server.address().port}`;
}

test('recognizes Java response separately from MySQL health', async t => {
    const origin = await backend(t, (request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.end('{"status":"UP"}');
    });
    assert.deepEqual(await checkBackendConnection({ origin }), { java: true, mysql: true });
});

test('database down does not hide reachable Java service', async t => {
    const origin = await backend(t, (request, response) => {
        response.writeHead(503, { 'Content-Type': 'application/json' });
        response.end('{"status":"DOWN"}');
    });
    assert.deepEqual(await checkBackendConnection({ origin }), { java: true, mysql: false });
});

test('missing database group and non-JSON pages never report MySQL connected', async t => {
    const origin = await backend(t, (request, response) => {
        if (request.url.endsWith('/database')) {
            response.writeHead(404);
            response.end('<h1>Not found</h1>');
        } else response.end('{"status":"UP"}');
    });
    assert.deepEqual(await checkBackendConnection({ origin }), { java: true, mysql: false });
});

test('timeout is bounded and returns unavailable state', async t => {
    const origin = await backend(t, () => {});
    assert.deepEqual(await checkBackendConnection({ origin, timeoutMs: 30 }), { java: false, mysql: false });
});

test('HTML fallback never masquerades as a connected Java service', async t => {
    const origin = await backend(t, (request, response) => response.end('<html>toolbox</html>'));
    assert.deepEqual(await checkBackendConnection({ origin }), { java: false, mysql: false });
});
