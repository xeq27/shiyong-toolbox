/**
 * 无损 JSON 处理模块：保留数字字面量，严格校验语法，并在格式化时兼容转义字符串内的原始控制字符。
 * @module
 */
/** 对 JSON 分词而不将数字字面量转为 Number，避免精度丢失或溢出。 */
function tokenizeJson(input, repairControls) {
    if (!input.trim()) throw new Error('请先输入 JSON 内容。');
    const tokens = [];
    const numberPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    const literalPattern = /true|false|null/y;
    let controlCount = 0;
    let position = 0;
    while (position < input.length) {
        const character = input[position];
        if (/[ \t\r\n]/.test(character)) {
            position++;
            continue;
        }
        if (character === '"') {
            let token = '"';
            let closed = false;
            position++;
            while (position < input.length) {
                const stringCharacter = input[position++];
                if (stringCharacter === '"') {
                    token += '"';
                    closed = true;
                    break;
                }
                if (stringCharacter === '\\') {
                    // 保留已有转义，下方使用 JSON.parse 拒绝非法或不完整的转义。
                    token += stringCharacter;
                    if (position < input.length) token += input[position++];
                } else if (stringCharacter.charCodeAt(0) < 32 && repairControls) {
                    token += JSON.stringify(stringCharacter).slice(1, -1);
                    controlCount++;
                } else {
                    token += stringCharacter;
                }
            }
            if (!closed) throw new Error('JSON 字符串缺少结束双引号。');
            JSON.parse(token);
            tokens.push({ type: 'string', text: token });
            continue;
        }
        if ('{}[],:'.includes(character)) {
            tokens.push({ type: 'punctuation', text: character });
            position++;
            continue;
        }
        numberPattern.lastIndex = position;
        const numberMatch = numberPattern.exec(input);
        literalPattern.lastIndex = position;
        const literalMatch = literalPattern.exec(input);
        const text = numberMatch?.[0] ?? literalMatch?.[0];
        if (!text) {
            throw new Error(`JSON 第 ${input.slice(0, position).split('\n').length} 行有非法字符，`
                + '请检查转义符、HTML 实体或复制时附带的标记。');
        }
        tokens.push({ type: numberMatch ? 'number' : 'literal', text });
        position += text.length;
    }
    // 通过数字占位校验完整语法，避免舍入或溢出。
    // 保留词元间隔，确保 01 等非法数字不会因拼接而通过校验。
    JSON.parse(tokens.map(token => token.type === 'number' ? '0' : token.text).join(' '));
    return { tokens, controlCount };
}

/** 严格校验标准 JSON，包括拒绝字符串内部未经转义的原始控制字符。 */
export function validateJson(input) {
    tokenizeJson(input, false);
}

/** 格式化已校验词元并保留数字原文；自动兼容处理仅转义字符串内的原始控制字符。 */
export function formatJsonDetailed(input, compact = false) {
    const { tokens, controlCount } = tokenizeJson(input, true);
    const parts = [];
    let depth = 0;
    /** 按压缩开关及当前嵌套深度生成分隔空白，不改写任何词元内容。 */
    const newline = () => compact ? '' : '\n' + '    '.repeat(depth);
    for (let index = 0; index < tokens.length; index++) {
        const text = tokens[index].text;
        const previous = tokens[index - 1]?.text;
        const next = tokens[index + 1]?.text;
        if (text === '{' || text === '[') {
            parts.push(text);
            depth++;
            if (next !== '}' && next !== ']') parts.push(newline());
        } else if (text === '}' || text === ']') {
            depth--;
            if (previous !== '{' && previous !== '[') parts.push(newline());
            parts.push(text);
        } else if (text === ',') {
            parts.push(',', newline());
        } else if (text === ':') {
            parts.push(compact ? ':' : ': ');
        } else {
            parts.push(text);
        }
    }
    const repairs = controlCount > 0
        ? [`已转义字符串内的 ${controlCount} 个原始控制字符，正文内容保持不变。`]
        : [];
    return { output: parts.join(''), repairs };
}
