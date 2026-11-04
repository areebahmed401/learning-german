import test from 'node:test';
import assert from 'node:assert/strict';
import { nextNewCards, mastery, interleave, quizPlan, readyToAdvance } from '../js/adapt.js';
import { pickDaily } from '../js/daily.js';

const stats = (right, first = 10) => ({ first, right });

test('new cards go up after a strong stretch, down after a weak one', () => {
  const strong = { '2026-11-01': stats(10), '2026-11-02': stats(9) };
  const up = nextNewCards({ base: 15, adapt: null, stats: strong, today: '2026-11-03', due: 10 });
  assert.equal(up.newCards, 20);
  assert.equal(up.change, 5);
  const weak = { '2026-11-01': stats(5), '2026-11-02': stats(6) };
  assert.equal(nextNewCards({ base: 15, adapt: null, stats: weak, today: '2026-11-03', due: 10 }).newCards, 10);
});

test('too many reviews waiting lowers new cards even when answers are right', () => {
  const strong = { '2026-11-01': stats(10), '2026-11-02': stats(10) };
  const r = nextNewCards({ base: 15, adapt: null, stats: strong, today: '2026-11-03', due: 60 });
  assert.equal(r.newCards, 10);
  assert.match(r.reason, /60 reviews/);
});

test('at most one change a day, and only after practising since the last change', () => {
  const strong = { '2026-11-01': stats(10), '2026-11-02': stats(10) };
  const sameDay = nextNewCards({ base: 15, adapt: { newCards: 20, day: '2026-11-03' }, stats: strong, today: '2026-11-03', due: 0 });
  assert.equal(sameDay.newCards, 20);
  // changed on the 3rd, no practice since: no second raise on the 5th
  const idle = nextNewCards({ base: 15, adapt: { newCards: 20, day: '2026-11-03' }, stats: strong, today: '2026-11-05', due: 0 });
  assert.equal(idle.newCards, 20);
  const later = nextNewCards({ base: 15, adapt: { newCards: 20, day: '2026-11-03' }, stats: { ...strong, '2026-11-04': stats(10) }, today: '2026-11-05', due: 0 });
  assert.equal(later.newCards, 25);
});

test('new cards stay between 5 and 50 and need enough answers', () => {
  const strong = { '2026-11-01': stats(20, 20) };
  assert.equal(nextNewCards({ base: 50, adapt: null, stats: strong, today: '2026-11-02', due: 0 }).newCards, 50);
  const weak = { '2026-11-01': stats(0, 20) };
  assert.equal(nextNewCards({ base: 5, adapt: null, stats: weak, today: '2026-11-02', due: 0 }).newCards, 5);
  assert.equal(nextNewCards({ base: 15, adapt: null, stats: { '2026-11-01': stats(5, 5) }, today: '2026-11-02', due: 0 }).newCards, 15);
});

test('mastery counts words with a gap of a week or more; interleave mixes 1:1', () => {
  const words = [{ de: 'a' }, { de: 'b' }, { de: 'c' }, { de: 'd' }, { de: 'a' }];
  assert.equal(mastery(words, { a: { box: 3 }, b: { ivl: 10, ease: 2.5 }, c: { ivl: 3, ease: 2.5 } }, (w) => w.de), 0.5);
  assert.deepEqual(interleave([1, 2, 3], ['x']), [1, 'x', 2, 3]);
});

const answers = (level, right, total, type = 'mc') =>
  Array.from({ length: total }, (_, i) => ({ l: level, t: type, ok: i < right }));

test('quiz plan: stretch when strong, ease when weak, steady with too few answers', () => {
  assert.equal(quizPlan({ answers: answers('A1', 18, 20), level: 'A1', nextLevel: 'A2' }).mode, 'stretch');
  assert.equal(quizPlan({ answers: answers('A1', 18, 20), level: 'A1', nextLevel: 'A2' }).stretch, 3);
  assert.equal(quizPlan({ answers: answers('A1', 18, 20), level: 'C1', nextLevel: null }).mode, 'steady');
  assert.equal(quizPlan({ answers: answers('A1', 18, 20), level: 'A1', nextLevel: null }).mode, 'steady');
  assert.equal(quizPlan({ answers: answers('A1', 8, 20), level: 'A1', nextLevel: 'A2' }).mode, 'ease');
  assert.equal(quizPlan({ answers: answers('A1', 10, 10), level: 'A1', nextLevel: 'A2' }).mode, 'steady');
});

test('quiz plan favours the question types you miss', () => {
  const p = quizPlan({ answers: [...answers('A1', 10, 10, 'mc'), ...answers('A1', 2, 10, 'order')], level: 'A1', nextLevel: 'A2' });
  assert.ok(p.typeWeights.order > p.typeWeights.mc);
  assert.equal(p.weakest, 'order');
});

const ex = (type) => ({ type, explain: 'x' });
const lesson = (id, level, n = 12) => ({ id, level, title: id, exercises: Array.from({ length: n }, (_, i) => ex(['mc', 'gap', 'translate', 'order'][i % 4])) });
const lessons = [lesson('a1-01', 'A1'), lesson('a2-01', 'A2'), lesson('a2-02', 'A2'), lesson('b1-01', 'B1')];

test('a stretch quiz asks some next-level questions; a steady one asks none', () => {
  const stretch = pickDaily({ lessons, level: 'A2', today: '2026-11-02', plan: { stretch: 3, stretchLevel: 'B1' } });
  assert.equal(stretch.filter((q) => q._level === 'B1').length, 3);
  assert.equal(stretch.length, 10);
  const steady = pickDaily({ lessons, level: 'A2', today: '2026-11-02', plan: { stretch: 0, stretchLevel: 'B1' } });
  assert.equal(steady.filter((q) => q._level === 'B1').length, 0);
});

test('an easy-going quiz leans on review from the levels below', () => {
  const q = pickDaily({ lessons, level: 'A2', today: '2026-11-02', plan: { belowShare: 2 / 3, stretchLevel: 'B1' } });
  assert.equal(q.filter((x) => x._level === 'A1').length, 6);
});

test('ready to advance needs strong quizzes and known words, and not a passed checkpoint', () => {
  const good = answers('A1', 18, 20);
  assert.equal(readyToAdvance({ answers: good, level: 'A1', levelMastery: 0.85 }), true);
  assert.equal(readyToAdvance({ answers: good, level: 'A1', levelMastery: 0.5 }), false);
  assert.equal(readyToAdvance({ answers: good, level: 'A1', levelMastery: 0.85, checkpointPassed: true }), false);
});
