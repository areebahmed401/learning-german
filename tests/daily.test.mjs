import test from 'node:test';
import assert from 'node:assert/strict';
import { pickDaily, updateMistakes, questionPool } from '../js/daily.js';

const ex = (type) => ({ type, explain: 'x' });
const lesson = (id, level, n = 12) => ({ id, level, title: id, exercises: [...Array.from({ length: n }, (_, i) => ex(['mc', 'gap', 'translate', 'order'][i % 4])), ex('match')] });
const lessons = [lesson('a1-01', 'A1'), lesson('a1-02', 'A1'), lesson('a2-01', 'A2'), lesson('a2-02', 'A2')];

test('the pool skips match grids and gives stable references', () => {
  const pool = questionPool(lessons);
  assert.equal(pool.length, 48);
  assert.ok(pool.every((q) => q.type !== 'match'));
  assert.equal(pool[0]._ref, 'a1-01#0');
});

test('same day, same quiz; another round or day, another quiz', () => {
  const a = pickDaily({ lessons, level: 'A2', today: '2026-11-02' }).map((q) => q._ref);
  const b = pickDaily({ lessons, level: 'A2', today: '2026-11-02' }).map((q) => q._ref);
  const c = pickDaily({ lessons, level: 'A2', today: '2026-11-02', round: 1 }).map((q) => q._ref);
  const d = pickDaily({ lessons, level: 'A2', today: '2026-11-03' }).map((q) => q._ref);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.notDeepEqual(a, d);
  assert.equal(new Set(a).size, 10);
});

test('mix: earlier mistakes first, then mostly the current level, some review', () => {
  const mistakes = ['a1-01#1', 'a1-02#2', 'a2-01#3', 'a2-02#4', 'a2-02#5', 'gone#1'];
  const q = pickDaily({ lessons, level: 'A2', today: '2026-11-02', mistakes, size: 10 }).map((x) => x._ref);
  const fromMistakes = q.filter((r) => mistakes.includes(r));
  assert.equal(fromMistakes.length, 4);
  const rest = q.filter((r) => !mistakes.includes(r));
  assert.equal(rest.filter((r) => r.startsWith('a2')).length, 4);
  assert.equal(rest.filter((r) => r.startsWith('a1')).length, 2);
});

test('at the first level there is nothing below, so all new questions are from it', () => {
  const q = pickDaily({ lessons: lessons.slice(0, 2), level: 'A1', today: '2026-11-02', size: 15 });
  assert.equal(q.length, 15);
  assert.ok(q.every((x) => x._level === 'A1'));
});

test('mistakes leave the list once answered right and stay while still wrong', () => {
  const next = updateMistakes(['x#1', 'x#2', 'x#3'], ['x#1', 'x#2', 'y#9'], ['x#2', 'y#9']);
  assert.deepEqual(next.sort(), ['x#2', 'x#3', 'y#9']);
});
