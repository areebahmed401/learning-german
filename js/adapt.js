// Adaptive difficulty (⚙ Settings → Adaptive): harder while you do well, easier when you struggle.
// Pure functions (no DOM, no storage), tested in tests/adapt.test.mjs.
import { known } from './srs.js';

export const CARD_STEP = 5; // new cards per day go up or down by this much
export const CARD_MIN = 5;
export const CARD_MAX = 50;
export const CARD_WINDOW = 3; // practice days looked at
export const CARD_MIN_ANSWERS = 15; // too few answers say nothing
export const UNLOCK_SHARE = 0.8; // share of a level's words known before the next level's words join the deck
export const QUIZ_WINDOW = 30; // latest quiz answers at your level that count
export const QUIZ_MIN_ANSWERS = 15;
export const STRETCH_AT = 0.85;
export const EASE_BELOW = 0.6;
export const KEEP_ANSWERS = 200; // quiz answers kept in progress

const rate = (right, total) => (total ? right / total : 0);
const pct = (x) => `${Math.round(x * 100)}%`;

/**
 * New cards for today. `stats` is { 'YYYY-MM-DD': { first, right } } (first tries per day);
 * `adapt` is the stored { newCards, day } from the last change. One change per day at most, and only
 * after you practised since the last change, so skipped days don't pile up raises.
 */
export function nextNewCards({ base, adapt, stats, today, due }) {
  const current = adapt?.newCards ?? base;
  const since = adapt?.day ?? '';
  const days = Object.keys(stats).filter((d) => d < today).sort().slice(-CARD_WINDOW);
  const keep = { newCards: current, day: since, change: 0, reason: null };
  if (since === today || !days.some((d) => d >= since)) return keep;
  const first = days.reduce((s, d) => s + stats[d].first, 0);
  const right = days.reduce((s, d) => s + stats[d].right, 0);
  if (first < CARD_MIN_ANSWERS) return keep;
  const acc = rate(right, first);
  let next = current;
  if (acc >= 0.9 && due <= current * 2) next = Math.min(CARD_MAX, current + CARD_STEP);
  else if (acc < 0.7 || due > current * 3) next = Math.max(CARD_MIN, current - CARD_STEP);
  const firstTries = `${pct(acc)} right on the first try`;
  if (next === current) return { ...keep, reason: firstTries };
  const why = next < current && acc >= 0.7 ? `${due} reviews waiting` : firstTries;
  return { newCards: next, day: today, change: next - current, reason: why };
}

/** Share of these words you know (review gap of a week or more, see srs.known). */
export function mastery(words, cards, key) {
  const keys = [...new Set(words.map(key))];
  return rate(keys.filter((k) => known(cards[k])).length, keys.length);
}

/** Mix two word lists 1:1 (the next level's words join without waiting for the current level to run out). */
export function interleave(a, b) {
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

/**
 * How today's quiz should lean, from recent answers [{ l: level, t: type, ok }]:
 * 'stretch' adds questions from the next level, 'ease' adds review and old mistakes, else 'steady'.
 * typeWeights favours the question types you miss most.
 */
export function quizPlan({ answers = [], level, nextLevel, size = 10 }) {
  const mine = answers.filter((a) => a.l === level).slice(-QUIZ_WINDOW);
  const acc = rate(mine.filter((a) => a.ok).length, mine.length);
  const typeWeights = {};
  const byType = {};
  for (const a of answers.slice(-QUIZ_WINDOW * 2)) (byType[a.t] ??= []).push(a.ok);
  for (const [t, oks] of Object.entries(byType)) typeWeights[t] = 1 + 2 * rate(oks.filter((x) => !x).length, oks.length);
  const weakest = Object.entries(typeWeights).filter(([, w]) => w >= 1.6).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  // stretchLevel is set even with no stretch questions, so the next level never counts as review
  const base = { mode: 'steady', acc, answered: mine.length, stretch: 0, stretchLevel: nextLevel ?? null, belowShare: 1 / 3, mistakeShare: 0.4, typeWeights, weakest };
  if (mine.length < QUIZ_MIN_ANSWERS) return base;
  if (acc >= STRETCH_AT && nextLevel) return { ...base, mode: 'stretch', stretch: Math.max(1, Math.round(size * 0.25)) };
  if (acc < EASE_BELOW) return { ...base, mode: 'ease', belowShare: 2 / 3, mistakeShare: 0.5 };
  return base;
}

/** Ready for the level checkpoint: the quiz and the cards both say this level is down. */
export function readyToAdvance({ answers = [], level, levelMastery = 0, checkpointPassed = false }) {
  if (checkpointPassed) return false;
  const mine = answers.filter((a) => a.l === level).slice(-QUIZ_WINDOW);
  return mine.length >= 20 && rate(mine.filter((a) => a.ok).length, mine.length) >= STRETCH_AT && levelMastery >= UNLOCK_SHARE;
}

/** Order a list by type weight with a seeded random, so weak types come up more often (weighted shuffle). */
export function weightedOrder(rand, list, weightOf) {
  return list.map((x) => ({ x, k: rand() ** (1 / Math.max(0.01, weightOf(x))) }))
    .sort((a, b) => b.k - a.k).map((e) => e.x);
}
