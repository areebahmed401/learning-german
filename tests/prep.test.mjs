import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { caseRound, gapRound, dailyRound, updateWeak, weightOf, topMisses, MAX_WEIGHT } from '../js/prep.js';

const real = JSON.parse(readFileSync(new URL('../data/prepositions.json', import.meta.url), 'utf8'));
const groupOf = (prep) => Object.keys(real.groups).find((k) => real.groups[k].preps.includes(prep));

test('Genitiv questions only from B1', () => {
  const a2 = caseRound(real, { level: 'A2', seed: 's', size: 40 });
  assert.ok(a2.length > 0);
  assert.ok(a2.every((q) => q.options.length === 3 && !q.options.includes('Genitiv')));
  assert.ok(a2.every((q) => groupOf(q._prep) !== 'gen'));
  const b1 = caseRound(real, { level: 'B1', seed: 's', size: 60 });
  assert.ok(b1.every((q) => q.options.length === 4));
  assert.ok(b1.some((q) => groupOf(q._prep) === 'gen'));
});

test('round 2 mixes Akk, Dat and Wechsel from A1; Genitiv only from B1', () => {
  const a1 = gapRound(real, { level: 'A1', seed: 'x', size: 60 });
  assert.ok(a1.some((q) => real.groups.akk.preps.includes(q._prep)));
  assert.ok(a1.some((q) => real.groups.dat.preps.includes(q._prep)));
  assert.ok(a1.every((q) => !real.groups.gen.preps.includes(q._prep)));
  const b1 = gapRound(real, { level: 'B1', seed: 'x', size: 100 });
  assert.ok(b1.some((q) => real.groups.gen.preps.includes(q._prep)));
  const a2 = gapRound(real, { level: 'A2', seed: 'x', size: 100 });
  assert.ok(a2.every((q) => !real.groups.gen.preps.includes(q._prep)));
});

test('the answer index points at the right option', () => {
  for (const q of caseRound(real, { level: 'B1', seed: 'k', size: 40 })) {
    assert.equal(q.options[q.answer], real.groups[groupOf(q._prep)].name);
    assert.match(q.explain, /\S/);
  }
  const plain = Object.fromEntries(real.sentences.map((s) => [s.q, s]));
  for (const q of gapRound(real, { level: 'B1', seed: 'k', size: 40 })) {
    const s = plain[q.q.replace(/ \((Wo|Wohin)\?\)$/, '')];
    assert.ok(s, q.q);
    assert.equal(q.options[q.answer], s.answer);
    assert.deepEqual([...q.options].sort(), [...s.options].sort());
  }
});

test('Wechsel sentences say Wo? or Wohin?', () => {
  const qs = gapRound(real, { level: 'A2', seed: 'w', size: 100 });
  const wechsel = qs.filter((q) => groupOf(q._prep) === 'wechsel');
  assert.ok(wechsel.length > 0);
  assert.ok(wechsel.every((q) => /\((Wo|Wohin)\?\)$/.test(q.q)));
  assert.ok(qs.filter((q) => groupOf(q._prep) !== 'wechsel').every((q) => !/\((Wo|Wohin)\?\)$/.test(q.q)));
});

test('weak prepositions come up more often', () => {
  const share = (weak) => {
    let hits = 0;
    let all = 0;
    for (let i = 0; i < 200; i++) {
      const qs = gapRound(real, { level: 'A2', weak, seed: `t${i}`, size: 12 });
      hits += qs.filter((q) => q._prep === 'mit').length;
      all += qs.length;
    }
    return hits / all;
  };
  assert.ok(share({ mit: 3 }) > share({}) * 1.5);
  const caseShare = (weak) => {
    let hits = 0;
    for (let i = 0; i < 200; i++) hits += caseRound(real, { level: 'A2', weak, seed: `c${i}`, size: 20 }).filter((q) => q._prep === 'mit').length;
    return hits;
  };
  assert.ok(caseShare({ mit: 3 }) > caseShare({}) * 1.5);
});

