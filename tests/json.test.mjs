import test from 'node:test';
import assert from 'node:assert/strict';
import { formatJson, formatJsonDetailed, validateJson } from '../dist/tools.js';

test('formatting preserves every numeric literal without Number conversion', () => {
    const input = '{"id":2109510740355465218,"decimal":1.0000000000000001,"exp":1e400,"zero":-0}';
    assert.equal(formatJson(input, true), input);
    assert.match(formatJson(input), /2109510740355465218/);
    assert.equal(formatJson('{"2":2,"1":1,"a":1,"a":2}', true), '{"2":2,"1":1,"a":1,"a":2}');
});

test('compatibility escapes raw string controls while preserving content', () => {
    const content = 'China Chengxin\n中诚信国际\r\n公告\t正文\u0000';
    const input = '{"id":2109510740355465218,"content":"' + content + '","concatSentence":false}';
    const formatted = formatJsonDetailed(input);
    assert.equal(JSON.parse(formatted.output).content, content);
    assert.match(formatted.output, /2109510740355465218/);
    assert.equal(formatted.repairs.length, 1);
    assert.equal(formatJson(input, true), formatted.output.replace(/\n\s*/g, '').replace(/: /g, ':'));
    assert.throws(() => validateJson(input));
    assert.doesNotThrow(() => validateJson(formatted.output));
});

test('valid escapes, paths, HTML entities and string punctuation remain untouched', () => {
    const input = String.raw`{"path":"C:\\temp\\file","literal":"\\n","quote":"a\"b","entity":"&#x20;","text":"{ [ , : ] }"}`;
    assert.equal(formatJson(input, true), input);
    assert.deepEqual(formatJsonDetailed(input).repairs, []);
    assert.doesNotThrow(() => validateJson(input));
    assert.equal(formatJson('"中文 👋"', true), '"中文 👋"');
});

test('invalid structures and ambiguous copy artifacts are rejected', () => {
    const inputs = [
        '', ' ', '{a:1}', '{"a":1,}', '{"a":01}', '{"a":1e}', '{"a":+1}',
        '[1,,2]', 'true false', '{"a":"unterminated}', '{"a":"\\uGGGG"}',
        '{"a":"\\~"}', '{&#x20; "a":1}', '{\\\n"a":1}', '{"a":"x\\\ny"}',
        '{"a":undefined}', '{"a":NaN}', '{"a":/*comment*/1}', '{"a" 1}',
        '{"a":1 "b":2}', '{"a":1}\u0000', '"a" "b"'
    ];
    for (const input of inputs) {
        assert.throws(() => formatJson(input), undefined, input);
        assert.throws(() => validateJson(input), undefined, input);
    }
});

test('pretty and compact outputs preserve empty containers and root values', () => {
    for (const input of ['{}', '[]', '[{},[],true,false,null,-12.3e-2]', 'null', 'true', '1e400']) {
        assert.equal(formatJson(formatJson(input), true), input);
        assert.doesNotThrow(() => validateJson(formatJson(input)));
    }
    assert.equal(formatJson('{"a":[1,{"b":false}]}'),
        '{\n    "a": [\n        1,\n        {\n            "b": false\n        }\n    ]\n}');
});
