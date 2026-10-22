import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoteId } from '../dist/browser.js';

test('notes keep UUID identifiers when randomUUID is unavailable over HTTP', () => {
    const insecureCrypto = { getRandomValues: array => globalThis.crypto.getRandomValues(array) };
    const identifiers = Array.from({ length: 100 }, () => createNoteId(insecureCrypto));
    for (const identifier of identifiers) {
        assert.match(identifier, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    assert.equal(new Set(identifiers).size, identifiers.length);
});

test('secure contexts preserve native UUID behavior', () => {
    const expected = '00000000-0000-4000-8000-000000000001';
    assert.equal(createNoteId({ randomUUID: () => expected }), expected);
});
