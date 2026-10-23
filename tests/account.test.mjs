import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountClient } from '../dist/account-client.js';
function fixture() {
    const requests = [];
    let version = 0;
    const fetchImpl = async (path, options = {}) => {
        requests.push({ path, options });
        let data = null;
        if (path.endsWith('/csrf')) data = { token: 'csrf', headerName: 'X-CSRF-TOKEN' };
        if (path.endsWith('/me') || path.endsWith('/login')) data = { id: 1, username: 'alice' };
        if (path === '/api/workspace') data = options.method === 'PUT'
            ? { ...JSON.parse(options.body), version: ++version } : { version, todos: [], notes: [] };
        return { ok: true, status: 200, json: async () => ({ code: 'OK', data }) };
    };
    return { requests, client: createAccountClient({ fetchImpl }) };
}
test('guest has zero requests and cannot save cloud data', async () => {
    const { requests, client } = fixture();
    assert.equal(client.user, null);
    await assert.rejects(client.save('todos', []), /登录/);
    assert.equal(requests.length, 0);
});
test('writes carry CSRF, preserve collections, and do not send revision metadata', async () => {
    const { requests, client } = fixture();
    await client.login('alice', 'long-password');
    const todo = { id: 't1', text: 'task', done: false };
    const note = { id: 'n1', title: 'note', content: 'body', updated: 1 };
    await Promise.all([client.save('todos', [todo]), client.save('notes', [note])]);
    assert.deepEqual(client.workspace().todos, [todo]);
    assert.deepEqual(client.workspace().notes, [note]);
    const writes = requests.filter(item => item.options.method === 'PUT');
    assert.equal(JSON.parse(writes[1].options.body).todos[0].text, 'task');
    assert.equal('version' in JSON.parse(writes[0].options.body), false);
    assert.equal(writes[0].options.headers['X-CSRF-TOKEN'], 'csrf');
    assert.equal(writes[0].options.credentials, 'same-origin');
});
test('logout clears identity and cloud data after server acknowledgement', async () => {
    const { client } = fixture();
    await client.login('alice', 'password');
    await client.logout();
    assert.equal(client.user, null);
    assert.throws(() => client.workspace(), /登录/);
});

test('a failed cloud save keeps the acknowledged snapshot and does not claim success', async () => {
    let unavailable = false;
    const client = createAccountClient({ fetchImpl: async (path, options = {}) => {
        if (unavailable && options.method === 'PUT') return {
            ok: false, status: 503, json: async () => ({ message: '服务不可用' })
        };
        return { ok: true, status: 200, json: async () => ({ data:
            path.endsWith('/csrf') ? { token: 'csrf', headerName: 'X-CSRF-TOKEN' } :
                path === '/api/workspace' ? { todos: [], notes: [] } : { id: 1, username: 'alice' }
        }) };
    } });
    await client.login('alice', 'password');
    unavailable = true;
    await assert.rejects(client.save('todos', [{ id: 'a', text: 'draft', done: false }]), /服务不可用/);
    assert.deepEqual(client.workspace().todos, []);
    assert.equal(client.unsaved, true);
    await assert.rejects(client.logout(), /未保存/);
});
test('explicit import sends both local collections in one atomic save', async () => {
    const { requests, client } = fixture();
    await client.login('alice', 'password');
    await client.importCollections([{ id: 'a', text: 'local', done: false }], [
        { id: 'n', title: 'local', content: 'body', updated: 1 }
    ]);
    const writes = requests.filter(item => item.options.method === 'PUT');
    assert.equal(writes.length, 1);
    assert.equal(JSON.parse(writes[0].options.body).todos.length, 1);
    assert.equal(JSON.parse(writes[0].options.body).notes.length, 1);
});
