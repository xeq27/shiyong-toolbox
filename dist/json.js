/** Tokenize JSON without converting numeric literals to JavaScript Number values. */
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
                    // Preserve existing escapes; JSON.parse below rejects invalid or incomplete ones.
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
    // Validate the complete grammar. Numeric placeholders prevent rounding and overflow;
    // token boundaries remain separated so malformed numbers such as 01 cannot become valid.
    JSON.parse(tokens.map(token => token.type === 'number' ? '0' : token.text).join(' '));
    return { tokens, controlCount };
}

/** Validate standard JSON strictly, including raw control characters inside strings. */
export function validateJson(input) {
    tokenizeJson(input, false);
}

/** Format validated tokens and report the only automatic repair: escaping raw string controls. */
export function formatJsonDetailed(input, compact = false) {
    const { tokens, controlCount } = tokenizeJson(input, true);
    const parts = [];
    let depth = 0;
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
