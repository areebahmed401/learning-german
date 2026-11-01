import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sameIgnoringUmlauts, umlautKeys } from '../js/umlaut.js';
import { buildDictionary, lookup } from '../js/translator/dictionary.js';

test('a/o/u, ae/oe/ue and ss all match ä/ö/ü/ß', () => {
  for (const typed of ['über', 'uber', 'ueber', 'Ueber']) assert.ok(sameIgnoringUmlauts(typed, 'über'), typed);
  assert.ok(sameIgnoringUmlauts('Strasse', 'Straße'));
  assert.ok(sameIgnoringUmlauts('ich mochte einen kaffee', 'ich möchte einen kaffee'));
  assert.ok(sameIgnoringUmlauts('ich moechte einen kaffee', 'ich möchte einen kaffee'));
  assert.ok(!sameIgnoringUmlauts('haus', 'hund'));
  assert.deepEqual(umlautKeys('Tisch'), ['tisch']);
  assert.deepEqual(umlautKeys('Füße'), ['fusse', 'fuesse']);
});

const read = (p) => JSON.parse(fs.readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const dict = buildDictionary({ core: read('dictionary/core.json'), strong: read('dictionary/strong-verbs.json') });
const first = (q) => lookup(q, dict)[0]?.de;

test('translator finds words typed without umlauts', () => {
  for (const q of ['uber', 'ueber', 'über']) assert.equal(first(q), 'über', q);
  assert.equal(first('strasse'), 'Straße');
  assert.equal(first('mude'), 'müde');
  assert.equal(first('fruhstuck'), 'Frühstück');
  assert.equal(first('fahrst'), 'fahren');
  assert.equal(first('faehrst'), 'fahren');
});

test('an exact spelling still wins over an umlaut match', () => {
  const hits = lookup('schon', dict).map((e) => e.de);
  assert.equal(hits[0], 'schon');
  assert.ok(hits.includes('schön'));
});
