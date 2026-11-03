import test from 'node:test';
import assert from 'node:assert/strict';
import { sameV2Sentence } from '../js/wordorder.js';

const VERBS = new Set(['spiele', 'spielen', 'habe', 'arbeite', 'fährt', 'fahrt', 'ist', 'möchte', 'mochte']);
const ok = (given, accepted) => sameV2Sentence(given, accepted, (t) => VERBS.has(t));

test('another block in front of the verb is right', () => {
  assert.ok(ok('ich spiele heute fussball', 'Heute spiele ich Fußball.'));
  assert.ok(ok('Wir spielen am Wochenende Fußball', 'Am Wochenende spielen wir Fußball.'));
  assert.ok(ok('Fußball spielen wir am Wochenende', 'Am Wochenende spielen wir Fußball.'));
  assert.ok(ok('Heute habe ich Fußball gespielt', 'Ich habe heute Fußball gespielt.'));
  assert.ok(ok('Ich arbeite heute', 'Heute arbeite ich'));
});

test('wrong orders stay wrong', () => {
  assert.ok(!ok('ich heute spiele Fußball', 'Heute spiele ich Fußball.')); // verb not in position 2
  assert.ok(!ok('Ich habe Fußball gespielt heute', 'Ich habe heute Fußball gespielt.')); // participle must end
  assert.ok(!ok('Heute spiele ich Tennis', 'Heute spiele ich Fußball.')); // other words
  assert.ok(!ok('Spiele ich heute Fußball', 'Heute spiele ich Fußball.'));
});

test('questions and clauses with a comma stay strict', () => {
  assert.ok(!ok('Heute spielst du Fußball?', 'Spielst du heute Fußball?'));
  assert.ok(!ok('Ich bleibe weil ich krank bin, zu Hause', 'Ich bleibe zu Hause, weil ich krank bin.'));
});
