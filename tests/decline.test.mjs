import test from 'node:test';
import assert from 'node:assert/strict';
import { declineNoun, declineAdjective } from '../js/translator/decline.js';

test('das Kind', () => {
  const d = declineNoun({ de: 'Kind', article: 'das', plural: 'Kinder' });
  assert.equal(d.sg.gen, 'des Kindes');
  assert.equal(d.sg.dat, 'dem Kind');
  assert.equal(d.pl.dat, 'den Kindern');
  assert.equal(d.pl.gen, 'der Kinder');
});
test('der Tisch / die Frau', () => {
  assert.equal(declineNoun({ de: 'Tisch', article: 'der', plural: 'Tische' }).sg.gen, 'des Tisches');
  const f = declineNoun({ de: 'Frau', article: 'die', plural: 'Frauen' });
  assert.equal(f.sg.gen, 'der Frau');
  assert.equal(f.pl.dat, 'den Frauen');
});
test('multi-syllable genitive', () => {
  assert.equal(declineNoun({ de: 'Lehrer', article: 'der', plural: 'Lehrer' }).sg.gen, 'des Lehrers');
  assert.equal(declineNoun({ de: 'Lehrer', article: 'der', plural: 'Lehrer' }).pl.dat, 'den Lehrern');
  assert.equal(declineNoun({ de: 'Ergebnis', article: 'das', plural: 'Ergebnisse' }).sg.gen, 'des Ergebnisses');
});
test('n-declension', () => {
  const s = declineNoun({ de: 'Student', article: 'der', plural: 'Studenten' });
  assert.equal(s.sg.akk, 'den Studenten');
  assert.equal(s.sg.gen, 'des Studenten');
  assert.equal(s.sg.nom, 'der Student');
  const h = declineNoun({ de: 'Herr', article: 'der', plural: 'Herren' });
  assert.equal(h.sg.dat, 'dem Herrn');
  assert.equal(h.pl.nom, 'die Herren');
  assert.equal(declineNoun({ de: 'Name', article: 'der', plural: 'Namen' }).sg.gen, 'des Namens');
  assert.equal(declineNoun({ de: 'Kollege', article: 'der', plural: 'Kollegen' }).sg.akk, 'den Kollegen');
  // strong nouns on -ent stay strong
  assert.equal(declineNoun({ de: 'Moment', article: 'der', plural: 'Momente' }).sg.akk, 'den Moment');
});
test('plural -s, no plural, plural-only', () => {
  assert.equal(declineNoun({ de: 'Auto', article: 'das', plural: 'Autos' }).pl.dat, 'den Autos');
  const m = declineNoun({ de: 'Musik', article: 'die', plural: '-' });
  assert.equal(m.pl.nom, '–');
  const e = declineNoun({ de: 'Eltern', article: 'die', plural: '-' });
  assert.equal(e.sg, null);
  assert.equal(e.pl.dat, 'den Eltern');
  assert.equal(e.pl.gen, 'der Eltern');
});
test('adjective comparison', () => {
  const g = declineAdjective('gut');
  assert.equal(g.comparative, 'besser');
  assert.equal(g.superlative, 'am besten');
  const a = declineAdjective('alt');
  assert.equal(a.comparative, 'älter');
  assert.equal(a.superlative, 'am ältesten');
  assert.equal(declineAdjective('kurz').superlative, 'am kürzesten');
  assert.equal(declineAdjective('schön').superlative, 'am schönsten');
  assert.equal(declineAdjective('groß').superlative, 'am größten');
  assert.equal(declineAdjective('hoch').comparative, 'höher');
  assert.equal(declineAdjective('hoch').strong.m.nom, 'hoher');
  assert.equal(declineAdjective('dunkel').comparative, 'dunkler');
  assert.equal(declineAdjective('jung').comparative, 'jünger');
});
test('adjective declension', () => {
  const d = declineAdjective('schön');
  assert.equal(d.strong.m.nom, 'schöner');
  assert.equal(d.weak.m.akk, 'schönen');
  assert.equal(d.mixed.n.nom, 'schönes');
  assert.equal(d.strong.pl.gen, 'schöner');
  assert.equal(d.weak.f.nom, 'schöne');
  assert.equal(declineAdjective('teuer').weak.f.nom, 'teure');
  assert.equal(declineAdjective('müde').strong.m.nom, 'müder');
});
