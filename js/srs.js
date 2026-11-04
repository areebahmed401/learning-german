// Flashcard scheduling like Anki: SM-2 (default) or FSRS, picked in ⚙ Settings. Pure functions: no DOM, no storage.
// A card record is { due, last, ivl, reps, lapses, fails, seen, first, lapsed, ease, smIvl, s, d }; dates are local 'YYYY-MM-DD'.
// Both models are updated on every answer, so switching the setting keeps each card's history; `ivl` and `due` follow the
// algorithm in use. Old Leitner cards ({ box, … }) are converted on first use (normalize).
// Ratings: 1 Again (Nochmal), 2 Hard (Schwer), 3 Good (Gut), 4 Easy (Leicht). Again brings the card back this session.
export const ALGORITHMS = ['sm2', 'fsrs'];
export const NEW_PER_DAY = 15;
export const KNOWN_DAYS = 7; // a word counts as known once its review gap is a week or more
export const MAX_IVL = 3650;
const LEITNER = [0, 1, 3, 7, 14, 30]; // the old box intervals, only for converting old cards

export const day = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return day(new Date(y, m - 1, d + n));
}

export function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
}

/** One key per word, so a word taught in two lessons is one card. */
export const cardKey = (w) => (w.pos === 'noun' && w.article ? `${w.article} ${w.de}` : w.de);

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** An old Leitner card gets SM-2 and FSRS state from its box and misses; new-style cards pass through. */
export function normalize(card) {
  if (!card || card.ease != null) return card;
  const fails = card.fails || 0;
  const ivl = LEITNER[clamp(card.box || 0, 0, LEITNER.length - 1)];
  const { box, ...rest } = card;
  return {
    reps: card.seen || 0, lapses: Math.min(fails, card.seen || 0), fails, seen: 0, ...rest,
    ivl, smIvl: ivl, ease: Math.max(1.3, 2.5 - 0.15 * Math.min(fails, 4)),
    s: Math.max(ivl, 0.5), d: clamp(5 + 0.8 * fails, 1, 10),
    last: card.due ? addDays(card.due, -ivl) : card.first,
  };
}

// --- SM-2, as Anki has used it for years (day steps; "learning" happens by repeating Again in the session) ---
const START_EASE = 2.5;
const MIN_EASE = 1.3;

function sm2(c, rating, today) {
  const ease = c.ease ?? START_EASE;
  const ivl = c.smIvl || 0;
  if (!ivl || c.last === today) { // new, or relearning after an Again today
    return { ease, smIvl: [0, 1, 1, 4][rating - 1] };
  }
  const late = Math.max(0, daysBetween(c.due || today, today));
  const hard = Math.max(ivl + 1, Math.round(ivl * 1.2));
  const good = Math.max(hard + 1, Math.round((ivl + late / 2) * ease));
  const easy = Math.max(good + 1, Math.round((ivl + late) * ease * 1.3));
  return [
    { ease: Math.max(MIN_EASE, ease - 0.2), smIvl: 0 },
    { ease: Math.max(MIN_EASE, ease - 0.15), smIvl: hard },
    { ease, smIvl: good },
    { ease: ease + 0.15, smIvl: easy },
  ][rating - 1];
}

// --- FSRS-6 with the default parameters of open-spaced-repetition/py-fsrs, desired retention 90% ---
export const FSRS_W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796,
  1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
const W = FSRS_W;
const DECAY = -W[20];
const FACTOR = 0.9 ** (1 / DECAY) - 1;
const RETENTION = 0.9;
const initD = (r) => W[4] - Math.exp(W[5] * (r - 1)) + 1;
const nextD = (d, r) => {
  const damped = d + (10 - d) * (-W[6] * (r - 3)) / 9;
  return clamp(W[7] * initD(4) + (1 - W[7]) * damped, 1, 10);
};
export const retrievability = (t, s) => (1 + FACTOR * t / s) ** DECAY;
const fsrsIvl = (s) => clamp(Math.round((s / FACTOR) * (RETENTION ** (1 / DECAY) - 1)), 1, MAX_IVL);

