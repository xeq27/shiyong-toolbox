/**
 * 账户界面与存储模式协调模块：访客初始化不请求后端，只有已选择云端模式时才尝试恢复连接。
 * @module
 */
import { createAccountClient } from './account-client.js';
import { createNoteId } from './browser.js';
import { loadTodos } from './todos.js';

export const account = createAccountClient();
let cloudIntent = false;
try { cloudIntent = sessionStorage.getItem('shiyong-cloud-mode') === 'on'; } catch {}
/** 保存账户状态发布后的通知回调，初始化前默认不执行额外操作。 */
let stateChanged = () => {};
/** 判断是否已选择云端模式或存在已连接账户，包括连接待恢复状态。 */
export const usesCloud = () => cloudIntent || !!account.user;
/** 返回当前本地或云端模式对应的数据保存说明。 */
export const storageDescription = () => usesCloud()
    ? '登录后，待办和备忘录保存到当前账号的云端空间。'
    : '未登录，仅保存在当前浏览器，数据不上云。';

/** 更新本次会话的云端模式意图，连接失败时仍可保留该选择。 */
function markCloud(value) {
    cloudIntent = value;
    try {
        if (value) sessionStorage.setItem('shiyong-cloud-mode', 'on');
        else sessionStorage.removeItem('shiyong-cloud-mode');
    } catch {}
}
/** 同步账户入口及存储状态说明，并通知工具区重新读取对应数据源。 */
function publish() {
    document.querySelector('#account-link').textContent = account.user
        ? account.user.username + ' · 云端' : cloudIntent ? '云端连接待恢复' : '登录 / 注册';
    document.querySelector('#storage-mode').textContent = storageDescription();
    document.querySelector('#backend-status').textContent = account.user ? '云端已连接' : cloudIntent ? '云端连接待恢复' : '本地模式无需连接';
    stateChanged();
}

/** 注册状态回调，仅在会话已选择云端模式时恢复账户，访客初始化不发请求。 */
export async function initializeAccount(onChange) {
    stateChanged = onChange;
    if (cloudIntent) {
        try { await account.restore(); } catch { /* 云端恢复失败时保留云端模式，避免静默切换为访客本地数据。 */ }
    }
    publish();
}

