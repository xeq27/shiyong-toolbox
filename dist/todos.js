/**
 * 待办工作区模块：管理校验、排序、渲染与保存；未传入云端适配器时仅使用本地存储，不请求后端。
 * @module
 */
import { createNoteId } from './browser.js';

const STORAGE_KEY = 'shiyong-todos';
const TEXT_LIMIT = 280;

/** 校验并规范化待办文本，构造带标识且默认未完成的待办。 */
export function createTodo(text, id = createNoteId()) {
    const value = text.trim();
    if (!value) throw new Error('请输入待办内容。');
    if (value.length > TEXT_LIMIT) throw new Error('待办内容最多 280 个字符。');
    return { id, text: value, done: false };
}

/** 读取并校验本地待办结构和标识唯一性，数据异常时拒绝读取以避免静默覆盖。 */
export function loadTodos(storage) {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const todos = JSON.parse(raw);
    const identifiers = new Set();
    if (!Array.isArray(todos) || !todos.every(todo => {
        if (!todo || typeof todo.id !== 'string' || !todo.id || identifiers.has(todo.id)
            || typeof todo.text !== 'string' || !todo.text.trim() || todo.text.length > TEXT_LIMIT
            || typeof todo.done !== 'boolean') return false;
        identifiers.add(todo.id);
        return true;
    })) throw new Error('待办数据格式异常。');
    return todos.map(({ id, text, done }) => ({ id, text, done }));
}