test('weight is 1 + 2 per miss, capped', () => {
  assert.equal(weightOf({}, 'mit'), 1);
  assert.equal(weightOf({ mit: 2 }, 'mit'), 5);
  assert.equal(weightOf({ mit: 50 }, 'mit'), MAX_WEIGHT);
});

test('same seed, same round; another seed, another round', () => {
  const ref = (qs) => qs.map((q) => `${q.q}|${q.options}`);
  assert.deepEqual(ref(caseRound(real, { level: 'A2', seed: 'a' })), ref(caseRound(real, { level: 'A2', seed: 'a' })));
  assert.notDeepEqual(ref(caseRound(real, { level: 'A2', seed: 'a' })), ref(caseRound(real, { level: 'A2', seed: 'b' })));
  assert.deepEqual(ref(gapRound(real, { level: 'A2', seed: 'a' })), ref(gapRound(real, { level: 'A2', seed: 'a' })));
  assert.notDeepEqual(ref(gapRound(real, { level: 'A2', seed: 'a' })), ref(gapRound(real, { level: 'A2', seed: 'b' })));
});

test('no preposition twice in a row, no sentence twice', () => {
  for (const seed of ['p', 'q', 'r', 's']) {
    const qs = gapRound(real, { level: 'A2', weak: { mit: 4, auf: 2 }, seed, size: 12 });
    assert.equal(qs.length, 12);
    assert.equal(new Set(qs.map((q) => q.q)).size, 12);
    qs.slice(1).forEach((q, i) => assert.notEqual(q._prep, qs[i]._prep));
    const cs = caseRound(real, { level: 'A2', weak: { mit: 4, auf: 2 }, seed, size: 20 });
    cs.slice(1).forEach((q, i) => assert.notEqual(q._prep, cs[i]._prep));
  }
});

test('updateWeak: miss +1, right -1, gone at 0, input untouched', () => {
  const before = { mit: 1, auf: 2 };
  const after = updateWeak(before, [{ prep: 'mit', ok: true }, { prep: 'auf', ok: true }, { prep: 'in', ok: false }, { prep: 'in', ok: false }, { prep: 'zu', ok: true }]);
  assert.deepEqual(after, { auf: 1, in: 2 });
  assert.deepEqual(before, { mit: 1, auf: 2 });
  assert.deepEqual(topMisses({ a: 1, b: 3, c: 2 }, 2), [['b', 3], ['c', 2]]);
});

test('data file: every sentence passes the basic checks', () => {
  const { groups, sentences } = real;
  const all = Object.values(groups).flatMap((g) => g.preps);
  assert.equal(new Set(all).size, all.length, 'preps are disjoint');
  assert.ok(sentences.length >= 60 && sentences.length <= 80);
  for (const s of sentences) {
    const w = s.q;
    assert.equal(s.q.split('___').length, 2, `${w}: one gap`);
    assert.equal(s.options.length, 3, w);
    assert.ok(s.options.includes(s.answer), `${w}: answer in options`);
    assert.ok(s.explain, w);
    assert.ok(['A1', 'A2', 'B1'].includes(s.level), w);
    const g = groupOf(s.prep);
    assert.ok(g, `${w}: prep in a group`);
    if (g === 'wechsel') {
      assert.ok(['wo', 'wohin'].includes(s.ask), `${w}: ask`);
      assert.equal(s.case, s.ask === 'wo' ? 'dat' : 'akk', w);
    } else {
      assert.equal(s.ask, undefined, w);
      assert.equal(s.case, g, w);
    }
  }
});

test('dailyRound: same 12 questions all day, both kinds, another day differs', () => {
  const a = dailyRound(real, { level: 'A2', today: '2026-11-07' });
  assert.equal(a.length, 12);
  assert.deepEqual(a, dailyRound(real, { level: 'A2', today: '2026-11-07' }));
  assert.ok(a.some((q) => q.q.endsWith('+ ?')) && a.some((q) => q.q.includes('___')));
  assert.notDeepEqual(a, dailyRound(real, { level: 'A2', today: '2026-11-08' }));
});
