// Flashcard scheduling (Leitner boxes). Pure functions: no DOM, no storage.
// A card record is { box, due, fails, seen, first, lapsed }; dates are local 'YYYY-MM-DD'.
export const INTERVALS = [0, 1, 3, 7, 14, 30]; // days until the next review, by box
export const MAX_BOX = INTERVALS.length - 1;
export const NEW_PER_DAY = 15;

export const day = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return day(new Date(y, m - 1, d + n));
}

/** One key per word, so a word taught in two lessons is one card. */
export const cardKey = (w) => (w.pos === 'noun' && w.article ? `${w.article} ${w.de}` : w.de);

/**
 * Knew it: up one box. Missed it: back to box 1, due again today.
 * A word missed today that is then answered right stays in box 1 (back tomorrow), so it can't jump ahead.
 */
export function answer(card, knew, today) {
  const c = { box: 0, fails: 0, seen: 0, first: today, ...card };
  c.seen += 1;
  if (!knew) return { ...c, box: 1, fails: c.fails + 1, lapsed: today, due: today };
  const box = c.lapsed === today ? 1 : Math.min(c.box + 1, MAX_BOX);
  return { ...c, box, due: addDays(today, INTERVALS[box]) };
}

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
    .sort((a, b) => b[1].fails - a[1].fails || a[1].box - b[1].box).slice(0, n);
