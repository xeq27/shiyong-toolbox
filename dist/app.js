import { createNoteId, copyText } from './browser.js';
import { checkBackendConnection } from './backend.js';
import { formatJsonDetailed, validateJson, encodeText, diffLines, timestampToDate, dateToTimestamp } from './tools.js';

const tools = [
    { id: 'json', title: 'JSON 格式化', en: 'JSON formatter', symbol: '{ }', description: '格式化、压缩与校验 JSON 数据。', keywords: 'json format 格式化 压缩 校验' },
    { id: 'diff', title: '文本对比', en: 'Text diff', symbol: '⇄', description: '逐行比较文本，标记新增与删除。', keywords: 'diff 文本 对比 差异' },
    { id: 'notes', title: '备忘录', en: 'Quick notes', symbol: '▤', description: '随手记录，自动保存到当前浏览器。', keywords: 'notes memo 备忘 记录 笔记' },
    { id: 'base64', title: 'Base64 编解码', en: 'Base64 encoder', symbol: 'B₆₄', description: '文本与 Base64 互转，支持中文。', keywords: 'base64 编码 解码 中文' },
    { id: 'url', title: 'URL 编解码', en: 'URL encoder', symbol: '↗', description: '编码或解码 URL 参数。', keywords: 'url encode decode 链接 编码 解码' },
    { id: 'time', title: '时间戳转换', en: 'Timestamp converter', symbol: '◷', description: '日期与时间戳互转，支持秒和毫秒。', keywords: 'timestamp 时间 日期 秒 毫秒' }
];
const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let notes = readStored('shiyong-notes', [], value => Array.isArray(value) && value.every(note => note && typeof note.id === 'string' && typeof note.title === 'string' && typeof note.content === 'string'));
let selectedNote = notes[0]?.id;
let toastTimer;
let noteTimer;

