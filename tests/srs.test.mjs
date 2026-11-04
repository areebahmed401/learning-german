import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, preview, known, normalize, forecast, retrievability, FSRS_W, buildQueue, requeue, hardest, addDays, cardKey, NEW_PER_DAY } from '../js/srs.js';

const T = '2026-11-01';
const w = (de, extra = {}) => ({ de, en: de, pos: 'noun', article: 'der', plural: '-', ...extra });

test('addDays crosses month and year ends', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays(T, 0), T);
});

test('SM-2: new card steps, then the gap grows by the ease', () => {
  assert.deepEqual(preview(undefined, T), [0, 1, 1, 4]);
  let c = answer(undefined, 3, T);
  assert.deepEqual([c.ivl, c.due, c.ease, c.seen, c.first], [1, '2026-11-02', 2.5, 1, T]);
  c = answer(c, 3, '2026-11-02');
  assert.deepEqual([c.ivl, c.due], [3, '2026-11-05']); // max(hard + 1, round(1 × 2.5))
  c = answer(c, 3, '2026-11-05');
  assert.equal(c.ivl, 8); // round(3 × 2.5)
  const [again, hard, good, easy] = preview(c, '2026-11-13');
  assert.deepEqual([again, hard, good, easy], [0, 10, 20, 26]);
  assert.ok(known(c) && !known(answer(undefined, 3, T)));
});

test('SM-2: Hard and Again lower the ease (not below 1.3), Easy raises it', () => {
  const c = { ivl: 10, smIvl: 10, ease: 1.4, s: 10, d: 5, due: T, last: '2026-10-22', fails: 0, seen: 5, first: '2026-09-01' };
  assert.equal(answer(c, 2, T).ease, 1.3);
  assert.equal(answer(c, 4, T).ease, 1.4 + 0.15);
  const missed = answer(c, 1, T);
  assert.deepEqual([missed.ivl, missed.due, missed.fails, missed.lapses, missed.lapsed, missed.ease], [0, T, 1, 1, T, 1.3]);
  const again = answer(missed, 3, T); // relearned in the same session: back tomorrow
  assert.deepEqual([again.ivl, again.lapses], [1, 1]);
});

test('SM-2: a late review counts the extra days it was remembered', () => {
  const c = { ivl: 10, smIvl: 10, ease: 2.5, s: 10, d: 5, due: '2026-10-22', last: '2026-10-12', fails: 0, seen: 5, first: '2026-09-01' };
  assert.equal(answer(c, 3, T).ivl, Math.round((10 + 10 / 2) * 2.5));
});

test('FSRS: default first gaps, and good answers grow the gap', () => {
  assert.deepEqual(preview(undefined, T, 'fsrs'), [0, 1, 2, 8]);
  let c = answer(undefined, 3, T, 'fsrs');
  assert.equal(c.s, FSRS_W[2]);
  let gap = c.ivl;
  for (let i = 0; i < 4; i++) {
    const next = answer(c, 3, c.due, 'fsrs');
    assert.ok(next.ivl > gap, `${next.ivl} > ${gap}`);
    gap = next.ivl; c = next;
  }
  assert.ok(Math.abs(retrievability(c.s, c.s) - 0.9) < 1e-9); // the gap is where recall drops to 90%
  const missed = answer(c, 1, c.due, 'fsrs');
  assert.ok(missed.s < c.s && missed.d > c.d && missed.ivl === 0);
});

test('both models are kept, so switching the setting uses the other one straight away', () => {
  const c = answer(answer(undefined, 3, T), 3, '2026-11-02');
  assert.ok(c.s > 0 && c.smIvl === 3);
  assert.equal(answer(c, 3, c.due, 'fsrs').ivl, preview(c, c.due, 'fsrs')[2]);
});

test('old Leitner cards convert without losing their due date', () => {
  const old = { box: 3, due: '2026-11-04', fails: 2, seen: 6, first: '2026-10-01' };
  const n = normalize(old);
  assert.deepEqual([n.ivl, n.due, n.last, n.fails, n.seen], [7, '2026-11-04', '2026-10-28', 2, 6]);
  assert.ok(n.ease < 2.5 && n.ease >= 1.3 && !('box' in n));
  assert.ok(known(old) && !known({ box: 2, due: T }));
  assert.equal(answer(old, 3, '2026-11-04').ivl, Math.round(7 * n.ease));
});

test('forecast counts reviews per day, overdue ones today', () => {
  const cards = { a: { due: '2026-10-30' }, b: { due: T }, c: { due: '2026-11-03' }, d: { due: '2026-12-01' } };
  assert.deepEqual(forecast(cards, T, 4), [2, 0, 1, 0]);
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
