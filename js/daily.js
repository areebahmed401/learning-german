// Tagesquiz: which grammar questions to ask today. Pure (no DOM, no storage), so it is unit-tested.
// The choice is seeded by the date, so reloading the page keeps the same quiz all day.
export const QUIZ_TYPES = ['mc', 'gap', 'article', 'order', 'translate']; // match grids are too slow for a quick quiz
export const MISTAKE_SHARE = 0.4; // up to 40% of a quiz are earlier mistakes
export const MAX_MISTAKES = 60;

/** Small deterministic PRNG (mulberry32) seeded from a string. */
export function seeded(seedText) {
  let a = 0;
  for (const ch of String(seedText)) a = (Math.imul(a ^ ch.charCodeAt(0), 2654435761) + 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const shuffleWith = (rand, a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Every quiz-able exercise, with a stable reference "lessonId#index". */
export function questionPool(lessons) {
  return lessons.flatMap((l) => l.exercises
    .map((ex, i) => ({ ...ex, _ref: `${l.id}#${i}`, _lesson: l.title, _level: l.level }))
    .filter((ex) => QUIZ_TYPES.includes(ex.type)));
}

/**
 * Today's questions: earlier mistakes first (up to 40%), then about two thirds from your current
 * level and the rest as review from the levels below. `round` > 0 gives a fresh set ("one more round").
 */
export function pickDaily({ lessons, level, mistakes = [], today, size = 10, round = 0 }) {
  const rand = seeded(`${today}#${round}`);
  const pool = questionPool(lessons);
  const byRef = new Map(pool.map((q) => [q._ref, q]));
  const picked = [];
  const used = new Set();
  const take = (list, n) => {
    for (const q of list) {
      if (picked.length >= size || n <= 0) break;
      if (used.has(q._ref)) continue;
      used.add(q._ref);
      picked.push(q);
      n--;
    }
  };
  take(shuffleWith(rand, mistakes.map((r) => byRef.get(r)).filter(Boolean)), Math.ceil(size * MISTAKE_SHARE));
  const current = shuffleWith(rand, pool.filter((q) => q._level === level));
  const below = shuffleWith(rand, pool.filter((q) => q._level !== level));
  const left = size - picked.length;
  take(current, below.length ? Math.ceil(left * 2 / 3) : left);
  take(below, size - picked.length);
  take(current, size - picked.length); // top up if the levels below ran short
  return shuffleWith(rand, picked);
}

/** Mistakes after a quiz: answered right → gone; answered wrong → (back) on the list, newest first. */
export function updateMistakes(mistakes, asked, wrongRefs) {
  const wrong = new Set(wrongRefs);
  const right = new Set(asked.filter((r) => !wrong.has(r)));
  return [...new Set([...wrongRefs, ...mistakes.filter((r) => !right.has(r))])].slice(0, MAX_MISTAKES);
}
