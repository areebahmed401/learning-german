import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { conjugate } from '../js/translator/conjugate.js';

const strong = JSON.parse(fs.readFileSync(new URL('../data/dictionary/strong-verbs.json', import.meta.url), 'utf8'));
const c = (de, extra = {}) => conjugate({ de, ...extra }, strong);

test('sein', () => {
  const v = c('sein');
  assert.deepEqual(Object.values(v.tenses.praesens), ['bin', 'bist', 'ist', 'sind', 'seid', 'sind']);
  assert.equal(v.tenses.praeteritum.ich, 'war');
  assert.equal(v.tenses.perfekt.ich, 'bin gewesen');
  assert.equal(v.tenses.konjunktiv2.ich, 'wäre');
  assert.equal(v.imperativ.du, 'sei!');
});
test('haben', () => {
  const v = c('haben');
  assert.equal(v.tenses.praesens.du, 'hast');
  assert.equal(v.tenses.praesens.er, 'hat');
  assert.equal(v.tenses.praeteritum.ich, 'hatte');
  assert.equal(v.tenses.konjunktiv2.ich, 'hätte');
});
test('fahren', () => {
  const v = c('fahren');
  assert.equal(v.tenses.praesens.du, 'fährst');
  assert.equal(v.tenses.praesens.er, 'fährt');
  assert.equal(v.tenses.praesens.ihr, 'fahrt');
  assert.equal(v.tenses.praeteritum.ich, 'fuhr');
  assert.equal(v.tenses.praeteritum.du, 'fuhrst');
  assert.equal(v.tenses.perfekt.ich, 'bin gefahren');
  assert.equal(v.tenses.konjunktiv2.ich, 'führe');
  assert.equal(v.imperativ.du, 'fahr!');
});
test('aufstehen', () => {
  const v = c('aufstehen', { aux: 'sein' });
  assert.equal(v.sep, 'auf');
  assert.equal(v.tenses.praesens.ich, 'stehe auf');
  assert.equal(v.tenses.praeteritum.ich, 'stand auf');
  assert.equal(v.tenses.perfekt.ich, 'bin aufgestanden');
  assert.equal(v.imperativ.du, 'steh auf!');
  assert.equal(v.zuInfinitive, 'aufzustehen');
  assert.equal(c('aufstehen').aux, 'sein');
});
test('arbeiten', () => {
  const v = c('arbeiten');
  assert.equal(v.tenses.praesens.du, 'arbeitest');
  assert.equal(v.tenses.praesens.er, 'arbeitet');
  assert.equal(v.tenses.praeteritum.ich, 'arbeitete');
  assert.equal(v.tenses.perfekt.ich, 'habe gearbeitet');
  assert.equal(v.tenses.konjunktiv2.ich, 'würde arbeiten');
});
test('stem types', () => {
  assert.equal(c('heißen').tenses.praesens.du, 'heißt');
  assert.equal(c('tanzen').tenses.praesens.du, 'tanzt');
  assert.equal(c('sammeln').tenses.praesens.ich, 'sammle');
  assert.equal(c('sammeln').tenses.praesens.du, 'sammelst');
  assert.equal(c('wandern').tenses.praesens.ich, 'wandere');
  assert.equal(c('öffnen').tenses.praesens.du, 'öffnest');
  assert.equal(c('rechnen').tenses.praeteritum.er, 'rechnete');
});
test('prefixes and -ieren', () => {
  assert.equal(c('besuchen').tenses.perfekt.ich, 'habe besucht');
  assert.equal(c('studieren').tenses.perfekt.ich, 'habe studiert');
  const v = c('verstehen');
  assert.equal(v.tenses.praeteritum.ich, 'verstand');
  assert.equal(v.p2, 'verstanden');
  assert.equal(v.tenses.konjunktiv2.ich, 'verstünde');
  assert.equal(c('ankommen').tenses.perfekt.ich, 'bin angekommen');
  assert.equal(c('ankommen').tenses.konjunktiv2.ich, 'käme an');
  assert.equal(c('aufräumen').p2, 'aufgeräumt');
  assert.equal(c('vorbereiten').p2, 'vorbereitet');
  assert.equal(c('antworten').sep, null);
});
test('reflexive', () => {
  const v = c('sich freuen');
  assert.equal(v.reflexive, true);
  assert.equal(v.tenses.praesens.ich, 'freue mich');
  assert.equal(v.tenses.praesens.er, 'freut sich');
  assert.equal(v.tenses.perfekt.ich, 'habe mich gefreut');
  assert.equal(v.tenses.futur1.ich, 'werde mich freuen');
  assert.equal(v.imperativ.du, 'freu dich!');
  assert.equal(v.imperativ.Sie, 'freuen Sie sich!');
});
test('modals', () => {
  const v = c('können');
  assert.equal(v.tenses.praesens.ich, 'kann');
  assert.equal(v.tenses.praesens.du, 'kannst');
  assert.equal(v.tenses.praeteritum.ich, 'konnte');
  assert.equal(v.tenses.konjunktiv2.ich, 'könnte');
  assert.equal(c('müssen').tenses.praesens.du, 'musst');
  assert.equal(c('möchten').tenses.praesens.ich, 'möchte');
});
test('vowel change and irregulars', () => {
  assert.equal(c('nehmen').tenses.praesens.du, 'nimmst');
  assert.equal(c('nehmen').imperativ.du, 'nimm!');
  assert.equal(c('sehen').tenses.praesens.du, 'siehst');
  assert.equal(c('sehen').imperativ.du, 'sieh!');
  assert.equal(c('wissen').tenses.praesens.ich, 'weiß');
  assert.equal(c('wissen').tenses.praesens.du, 'weißt');
  assert.equal(c('halten').tenses.praesens.du, 'hältst');
  assert.equal(c('essen').tenses.praesens.du, 'isst');
  assert.equal(c('lesen').tenses.praesens.du, 'liest');
  assert.equal(c('gehen').tenses.konjunktiv2.ich, 'ginge');
  assert.equal(c('bringen').tenses.praeteritum.ich, 'brachte');
  assert.equal(c('tun').tenses.praesens.ich, 'tue');
  assert.equal(c('werden').tenses.perfekt.ich, 'bin geworden');
  assert.equal(c('gefallen').tenses.praesens.er, 'gefällt');
  assert.equal(c('gefallen').aux, 'haben');
});
test('entry overrides', () => {
  const v = c('wiederholen', { p2: 'wiederholt' });
  assert.equal(v.p2, 'wiederholt');
  assert.equal(c('fahren', { aux: 'haben' }).tenses.perfekt.ich, 'habe gefahren');
});
