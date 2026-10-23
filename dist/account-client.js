/** Same-origin cookie authentication. Construction and guest use never make requests. */
export function createAccountClient({ fetchImpl = (...args) => fetch(...args) } = {}) {
    let user = null;
    let snapshot = null;
    let csrf = null;
    let queue = Promise.resolve();
    let pending = 0;
    let failed = false;
    const clone = value => structuredClone(value);

    async function request(path, method = 'GET', body) {
        const headers = { Accept: 'application/json' };
        if (method !== 'GET') {
            if (!csrf) csrf = await request('/api/auth/csrf');
            headers[csrf.headerName] = csrf.token;
            headers['Content-Type'] = 'application/json';
        }
        const response = await fetchImpl(path, {
            method, headers, credentials: 'same-origin', cache: 'no-store',
            signal: AbortSignal.timeout(15000),
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        let payload;
        try { payload = await response.json(); } catch { throw new Error('服务器响应异常，请稍后重试。'); }
        if (!response.ok) {
            const error = new Error(response.status === 401 ? '登录已失效，请重新登录；未保存的内容请先备份。'
                : response.status === 409 ? '云端数据已变化，请先备份未保存内容，再重新连接。'
                    : payload.message || '账户服务暂时不可用。');
            error.status = response.status;
            if (response.status === 403) csrf = null;
            throw error;
        }
        return payload.data;
    }

    async function connect(nextUser) {
        const nextSnapshot = await request('/api/workspace');
        if (!nextSnapshot || !Array.isArray(nextSnapshot.todos) || !Array.isArray(nextSnapshot.notes)) {
            throw new Error('云端数据格式异常，请稍后重试。');
        }
        snapshot = nextSnapshot;
        user = nextUser;
        failed = false;
        return user;
    }
    async function persist(partial) {
        if (!user) throw new Error('请先登录。');
        const owner = user.id;
        pending++;
        const operation = queue.then(async () => {
            if (!user || user.id !== owner) throw new Error('账户已切换，请重新操作。');
            const next = await request('/api/workspace', 'PUT', { todos: snapshot.todos, notes: snapshot.notes, ...partial });
            snapshot = next;
            failed = false;
            return clone(next);
        });
        queue = operation.catch(() => {});
        try { return await operation; }
        catch (error) { failed = true; throw error; }
        finally { pending--; }
    }
    return {
        get user() { return user; },
        get unsaved() { return pending > 0 || failed; },
        workspace() {
            if (!user) throw new Error('请先登录。');
            return clone(snapshot);
        },
        async restore() {
            if (pending) throw new Error('正在保存，请稍后重试。');
            return connect(await request('/api/auth/me'));
        },
        async register(username, password) {
            return request('/api/auth/register', 'POST', { username, password });
        },
        async login(username, password) {
            if (pending) throw new Error('正在保存，请稍后重试。');
            const nextUser = await request('/api/auth/login', 'POST', { username, password });
            csrf = null;
            return connect(nextUser);
        },
        async save(collection, values) {
            if (!['todos', 'notes'].includes(collection)) throw new Error('无效的数据类型。');
            const result = await persist({ [collection]: clone(values) });
            return result[collection];
        },
        async importCollections(todos, notes) {
            if (!user) throw new Error('请先登录。');
            await persist({
                todos: [...snapshot.todos, ...clone(todos)],
                notes: [...snapshot.notes, ...clone(notes)]
            });
        },
        async logout() {
            await queue;
            if (failed) throw new Error('有未保存的云端内容，请先保存或复制备份。');
            await request('/api/auth/logout', 'POST');
            user = null;
            snapshot = null;
            csrf = null;
        },
        forget() {
            if (pending) throw new Error('正在保存，请稍后切换。');
            user = null;
            snapshot = null;
            csrf = null;
            failed = false;
        }
    };
}