function readStored(key, fallback, validate) {
    try { const value = JSON.parse(localStorage.getItem(key)); return validate(value) ? value : fallback; }
    catch { return fallback; }
}
function persist(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { toast('浏览器存储不可用或已满，请复制内容备份。'); return false; }
}
function toast(message) {
    $('#toast').textContent = message;
    $('#toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3000);
}
function renderHome() {
    const query = $('#search').value.trim().toLowerCase();
    const visible = tools.filter(tool => `${tool.title} ${tool.keywords}`.toLowerCase().includes(query));
    $('#section-title').firstChild.textContent = query ? '搜索结果 ' : '全部工具 ';
    $('#crumb').textContent = '个人工具箱';
    $('#tool-count').textContent = visible.length;
    $('#tool-grid').innerHTML = visible.map(tool => `<button class="tool-card" data-open="${tool.id}"><span class="tool-symbol" aria-hidden="true">${tool.symbol}</span><span class="tool-arrow" aria-hidden="true">↗</span><span class="tool-title">${tool.title}</span><span class="tool-description">${tool.description}</span></button>`).join('');
    $('#empty').hidden = visible.length !== 0;
}

function editor(label, id, readonly = false) {
    return `<label><span class="field-label">${label}</span><textarea id="${id}" ${readonly ? 'readonly' : ''} spellcheck="false" placeholder="${readonly ? '处理结果将显示在这里…' : '在这里粘贴或输入内容…'}"></textarea></label>`;
}
function transformWorkspace(tool) {
    const isJson = tool.id === 'json';
    return `<div class="panel">
        <div class="toolbar">
            <button class="primary" data-action="transform">${isJson ? '格式化' : '编码'}</button>
            <button data-action="secondary">${isJson ? '压缩' : '解码'}</button>
            ${isJson ? '<button data-action="validate-json">严格校验</button>' : ''}
            <button data-action="example">载入示例</button>
            <button data-action="clear">清空</button>
            <button data-action="copy">${isJson ? '复制内容' : '复制结果'}</button>
        </div>
        <div class="${isJson ? 'json-editor' : 'editor-grid'}">
            ${editor(isJson ? 'JSON 内容' : '原始内容', 'input')}
            ${isJson ? '' : editor('处理结果', 'output', true)}
        </div>
        <div class="error" id="error" role="alert"></div>
        ${isJson ? '<p class="hint" id="json-status" role="status" aria-live="polite"></p>' : ''}
        <p class="hint">${isJson
            ? '在上方输入 JSON，格式化或压缩后原位显示结果。支持真实换行兼容和数字无损处理；严格校验检查当前内容。'
            : tool.id === 'url' ? '按 URL 参数进行编解码，使用 encodeURIComponent / decodeURIComponent。'
                : '使用 UTF-8 文本编码，支持中文和 emoji。'}</p>
    </div>`;
}
function openTool(id) {
    const tool = tools.find(item => item.id === id);
    if (!tool) { location.hash = ''; return; }
    $('#home').hidden = true;
    $('#workspace').hidden = false;
    $('#crumb').textContent = tool.title;
    document.title = `${tool.title} · 拾用工具箱`;
    let body = transformWorkspace(tool);
    if (id === 'diff') body = `<div class="panel"><div class="toolbar"><button class="primary" data-action="compare">开始对比</button><button data-action="swap">交换两侧</button><button data-action="diff-example">载入示例</button><button data-action="diff-clear">清空</button></div><div class="editor-grid">${editor('原始文本', 'before')}${editor('修改后的文本', 'after')}</div><div class="error" id="error" role="alert"></div></div><div class="panel"><div class="diff-summary" id="diff-summary">输入两段文本，查看逐行差异。</div><div class="diff-results" id="diff-results"></div></div>`;
    if (id === 'notes') body = `<div class="panel"><div class="toolbar"><button class="primary" data-action="new-note">＋ 新建笔记</button><span class="note-saved" id="note-saved">仅保存在当前浏览器</span><button class="danger" data-action="delete-note">删除笔记</button></div><div class="notes-layout"><div class="note-list" id="note-list"></div><div id="note-editor"></div></div><p class="hint">清除网站数据会删除本地笔记。重要内容请及时复制备份，不同设备之间不会同步。</p></div>`;
    if (id === 'time') body = `<div class="editor-grid"><div class="panel"><h3>时间戳 → 日期</h3><label class="field-label" for="timestamp">输入整数时间戳</label><input class="timestamp-input" type="text" inputmode="numeric" id="timestamp" placeholder="例如 1700000000"><div class="toolbar"><label>单位 <select id="unit"><option value="s">秒（s）</option><option value="ms">毫秒（ms）</option></select></label><button class="primary" data-action="to-date">转换</button><button data-action="now">当前时间</button></div><div class="time-result" id="date-result">等待转换</div></div><div class="panel"><h3>日期 → 时间戳</h3><label class="field-label" for="date-input">选择本地日期和时间</label><input class="timestamp-input" type="datetime-local" id="date-input" step="1"><div class="toolbar"><button class="primary" data-action="to-timestamp">转换</button></div><div class="time-result" id="timestamp-result">等待转换</div></div></div><div class="error" id="error" role="alert"></div><p class="hint">本地时间采用当前设备时区：${escape(Intl.DateTimeFormat().resolvedOptions().timeZone)}。UTC 结果同时展示。</p>`;
    $('#workspace').innerHTML = `<button class="back" data-action="back">← 返回工具箱</button><div class="workspace-header"><h1>${tool.title}</h1><p>${tool.description}</p></div>${body}`;
    if (id === 'notes') renderNotes();
    window.scrollTo({ top: 0 });
    $('.back').focus({ preventScroll: true });
}
function renderNotes() {
    clearTimeout(noteTimer);
    $('#note-list').innerHTML = notes.map(note => `<button class="note-item ${note.id === selectedNote ? 'active' : ''}" data-note="${escape(note.id)}"><strong>${escape(note.title || '未命名笔记')}</strong><small>${escape(new Date(note.updated).toLocaleDateString('zh-CN'))}</small></button>`).join('');
    const note = notes.find(item => item.id === selectedNote);
    $('#note-editor').innerHTML = note ? `<label><span class="field-label">笔记标题</span><input class="note-title" id="note-title" maxlength="120" placeholder="未命名笔记" value="${escape(note.title)}"></label><label><span class="field-label">笔记内容</span><textarea class="note-content" id="note-content" placeholder="从一个想法开始…">${escape(note.content)}</textarea></label>` : '<div class="empty"><h3>留住一闪而过的想法</h3><p>点击「新建笔记」，开始第一条记录。</p></div>';
    $('[data-action="delete-note"]').disabled = !note;
}
function route() {
    const id = location.hash.slice(1);
    if (id === 'main') {
        $('#main').focus();
        return;
    }
    if (id) openTool(id);
    else { $('#home').hidden = false; $('#workspace').hidden = true; document.title = '拾用 · 个人工具箱'; renderHome(); }
}
document.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.open) location.hash = button.dataset.open;
    if (button.dataset.note) { selectedNote = button.dataset.note; renderNotes(); }
    const action = button.dataset.action;
    if (!action) return;
    if ($('#error')) $('#error').textContent = '';
    if ($('#json-status') && action !== 'copy') $('#json-status').textContent = '';
    try {
        const id = location.hash.slice(1);
        if (action === 'back') location.hash = '';
        if (action === 'transform' || action === 'secondary') {
            if (id === 'json') {
                const formatted = formatJsonDetailed($('#input').value, action === 'secondary');
                $('#input').value = formatted.output;
                $('#json-status').textContent = formatted.repairs.length
                    ? '兼容处理完成：' + formatted.repairs.join(' ')
                    : '处理完成，输入符合标准 JSON，无需修复。';
            } else {
                $('#output').value = '';
                $('#output').value = encodeText($('#input').value, id, action === 'secondary');
            }
        }
        if (action === 'validate-json') {
            validateJson($('#input').value);
            $('#json-status').textContent = '严格校验通过，输入符合标准 JSON。';
        }
        if (action === 'example') {
            $('#input').value = id === 'json'
                ? '{"project":"拾用工具箱","tools":["JSON","文本对比"],"localFirst":true}' : '你好，世界 👋';
            if ($('#output')) $('#output').value = '';
        }
        if (action === 'clear') {
            $('#input').value = '';
            if ($('#output')) $('#output').value = '';
        }
        if (action === 'copy') {
            const content = id === 'json' ? $('#input').value : $('#output').value;
            if (!content) throw new Error('暂无可复制的内容。');
            await copyText(content);
            toast('内容已复制');
        }
        if (action === 'compare') {
            $('#diff-results').replaceChildren(); $('#diff-summary').textContent = '正在对比…';
            const lines = diffLines($('#before').value, $('#after').value);
            const added = lines.filter(line => line.type === 'add').length;
            const removed = lines.filter(line => line.type === 'remove').length;
            $('#diff-summary').textContent = added || removed ? `新增 ${added} 行 · 删除 ${removed} 行` : '两段文本完全一致';
            $('#diff-results').innerHTML = lines.map(line => `<div class="diff-line ${line.type}"><span class="line-number">${line.before}</span><span class="line-number">${line.after}</span><span>${line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}</span><span class="diff-text">${escape(line.text) || ' '}</span></div>`).join('');
        }
        if (action === 'swap') { const text = $('#before').value; $('#before').value = $('#after').value; $('#after').value = text; $('#diff-results').replaceChildren(); $('#diff-summary').textContent = '两侧已交换，点击开始对比刷新结果。'; }
        if (action === 'diff-example') { $('#before').value = 'const toolbox = {\n    name: "拾用",\n    version: "1.0"\n};'; $('#after').value = 'const toolbox = {\n    name: "拾用",\n    version: "1.1",\n    localFirst: true\n};'; $('#diff-results').replaceChildren(); $('#diff-summary').textContent = '示例已载入，点击开始对比。'; }
        if (action === 'diff-clear') { $('#before').value = ''; $('#after').value = ''; $('#diff-results').replaceChildren(); $('#diff-summary').textContent = '输入两段文本，查看逐行差异。'; }
        if (action === 'new-note') { const note = { id: createNoteId(), title: '', content: '', updated: Date.now() }; notes.unshift(note); selectedNote = note.id; persist('shiyong-notes', notes); renderNotes(); $('#note-title').focus(); }
        if (action === 'delete-note' && confirm('确定删除这条笔记？删除后无法恢复。')) { notes = notes.filter(note => note.id !== selectedNote); selectedNote = notes[0]?.id; persist('shiyong-notes', notes); renderNotes(); }
        if (action === 'now') { $('#timestamp').value = String($('#unit').value === 's' ? Math.floor(Date.now() / 1000) : Date.now()); }
        if (action === 'to-date' || action === 'now') { $('#date-result').textContent = '等待转换'; const date = timestampToDate($('#timestamp').value, $('#unit').value); $('#date-result').innerHTML = `<strong>本地时间</strong><br>${escape(date.local)}<br><strong>UTC</strong><br>${escape(date.iso)}`; }
        if (action === 'to-timestamp') { $('#timestamp-result').textContent = '等待转换'; const time = dateToTimestamp($('#date-input').value); $('#timestamp-result').innerHTML = `<strong>秒</strong><br>${time.seconds}<br><strong>毫秒</strong><br>${time.milliseconds}`; }
    } catch (error) { if ($('#error')) $('#error').textContent = error.message; else toast(error.message); if (action === 'compare') $('#diff-summary').textContent = '无法完成对比，请检查输入。'; }
});
document.addEventListener('input', event => {
    if (event.target.id === 'search') renderHome();
    if (event.target.id === 'input' && location.hash === '#json') {
        $('#error').textContent = '';
        $('#json-status').textContent = '';
    }
    if (event.target.id === 'note-title' || event.target.id === 'note-content') {
        const note = notes.find(item => item.id === selectedNote);
        if (!note) return;
        note.title = $('#note-title').value; note.content = $('#note-content').value; note.updated = Date.now();
        const saved = persist('shiyong-notes', notes);
        $('#note-saved').textContent = saved ? '已自动保存到当前浏览器' : '保存失败，请复制备份';
        const item = [...document.querySelectorAll('[data-note]')].find(item => item.dataset.note === selectedNote);
        if (item) item.querySelector('strong').textContent = note.title || '未命名笔记';
    }
});
$('#reset-search').addEventListener('click', () => { $('#search').value = ''; renderHome(); });
document.addEventListener('keydown', event => {
    if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) && !location.hash) { event.preventDefault(); $('#search').focus(); }
});
window.addEventListener('hashchange', route);
renderHome();
route();

// Connection failures must not interrupt local tools or localStorage notes.
async function refreshBackendConnection() {
    const status = $('#backend-status');
    const button = $('#check-backend');
    button.disabled = true;
    status.textContent = '正在检查 Java / MySQL…';
    try {
        const connection = await checkBackendConnection();
        status.textContent = connection.java
            ? `Java 已连接 · MySQL ${connection.mysql ? '已连接' : '未连接'}`
            : 'Java 未连接，本地工具仍可使用';
        status.dataset.connected = String(connection.java && connection.mysql);
    } finally {
        button.disabled = false;
    }
}
$('#check-backend').addEventListener('click', refreshBackendConnection);
refreshBackendConnection();
