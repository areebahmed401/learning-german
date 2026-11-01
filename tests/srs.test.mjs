import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, buildQueue, requeue, hardest, addDays, cardKey, NEW_PER_DAY } from '../js/srs.js';

const T = '2026-11-01';
const w = (de, extra = {}) => ({ de, en: de, pos: 'noun', article: 'der', plural: '-', ...extra });

test('addDays crosses month and year ends', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays(T, 0), T);
});

test('knowing a card moves it up a box and spaces it out', () => {
  let c = answer(undefined, true, T);
  assert.deepEqual([c.box, c.due, c.seen, c.first], [1, '2026-11-02', 1, T]);
  c = answer(c, true, '2026-11-02');
  assert.deepEqual([c.box, c.due], [2, '2026-11-05']);
  for (let i = 0; i < 10; i++) c = answer(c, true, T);
  assert.equal(c.box, 5);
  assert.equal(c.due, addDays(T, 30));
});

test('a missed card is due again today and drops to box 1', () => {
  const c = answer({ box: 4, due: T, fails: 1, seen: 6, first: '2026-10-01' }, false, T);
  assert.deepEqual([c.box, c.due, c.fails, c.lapsed], [1, T, 2, T]);
});

test('a card missed today and then known comes back tomorrow, not later', () => {
  let c = answer({ box: 3, due: T, fails: 0, seen: 3, first: '2026-10-01' }, false, T);
  c = answer(c, true, T);
  assert.deepEqual([c.box, c.due], [1, '2026-11-02']);
  c = answer(c, true, '2026-11-02');
  assert.equal(c.box, 2);
});

test('queue: due cards oldest first, then new words up to the daily limit', () => {
  const words = [w('Tisch'), w('Stuhl'), w('Hund'), ...Array.from({ length: 30 }, (_, i) => w(`Neu${i}`))];
  const cards = {
    'der Tisch': { box: 2, due: '2026-10-30', first: '2026-10-20' },
    'der Stuhl': { box: 1, due: '2026-10-28', first: '2026-10-20' },
    'der Hund': { box: 3, due: '2026-11-05', first: '2026-10-20' },
  };
  const q = buildQueue(words, cards, T);
  assert.deepEqual(q.slice(0, 2).map((x) => x.de), ['Stuhl', 'Tisch']);
  assert.equal(q.length, 2 + NEW_PER_DAY);
  assert.ok(!q.some((x) => x.de === 'Hund'));
});

test('queue: new words already started today count against the limit, duplicates are one card', () => {
  const cards = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`der Alt${i}`, { box: 1, due: '2026-11-02', first: T }]));
  const words = [w('Haus', { article: 'das' }), w('Haus', { article: 'das' }), ...Array.from({ length: 20 }, (_, i) => w(`Neu${i}`))];
  const q = buildQueue(words, cards, T);
  assert.equal(q.length, NEW_PER_DAY - 10);
  assert.equal(q.filter((x) => x.de === 'Haus').length, 1);
});

test('requeue puts a missed card a few places ahead', () => {
  assert.deepEqual(requeue(['a', 'b', 'c', 'd', 'e'], 'x'), ['a', 'b', 'c', 'x', 'd', 'e']);
  assert.deepEqual(requeue([], 'x'), ['x']);
  assert.deepEqual(requeue(['a'], 'x'), ['a', 'x']);
});

test('hardest lists the most-missed words first', () => {
  const h = hardest({ a: { fails: 1, box: 2 }, b: { fails: 4, box: 1 }, c: { fails: 0, box: 1 } });
  assert.deepEqual(h.map(([k]) => k), ['b', 'a']);
});

test('cardKey includes the article for nouns only', () => {
  assert.equal(cardKey(w('Tisch')), 'der Tisch');
  assert.equal(cardKey({ de: 'gehen', pos: 'verb' }), 'gehen');
});
