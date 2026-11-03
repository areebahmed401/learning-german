// Accept other correct German word orders for a typed or built sentence (pure, tested in tests/wordorder.test.mjs).
// "Ich spiele heute Fußball" is as right as "Heute spiele ich Fußball": any one block may come first as long as the
// finite verb stays in position 2. Questions, imperatives and sentences with a comma stay strict.
import { toPlain } from './umlaut.js';

const tokens = (s) => toPlain(String(s).toLowerCase().replace(/[.!?;:„“"»«]/g, '')).split(/\s+/).filter(Boolean);
const same = (a, b) => a.length === b.length && a.every((t, i) => t === b[i]);
const indexOfRun = (list, run) => {
  for (let i = 0; i + run.length <= list.length; i++) if (same(list.slice(i, i + run.length), run)) return i;
  return -1;
};

/**
 * True when `given` is `accepted` with a different block moved in front of the verb (verb-second order kept).
 * isVerb(token) says whether a lower-case token is a verb form; the first one after position 0 is the finite verb.
 */
export function sameV2Sentence(given, accepted, isVerb) {
  if (/[,?]/.test(accepted)) return false;
  const a = tokens(accepted);
  const g = tokens(given);
  if (a.length < 3 || a.length !== g.length || same(a, g)) return false;
  if ([...a].sort().join(' ') !== [...g].sort().join(' ')) return false; // the same words, nothing added or lost
  const v = a.findIndex((t, i) => i > 0 && isVerb(t));
  if (v < 0) return false;
  const gv = g.indexOf(a[v]);
  if (gv < 1) return false;
  const front = g.slice(0, gv); // the new first block must be a block of the accepted sentence
  const at = indexOfRun(a, front);
  if (at < 0 || (at < v && at + front.length > v)) return false;
  const oldFront = a.slice(0, v);
  const midfield = a.filter((_, i) => i !== v && (i < at || i >= at + front.length)); // accepted, without verb and new front
  const rest = g.slice(gv + 1);
  if (!same(front, oldFront)) {
    // the old first block goes back into the middle field, as one block, anywhere before the sentence end
    const without = midfield.slice(oldFront.length);
    const lastFixed = !front.includes(a[a.length - 1]);
    for (let i = 0; i <= without.length; i++) {
      const cand = [...without.slice(0, i), ...oldFront, ...without.slice(i)];
      if (lastFixed && cand[cand.length - 1] !== a[a.length - 1]) continue;
      if (same(cand, rest)) return true;
    }
    return false;
  }
  return same(midfield, rest);
}
