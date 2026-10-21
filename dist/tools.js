import { formatJsonDetailed } from './json.js';

export { formatJsonDetailed, validateJson } from './json.js';

/** Browser-local transforms. JSON preserves numeric literals and escapes raw string controls. */
export function formatJson(input, compact = false) {
    return formatJsonDetailed(input, compact).output;
}

export function encodeText(input, mode, decode = false) {
    if (mode === 'url') return decode ? decodeURIComponent(input) : encodeURIComponent(input);
    if (decode) {
        const bytes = Uint8Array.from(atob(input.replace(/\s/g, '')), c => c.charCodeAt(0));
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    const bytes = new TextEncoder().encode(input);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

/** LCS preserves order and repeated lines. Bound work for long inputs. */
export function diffLines(left, right) {
    const before = left === '' ? [] : left.split('\n');
    const after = right === '' ? [] : right.split('\n');
    if (before.length * after.length > 2000000) throw new Error('文本过长，请将两侧分别缩减至约 1,400 行以内。');
    const table = Array.from({ length: before.length + 1 }, () => new Uint32Array(after.length + 1));
    for (let i = before.length - 1; i >= 0; i--) {
        for (let j = after.length - 1; j >= 0; j--) {
            table[i][j] = before[i] === after[j] ? table[i + 1][j + 1] + 1
                : Math.max(table[i + 1][j], table[i][j + 1]);
        }
    }
    const lines = [];
    let i = 0;
    let j = 0;
    while (i < before.length || j < after.length) {
        if (i < before.length && j < after.length && before[i] === after[j]) {
            lines.push({ type: 'same', text: before[i++], before: i, after: ++j });
        } else if (i < before.length && (j === after.length || table[i + 1][j] >= table[i][j + 1])) {
            lines.push({ type: 'remove', text: before[i++], before: i, after: '' });
        } else {
            lines.push({ type: 'add', text: after[j++], before: '', after: j });
        }
    }
    return lines;
}

export function timestampToDate(input, unit) {
    if (!/^-?\d+$/.test(input.trim())) throw new Error('请输入整数时间戳。');
    const date = new Date(Number(input) * (unit === 's' ? 1000 : 1));
    if (!Number.isFinite(date.getTime())) throw new Error('时间戳超出有效范围。');
    return { iso: date.toISOString(), local: date.toLocaleString('zh-CN', { hour12: false }) };
}

export function dateToTimestamp(input) {
    if (!input) throw new Error('请选择日期和时间。');
    const milliseconds = new Date(input).getTime();
    if (!Number.isFinite(milliseconds)) throw new Error('日期格式无效。');
    return { seconds: Math.floor(milliseconds / 1000), milliseconds };
}