/** 将待办集合序列化写入指定存储，写入异常交由工作区处理。 */
export function saveTodos(storage, todos) {
    storage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

/** 按未完成在前、已完成在后返回新数组，各分组保持原有顺序。 */
export function sortTodos(todos) {
    return [...todos.filter(todo => !todo.done), ...todos.filter(todo => todo.done)];
}

/** 挂载待办交互及保存流程；默认仅访问本地存储，云端行为由显式传入的适配器提供。 */
export function mountTodos(container, remote = null) {
    container.innerHTML = `<section class="panel todo-panel" aria-label="待办清单">
        <form id="todo-form" class="todo-form">
            <label for="todo-input" class="field-label" id="todo-label">添加一件要做的事</label>
            <div class="todo-compose">
                <input type="text" id="todo-input" maxlength="280" autocomplete="off"
                    placeholder="例如：整理本周工作计划">
                <button class="primary" type="submit" id="todo-submit">添加待办</button>
                <button type="button" id="todo-cancel" hidden>取消编辑</button>
            </div>
        </form>
        <div class="todo-status"><span id="todo-count"></span>
            <span class="hint" id="todo-saved" role="status" aria-live="polite">仅保存在当前浏览器</span></div>
        <div class="error" id="todo-error" role="alert"></div>
        <ul class="todo-list" id="todo-list"></ul>
        <div class="empty" id="todo-empty"><h3>把要做的事，先记下来</h3><p>完成一件，勾掉一件。</p></div>
        <p class="hint">自动保存在当前浏览器，不同设备之间不会同步。清除网站数据会删除待办。</p>
    </section>`;
    /** 在当前待办工作区内查询控件，避免访问其他面板中的同类元素。 */
    const find = selector => container.querySelector(selector);
    const input = find('#todo-input');
    if (remote) {
        find('#todo-saved').textContent = '云端模式';
        container.querySelector('.todo-panel > .hint').textContent = '登录后，待办保存到当前账号云端。其他设备登录后可读取；保存失败时请保留输入并重试。';
    }
    const error = find('#todo-error');
    let todos = [];
    let editingId = null;
    let storage;
    let ready = false;
    try {
        storage = remote ? null : window.localStorage;
        todos = remote ? remote.load() : loadTodos(storage);
        ready = true;
    } catch {
        error.textContent = remote ? '云端连接未恢复，请打开账户页重新登录或恢复连接。' : '无法读取本地待办，请检查浏览器存储设置；现有数据未被覆盖。';
        input.disabled = true;
        container.querySelectorAll('button, input[type=checkbox]').forEach(control => control.disabled = true);
    }

    /** 安全构建待办行与操作按钮，并更新完成统计和空列表提示。 */
    function renderList() {
        const list = find('#todo-list');
        list.replaceChildren();
        for (const todo of sortTodos(todos)) {
            const row = document.createElement('li');
            row.className = 'todo-row' + (todo.done ? ' is-done' : '');
            row.dataset.id = todo.id;
            const label = document.createElement('label');
            label.className = 'todo-check';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = todo.done;
            checkbox.dataset.todoToggle = todo.id;
            const text = document.createElement('span');
            text.className = 'todo-text';
            text.textContent = todo.text;
            label.append(checkbox, text);
            const actions = document.createElement('div');
            actions.className = 'todo-actions';
            for (const [action, title] of [['edit', '编辑'], ['delete', '删除']]) {
                const button = document.createElement('button');
                button.type = 'button';
                button.dataset.todoAction = action;
                button.dataset.id = todo.id;
                button.textContent = title;
                button.setAttribute('aria-label', title + '待办：' + todo.text);
                actions.append(button);
            }
            row.append(label, actions);
            list.append(row);
        }
        const remaining = todos.filter(todo => !todo.done).length;
        find('#todo-count').textContent = '待完成 ' + remaining + ' · 已完成 ' + (todos.length - remaining);
        find('#todo-empty').hidden = todos.length > 0 || !ready;
    }

    /** 退出编辑状态并恢复新建待办的输入及按钮说明。 */
    function resetEditor() {
        editingId = null;
        input.value = '';
        find('#todo-label').textContent = '添加一件要做的事';
        find('#todo-submit').textContent = '添加待办';
        find('#todo-cancel').hidden = true;
    }

    /** 先保存候选集合，成功后再更新列表；失败时保留原集合和用户输入。 */
    async function commit(nextTodos) {
        find('#todo-submit').disabled = true;
        try {
            if (remote) await remote.save(nextTodos);
            else saveTodos(storage, nextTodos);
            todos = nextTodos;
            error.textContent = '';
            find('#todo-saved').textContent = remote ? '已保存到当前账号云端' : '已自动保存到当前浏览器';
            renderList();
            return true;
        } catch (failure) {
            error.textContent = remote ? failure.message : '保存失败，输入和原有待办已保留。请检查浏览器存储空间或复制内容备份。';
            find('#todo-saved').textContent = '尚未保存';
            return false;
        } finally {
            container.querySelectorAll('button, input[type=checkbox]').forEach(control => control.disabled = false);
        }
    }

    find('#todo-form').addEventListener('submit', async event => {
        event.preventDefault();
        if (!ready) return;
        try {
            const todo = createTodo(input.value, editingId ?? createNoteId());
            const next = editingId
                ? todos.map(item => item.id === editingId ? { ...item, text: todo.text } : item)
                : [todo, ...todos];
            if (await commit(next)) {
                resetEditor();
                input.focus();
            }
        } catch (failure) {
            error.textContent = failure.message;
            input.focus();
        }
    });
    find('#todo-cancel').addEventListener('click', () => {
        resetEditor();
        error.textContent = '';
        input.focus();
    });
    find('#todo-list').addEventListener('change', async event => {
        const identifier = event.target.dataset.todoToggle;
        if (!identifier) return;
        if (!await commit(todos.map(todo => todo.id === identifier ? { ...todo, done: !todo.done } : todo))) {
            event.target.checked = todos.find(todo => todo.id === identifier).done;
        } else {
            [...find('#todo-list').querySelectorAll('input')].find(item => item.dataset.todoToggle === identifier)?.focus();
        }
    });
    find('#todo-list').addEventListener('click', async event => {
        const button = event.target.closest('button[data-todo-action]');
        if (!button) return;
        const todo = todos.find(item => item.id === button.dataset.id);
        if (!todo) return;
        if (button.dataset.todoAction === 'edit') {
            editingId = todo.id;
            input.value = todo.text;
            find('#todo-label').textContent = '编辑待办';
            find('#todo-submit').textContent = '保存修改';
            find('#todo-cancel').hidden = false;
            input.focus();
        } else if (window.confirm('确定删除这条待办？')) {
            if (await commit(todos.filter(item => item.id !== todo.id)) && editingId === todo.id) resetEditor();
        }
    });
    renderList();
}