function fsrs(c, rating, today) {
  if (c.s == null) return { s: Math.max(W[rating - 1], 0.001), d: clamp(initD(rating), 1, 10) };
  let s;
  const t = c.last ? daysBetween(c.last, today) : 0;
  if (t < 1) { // again the same day: short-term stability
    const inc = Math.exp(W[17] * (rating - 3 + W[18])) * c.s ** -W[19];
    s = c.s * (rating > 1 ? Math.max(inc, 1) : inc);
  } else {
    const R = retrievability(t, c.s);
    s = rating === 1
      ? Math.min(W[11] * c.d ** -W[12] * ((c.s + 1) ** W[13] - 1) * Math.exp((1 - R) * W[14]), c.s / Math.exp(W[17] * W[18]))
      : c.s * (1 + Math.exp(W[8]) * (11 - c.d) * c.s ** -W[9] * (Math.exp((1 - R) * W[10]) - 1)
        * (rating === 2 ? W[15] : 1) * (rating === 4 ? W[16] : 1));
  }
  return { s: Math.max(s, 0.001), d: nextD(c.d, rating) };
}

/** Days until the next review for each rating 1–4 (0 = again this session), for the button labels. */
export function preview(card, today, algorithm = 'sm2') {
  return [1, 2, 3, 4].map((r) => answer(card, r, today, algorithm).ivl);
}

/**
 * Answer a card with a rating 1–4. Updates both models; the chosen algorithm sets the gap (`ivl`) and the due date.
 * Again counts as a miss (fails, lapsed) and keeps the card due today.
 */
export function answer(card, rating, today, algorithm = 'sm2') {
  const old = normalize(card);
  const c = { reps: 0, lapses: 0, fails: 0, seen: 0, first: today, ...old };
  const sm = sm2(c, rating, today);
  const fs = fsrs(c, rating, today);
  const ivl = rating === 1 ? 0 : Math.min(algorithm === 'fsrs' ? fsrsIvl(fs.s) : sm.smIvl, MAX_IVL);
  const out = { ...c, ...sm, ...fs, ivl, last: today, due: addDays(today, ivl), seen: c.seen + 1, reps: c.reps + 1 };
  if (rating === 1) {
    out.fails = c.fails + 1;
    out.lapsed = today;
    if (old?.ivl) out.lapses = c.lapses + 1; // forgot a word it had learned
  }
  return out;
}

/** Known = the review gap has reached a week. Works for old Leitner cards too. */
export const known = (card) => (normalize(card)?.ivl ?? 0) >= KNOWN_DAYS;

/** Today's queue: every due card (oldest first), then new words up to the daily limit. */
export function buildQueue(words, cards, today, newLimit = NEW_PER_DAY) {
  const seen = new Set();
  const due = [];
  const fresh = [];
  for (const w of words) {
    const k = cardKey(w);
    if (seen.has(k)) continue;
    seen.add(k);
    const c = cards[k];
    if (!c) fresh.push(w);
    else if (c.due <= today) due.push(w);
  }
  due.sort((a, b) => cards[cardKey(a)].due.localeCompare(cards[cardKey(b)].due));
  const newToday = Object.values(cards).filter((c) => c.first === today).length;
  return [...due, ...fresh.slice(0, Math.max(0, newLimit - newToday))];
}

/** Put a missed card back a few places ahead, so it comes round again this session. */
export function requeue(queue, word, gap = 3) {
  const q = [...queue];
  q.splice(Math.min(gap, q.length), 0, word);
  return q;
}

/** Words missed most often, for the "Schwierige Wörter" list. */
export const hardest = (cards, n = 10) =>
  Object.entries(cards).filter(([, c]) => c.fails > 0)
    .sort((a, b) => b[1].fails - a[1].fails || (normalize(a[1]).ivl ?? 0) - (normalize(b[1]).ivl ?? 0)).slice(0, n);

/** Reviews due on each of the next n days (day 0 = today, including overdue cards). */
export function forecast(cards, today, n = 7) {
  const out = Array(n).fill(0);
  for (const c of Object.values(cards)) {
    if (!c.due) continue;
    const i = Math.max(0, daysBetween(today, c.due));
    if (i < n) out[i] += 1;
  }
  return out;
}
