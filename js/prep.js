// Präpositionen-Trainer: which case does each preposition take? Pure (no DOM, no storage), so it is unit-tested.
// Round 1 asks the case of a preposition; round 2 fills the article of a sentence. Prepositions you miss
// (`weak`: prep → miss count) are drawn more often until you get them right again.
import { seeded } from './daily.js';

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
export const CORE_LEVEL = 'A2'; // groups up to this level are drilled from the start; higher ones (Genitiv) wait for their level
export const MAX_WEIGHT = 9; // a prep never counts more than 9 times as often as one you know
export const CASE_ORDER = ['akk', 'dat', 'wechsel', 'gen'];

const rank = (level) => LEVELS.indexOf(level);

/** Weight of a preposition: 1 + 2 per net miss, capped. */
export const weightOf = (weak, prep) => Math.min(MAX_WEIGHT, 1 + 2 * (weak?.[prep] || 0));

/** Group keys (in CASE_ORDER) open at this level. */
export function openGroups(data, level) {
  return CASE_ORDER.filter((k) => data.groups[k] && (rank(data.groups[k].level) <= Math.max(rank(CORE_LEVEL), rank(level))));
}

const groupOf = (data, prep) => CASE_ORDER.find((k) => data.groups[k]?.preps.includes(prep));

/**
 * Weighted draw of up to `size` candidates: weight falls by half with every earlier pick of the same prep,
 * a prep is picked at most capOf(prep) times, and the same prep never comes twice in a row if avoidable.
 * With `unique` a candidate is drawn only once (sentences).
 */
function draw(rand, cands, size, { weightFor, capOf, unique }) {
  const left = [...cands];
  const count = {};
  const out = [];
  let prev = null;
  while (out.length < size) {
    let pool = left.filter((c) => (count[c.prep] || 0) < capOf(c.prep));
    if (!pool.length) break;
    const other = pool.filter((c) => c.prep !== prev);
    if (other.length) pool = other;
    const w = pool.map((c) => weightFor(c.prep) / 2 ** (count[c.prep] || 0));
    let r = rand() * w.reduce((a, b) => a + b, 0);
    let k = 0;
    while (k < pool.length - 1 && (r -= w[k]) >= 0) k++;
    const pick = pool[k];
    out.push(pick);
    count[pick.prep] = (count[pick.prep] || 0) + 1;
    prev = pick.prep;
    if (unique) left.splice(left.indexOf(pick), 1);
  }
  return out;
}

/** Round 1: "mit + ?" → Akkusativ / Dativ / Wechsel / Genitiv (Genitiv only once its level is reached). */
export function caseRound(data, { level = 'A1', weak = {}, size = 20, seed = 'prep' } = {}) {
  const keys = openGroups(data, level);
  const options = keys.map((k) => data.groups[k].name);
  const cands = keys.flatMap((k) => data.groups[k].preps.map((prep) => ({ prep, group: k })));
  const rand = seeded(`case#${seed}`);
  const picked = draw(rand, cands, size, {
    weightFor: (p) => weightOf(weak, p),
    capOf: (p) => 1 + Math.min(2, weak[p] || 0), // only a prep you miss comes back within the round
    unique: false,
  });
  return picked.map(({ prep, group }) => ({
    type: 'mc',
    q: `${prep} + ?`,
    options,
    answer: keys.indexOf(group),
    explain: `**${prep}** → ${data.groups[group].name}. ${data.groups[group].hook}`,
    _prep: prep,
  }));
}

/** Round 2: choose the article in a sentence (core sentences always, Genitiv from B1). Wechsel sentences end with (Wo?) or (Wohin?). */
export function gapRound(data, { level = 'A1', weak = {}, size = 12, seed = 'prep' } = {}) {
  const rand = seeded(`gap#${seed}`);
  const cands = data.sentences.filter((s) => rank(s.level) <= Math.max(rank(CORE_LEVEL), rank(level)));
  const picked = draw(rand, cands, size, {
    weightFor: (p) => weightOf(weak, p),
    capOf: (p) => 2 + Math.min(2, weak[p] || 0),
    unique: true,
  });
  return picked.map((s) => {
    const order = shuffleWith(rand, s.options.map((_, i) => i));
    const g = data.groups[groupOf(data, s.prep)];
    return {
      type: 'mc',
      q: s.ask ? `${s.q} (${s.ask === 'wo' ? 'Wo?' : 'Wohin?'})` : s.q,
      options: order.map((i) => s.options[i]),
      answer: order.findIndex((i) => s.options[i] === s.answer),
      explain: g ? `${s.explain} ${g.hook}` : s.explain,
      _prep: s.prep,
    };
  });
}

function shuffleWith(rand, a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** results: [{ prep, ok }]. A miss adds 1, a right answer takes 1 off (gone at 0). Returns a new object. */
export function updateWeak(weak, results) {
  const next = { ...weak };
  for (const { prep, ok } of results) {
    const n = (next[prep] || 0) + (ok ? -1 : 1);
    if (n > 0) next[prep] = n; else delete next[prep];
  }
  return next;
}

/** The prepositions you miss most, worst first: [[prep, misses], ...]. */
export const topMisses = (weak, n = 4) => Object.entries(weak).sort((a, b) => b[1] - a[1]).slice(0, n);

/** Tageschallenge: the same mixed round all day (half "which case?", half sentences), alternating. */
export function dailyRound(data, { level = 'A1', weak = {}, today, size = 12 } = {}) {
  const cases = caseRound(data, { level, weak, size: Math.floor(size / 2), seed: `daily#${today}` });
  const gaps = gapRound(data, { level, weak, size: Math.ceil(size / 2), seed: `daily#${today}` });
  return gaps.flatMap((g, i) => (cases[i] ? [cases[i], g] : [g]));
}
