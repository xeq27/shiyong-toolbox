import test from 'node:test';
import assert from 'node:assert/strict';
import { createTodo, loadTodos, saveTodos, sortTodos } from '../dist/todos.js';

test('todo text is trimmed, bounded, and required', () => {
    assert.deepEqual(createTodo('  处理账单 👋  ', 'a'), { id: 'a', text: '处理账单 👋', done: false });
    assert.throws(() => createTodo('  ', 'a'), /输入/);
    assert.throws(() => createTodo('长'.repeat(281), 'a'), /280/);
});

test('todos round-trip independently from notes and keep completion state', () => {
    const entries = new Map([['shiyong-notes', 'existing notes']]);
    const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
    const todos = [{ ...createTodo('<img src=x onerror=alert(1)>', 'a'), done: true }];
    saveTodos(storage, todos);
    assert.deepEqual(loadTodos(storage), todos);
    assert.equal(entries.get('shiyong-notes'), 'existing notes');
});

test('missing data loads empty; corrupt data and duplicate IDs are reported', () => {
    assert.deepEqual(loadTodos({ getItem: () => null }), []);
    for (const value of ['broken', '{}', '[null]', '[{"id":"a","text":"x","done":"false"}]',
        '[{"id":"a","text":"x","done":false},{"id":"a","text":"y","done":true}]']) {
        assert.throws(() => loadTodos({ getItem: () => value }));
    }
});

test('unavailable browser storage reports failure instead of claiming a save', () => {
    assert.throws(() => saveTodos({ setItem() { throw new Error('quota'); } }, []), /quota/);
    assert.throws(() => loadTodos({ getItem() { throw new Error('blocked'); } }), /blocked/);
});

test('unfinished tasks come first without changing saved order', () => {
    const todos = [{ id: 'a', done: true }, { id: 'b', done: false }, { id: 'c', done: true }, { id: 'd', done: false }];
    assert.deepEqual(sortTodos(todos).map(todo => todo.id), ['b', 'd', 'a', 'c']);
    assert.deepEqual(todos.map(todo => todo.id), ['a', 'b', 'c', 'd']);
});