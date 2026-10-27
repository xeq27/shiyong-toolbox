/**
 * 同源 Cookie 账户客户端：管理云端快照、CSRF 与串行保存；创建客户端及访客本地操作不发起请求。
 * @module
 */
/** 创建同源 Cookie 账户客户端，构造及访客本地使用均不发起请求。 */
export function createAccountClient({ fetchImpl = (...args) => fetch(...args) } = {}) {
    let user = null;
    let snapshot = null;
    let csrf = null;
    let queue = Promise.resolve();
    let pending = 0;
    let failed = false;
    /** 复制云端快照及待保存集合，避免调用方直接修改客户端内部数据。 */
    const clone = value => structuredClone(value);

    /** 发送同源 JSON 请求；写操作先取得 CSRF 令牌，并将认证及冲突响应转换为可读错误。 */
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

    /** 读取并校验云端工作区，在成功获得快照后建立当前账户状态。 */
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
    /** 按队列串行保存工作区，校验账户未切换，并记录待保存及失败状态。 */
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
        /** 返回当前已连接账户；尚未连接或已清除时为 null。 */
        get user() { return user; },
        /** 标识是否仍有排队中的保存或已失败而未恢复的保存。 */
        get unsaved() { return pending > 0 || failed; },
        /** 返回当前账户工作区的副本，未连接账户时拒绝读取。 */
        workspace() {
            if (!user) throw new Error('请先登录。');
            return clone(snapshot);
        },
        /** 在无正在保存的操作时，读取服务器会话并重新连接云端工作区。 */
        async restore() {
            if (pending) throw new Error('正在保存，请稍后重试。');
            return connect(await request('/api/auth/me'));
        },
        /** 注册账户，仅返回注册结果，由调用方决定后续登录。 */
        async register(username, password) {
            return request('/api/auth/register', 'POST', { username, password });
        },
        /** 校验当前无待保存操作，完成登录后刷新 CSRF 状态并加载云端工作区。 */
        async login(username, password) {
            if (pending) throw new Error('正在保存，请稍后重试。');
            const nextUser = await request('/api/auth/login', 'POST', { username, password });
            csrf = null;
            return connect(nextUser);
        },
        /** 保存指定的待办或笔记集合，并返回服务器确认后的集合。 */
        async save(collection, values) {
            if (!['todos', 'notes'].includes(collection)) throw new Error('无效的数据类型。');
            const result = await persist({ [collection]: clone(values) });
            return result[collection];
        },
        /** 将调用方提供的本地集合追加到当前云端快照，通过保存队列持久化。 */
        async importCollections(todos, notes) {
            if (!user) throw new Error('请先登录。');
            await persist({
                todos: [...snapshot.todos, ...clone(todos)],
                notes: [...snapshot.notes, ...clone(notes)]
            });
        },
        /** 等待已有保存完成后注销服务器会话；存在保存失败时保留当前账户状态。 */
        async logout() {
            await queue;
            if (failed) throw new Error('有未保存的云端内容，请先保存或复制备份。');
            await request('/api/auth/logout', 'POST');
            user = null;
            snapshot = null;
            csrf = null;
        },
        /** 仅清除客户端账户和快照以切换本地模式，不注销服务器会话或发起请求。 */
        forget() {
            if (pending) throw new Error('正在保存，请稍后切换。');
            user = null;
            snapshot = null;
            csrf = null;
            failed = false;
        }
    };
}