/** 挂载账户操作面板，协调登录、恢复、退出和经确认的本地内容导入。 */
export function mountAccount(container) {
    container.innerHTML = `<section class="panel account-panel">
        <h2>账户与数据</h2>
        <p class="account-notice">未登录：仅本地使用，数据不上云。<br>登录后：账户信息、待办和备忘录保存到云端，可在其他设备登录使用。</p>
        <p id="account-identity" role="status"></p>
        <form id="account-form">
            <label class="field-label" for="account-username">用户名</label>
            <input id="account-username" name="username" autocomplete="username" required
                pattern="[A-Za-z0-9_]{4,32}" minlength="4" maxlength="32" placeholder="4–32 位字母、数字或下划线">
            <label class="field-label" for="account-password">密码</label>
            <input id="account-password" name="password" type="password" autocomplete="current-password"
                required minlength="12" maxlength="128" placeholder="12–128 个字符">
            <div class="toolbar">
                <button class="primary" type="submit">登录并使用云端</button>
                <button type="button" id="account-register">注册账号</button>
            </div>
        </form>
        <div class="toolbar">
            <button type="button" id="account-reconnect">恢复当前登录 / 刷新云端</button>
            <button type="button" id="account-import">导入本地待办和备忘录到云端</button>
            <button type="button" id="account-logout">退出登录</button>
            <button type="button" id="account-local">继续仅本地使用</button>
        </div>
        <p class="hint">本地内容不会自动上传。导入需要单独确认，原本地副本保留。退出后恢复本地内容。</p>
        <p class="error" id="account-error" role="alert"></p>
        <p class="hint" id="account-result" role="status"></p>
    </section>`;
    /** 在账户面板内查询元素，避免命中其他工作区的控件。 */
    const find = selector => container.querySelector(selector);
    /** 根据账户及云端连接状态更新身份提示和操作按钮。 */
    function refresh() {
        find('#account-form').hidden = !!account.user;
        find('#account-identity').textContent = account.user
            ? '当前账户：' + account.user.username + ' · 云端模式'
            : cloudIntent ? '云端连接尚未恢复，请重新连接或登录。' : '当前为本地模式';
        find('#account-import').disabled = !account.user;
        find('#account-logout').disabled = !account.user;
    }
    /** 统一执行账户操作，展示失败信息并在操作结束后恢复按钮状态。 */
    async function run(operation) {
        find('#account-error').textContent = '';
        container.querySelectorAll('button').forEach(button => button.disabled = true);
        try { await operation(); }
        catch (error) { find('#account-error').textContent = error.message || '网络连接失败，请稍后重试。'; }
        finally {
            container.querySelectorAll('button').forEach(button => button.disabled = false);
            refresh();
        }
    }
    find('#account-form').addEventListener('submit', event => {
        event.preventDefault();
        run(async () => {
            if (account.unsaved && !confirm('有未保存的云端内容，请先复制备份。仍要重新登录吗？')) return;
            await account.login(find('#account-username').value, find('#account-password').value);
            find('#account-password').value = '';
            markCloud(true);
            publish();
            refresh();
            find('#account-result').textContent = '登录成功，待办和备忘录已切换为云端数据。本地内容未自动上传。';
        });
    });
    find('#account-register').addEventListener('click', () => {
        if (!find('#account-form').reportValidity()) return;
        run(async () => {
            await account.register(find('#account-username').value, find('#account-password').value);
            find('#account-password').value = '';
            find('#account-result').textContent = '注册成功，请输入密码登录后使用云端数据。';
        });
    });
    find('#account-reconnect').addEventListener('click', () => run(async () => {
        if (account.unsaved && !confirm('有未保存的云端内容。请先复制备份，继续将重新读取云端并放弃内存中的未保存状态。')) return;
        await account.restore();
        markCloud(true);
        publish();
        find('#account-result').textContent = '已读取当前账户的云端内容。';
    }));
    find('#account-logout').addEventListener('click', () => run(async () => {
        await account.logout();
        markCloud(false);
        publish();
        find('#account-result').textContent = '已退出，恢复本地模式。云端内容没有复制到本地。';
    }));
    find('#account-local').addEventListener('click', () => run(async () => {
        if (account.unsaved && !confirm('请先备份未保存内容。切换本地模式会放弃内存中的云端内容，是否继续？')) return;
        account.forget();
        markCloud(false);
        publish();
        find('#account-result').textContent = '已切换本地模式。此操作不注销服务器会话，如需注销请恢复连接后退出登录。';
    }));
    find('#account-import').addEventListener('click', () => run(async () => {
        if (!confirm('将当前浏览器的待办和备忘录上传到 ' + account.user.username + ' 的云端空间？本地副本保留。')) return;
        const todos = loadTodos(localStorage).map(item => ({ ...item, id: createNoteId() }));
        const notes = JSON.parse(localStorage.getItem('shiyong-notes') || '[]');
        if (!Array.isArray(notes) || !notes.every(note => note && typeof note.title === 'string'
            && typeof note.content === 'string' && note.title.length <= 120 && note.content.length <= 100000)) {
            throw new Error('本地备忘录格式异常或内容过长，请先检查后再导入。');
        }
        await account.importCollections(todos, notes.map(note => ({
            id: createNoteId(), title: note.title, content: note.content,
            updated: Number.isSafeInteger(note.updated) ? note.updated : Date.now()
        })));
        publish();
        find('#account-result').textContent = '本地内容已追加到云端，本地副本保留。重复导入会产生副本。';
    }));
    refresh();
}
