import test from 'node:test';
import assert from 'node:assert/strict';
import { formatJson, encodeText, diffLines, timestampToDate, dateToTimestamp } from '../dist/tools.js';

test('JSON preserves nested content and rejects invalid or empty content', () => {
    assert.equal(formatJson('{"a":[1,{"中文":true}]}', true), '{"a":[1,{"中文":true}]}');
    assert.ok(formatJson('{"a":1}').includes('\n    "a": 1'));
    assert.throws(() => formatJson('{a:1}'));
    assert.throws(() => formatJson(' '));
});
test('UTF-8 Base64 and URL round trips, including emoji and invalid encodings', () => {
    for (const mode of ['base64', 'url']) {
        const input = '中文 👩‍💻 /?a=1&b=+\n';
        assert.equal(encodeText(encodeText(input, mode), mode, true), input);
    }
    assert.throws(() => encodeText('%%%', 'base64', true));
    assert.throws(() => encodeText('%GG', 'url', true));
    assert.equal(encodeText('', 'base64'), '');
});
test('diff reconstructs both inputs with repeated, empty and HTML-like lines', () => {
    for (const [a, b] of [['a\nb\na', 'a\na\nc'], ['', ''], ['', 'a'], ['a\n', 'a'], ['<script>', '<img>']]) {
        const lines = diffLines(a, b);
        assert.equal(lines.filter(l => l.type !== 'add').map(l => l.text).join('\n'), a);
        assert.equal(lines.filter(l => l.type !== 'remove').map(l => l.text).join('\n'), b);
    }
    assert.throws(() => diffLines('a\n'.repeat(1500), 'b\n'.repeat(1500)));
});
test('timestamp conversion explicitly honors seconds, milliseconds and UTC', () => {
    assert.equal(timestampToDate('0', 's').iso, '1970-01-01T00:00:00.000Z');
    assert.equal(timestampToDate('1000', 'ms').iso, '1970-01-01T00:00:01.000Z');
    assert.equal(dateToTimestamp('1970-01-01T00:00:00Z').seconds, 0);
    assert.throws(() => timestampToDate('', 's'));
    assert.throws(() => timestampToDate('1e3', 's'));
    assert.throws(() => dateToTimestamp(''));
});
