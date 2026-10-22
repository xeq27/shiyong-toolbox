import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createToolboxServer } from '../server.mjs';

async function listen(server, t) {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => {
        server.close(resolve);
        server.closeAllConnections();
    }));
    return `http://127.0.0.1:${server.address().port}`;
}

test('proxy forwards API body, query, status and request correlation', async t => {
    const upstream = http.createServer(async (request, response) => {
        let body = '';
        for await (const chunk of request) body += chunk;
        response.writeHead(201, { 'Content-Type': 'application/json', 'X-Request-Id': 'upstream-id' });
        response.end(JSON.stringify({ path: request.url, method: request.method, body,
            requestId: request.headers['x-request-id'] }));
    });
    const backendTarget = await listen(upstream, t);
    const origin = await listen(createToolboxServer({ backendTarget }), t);
    const response = await fetch(`${origin}/api/example?limit=2`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'test-id' },
        body: '{"text":"中文"}'
    });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('x-request-id'), 'upstream-id');
    assert.deepEqual(await response.json(), { path: '/api/example?limit=2', method: 'POST',
        body: '{"text":"中文"}', requestId: 'test-id' });
});

test('only health and API routes are proxied; static tools remain available', async t => {
    const paths = [];
    const upstream = http.createServer((request, response) => {
        paths.push(request.url);
        response.setHeader('Content-Type', 'application/json');
        response.end('{"status":"UP"}');
    });
    const backendTarget = await listen(upstream, t);
    const origin = await listen(createToolboxServer({ backendTarget }), t);
    for (const path of ['/actuator/health', '/actuator/health/database']) {
        assert.equal((await fetch(origin + path)).status, 200);
    }
    assert.equal((await fetch(origin + '/actuator/env')).status, 404);
    assert.equal((await fetch(origin + '/api-other')).status, 404);
    assert.equal((await fetch(origin + '/server.mjs')).status, 404);
    const home = await fetch(origin + '/');
    assert.equal(home.status, 200);
    assert.match(await home.text(), /拾用/);
    assert.deepEqual(paths, ['/actuator/health', '/actuator/health/database']);
});

test('backend outage returns safe 502 while local tools remain available', async t => {
    const unavailable = http.createServer();
    unavailable.listen(0, '127.0.0.1');
    await once(unavailable, 'listening');
    const backendTarget = `http://127.0.0.1:${unavailable.address().port}`;
    await new Promise(resolve => unavailable.close(resolve));
    const origin = await listen(createToolboxServer({ backendTarget }), t);
    const response = await fetch(origin + '/actuator/health');
    assert.equal(response.status, 502);
    const body = await response.text();
    assert.doesNotMatch(body, /ECONNREFUSED|stack|password/);
    assert.equal((await fetch(origin + '/tools.js')).status, 200);
});

test('absolute-form request cannot override the configured Java target', async t => {
    const upstream = http.createServer((request, response) => response.end(request.url));
    const backendTarget = await listen(upstream, t);
    const origin = await listen(createToolboxServer({ backendTarget }), t);
    const body = await new Promise((resolve, reject) => {
        const request = http.request(origin, { path: 'http://untrusted.invalid/api/example?q=1' }, response => {
            let text = '';
            response.on('data', chunk => { text += chunk; });
            response.on('end', () => resolve(text));
        });
        request.on('error', reject);
        request.end();
    });
    assert.equal(body, '/api/example?q=1');
});
