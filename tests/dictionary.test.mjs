import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildDictionary, lookup } from '../js/translator/dictionary.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const core = read('dictionary/core.json');
const strong = read('dictionary/strong-verbs.json');
const lesson = read('lessons/a1/a1-05-artikel.json');
const lessonWords = lesson.words.map((w) => ({ ...w, lesson: lesson.id, level: lesson.level }));
const dict = buildDictionary({ core, strong, lessonWords });
const first = (q) => lookup(q, dict)[0];

test('data files are sane', () => {
  assert.ok(core.length >= 1500, `core has ${core.length}`);
  assert.ok(Object.keys(strong).length >= 150);
  for (const w of core) {
    assert.ok(w.de && w.en && w.pos, JSON.stringify(w));
    if (w.pos === 'noun') assert.ok(['der', 'die', 'das'].includes(w.article) && w.plural, w.de);
    if (w.pos === 'verb') assert.ok(w.aux && w.p2, w.de);
  }
  const seen = new Set();
  for (const w of core) { const k = w.pos + w.de; assert.ok(!seen.has(k), 'duplicate ' + k); seen.add(k); }
});

test('English lookups', () => {
  assert.equal(first('to drive').de, 'fahren');
  assert.equal(first('house').de, 'Haus');
  assert.equal(first('beautiful').de, 'schön');
  assert.equal(first('the house').de, 'Haus');
  assert.equal(first('to get up').de, 'aufstehen');
  assert.equal(first('apple').de, 'Apfel');
});

test('German lookups', () => {
  assert.equal(first('aufstehen').de, 'aufstehen');
  assert.equal(first('Haus').de, 'Haus');
  assert.equal(first('das Haus').de, 'Haus');
  assert.equal(first('sich freuen').de, 'sich freuen');
  assert.equal(first('interessieren').de, 'sich interessieren');
  assert.equal(first('Häuser').de, 'Haus');
});

test('conjugated forms find the verb', () => {
  assert.equal(first('fährt').de, 'fahren');
  assert.equal(first('ging').de, 'gehen');
  assert.equal(first('gefahren').de, 'fahren');
  assert.equal(first('isst').de, 'essen');
  assert.equal(first('arbeitete').de, 'arbeiten');
});

test('lesson words take priority and carry lesson id', () => {
  const e = first('Mutter');
  assert.equal(e.source, 'lesson');
  assert.equal(e.lesson, 'a1-05-artikel');
  assert.equal(first('Tisch').source, 'core');
});

test('empty and unknown queries', () => {
  assert.deepEqual(lookup('', dict), []);
  assert.deepEqual(lookup('qwertzuiop', dict), []);
});
