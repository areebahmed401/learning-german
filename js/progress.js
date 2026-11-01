// Learner progress, kept in localStorage. Every read/write is guarded:
// private windows or blocked storage just mean progress isn't remembered.
import { day as srsDay } from './srs.js';
import { KEEP_ANSWERS } from './adapt.js';

const KEY = 'lg-progress-v1';
export const PASS = 0.7;

const blank = () => ({ lessons: {}, checkpoints: {}, speakDays: [], cards: {}, cardDays: [], cardStats: {}, quiz: { days: {}, mistakes: [], answers: [] }, adapt: {}, settings: {}, version: 1 });
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return withDefaults(JSON.parse(raw));
  } catch {}
  return blank();
}

/** Older progress files lack newer sections: fill them in. */
function withDefaults(data) {
  const b = blank();
  return { ...b, ...data, quiz: { ...b.quiz, ...data.quiz }, adapt: { ...data.adapt } };
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

const lesson = (id) => (state.lessons[id] ??= { steps: {}, best: 0, done: false, mistakes: [] });

export function markStep(id, step) {
  const l = lesson(id);
  if (!l.steps[step]) { l.steps[step] = true; save(); }
}

export function recordPractice(id, score, mistakes, wordCount) {
  const l = lesson(id);
  l.best = Math.max(l.best, score);
  l.mistakes = mistakes;
  l.wordCount = wordCount;
  if (score >= PASS) l.done = true;
  save();
  return l;
}

export function setMistakes(id, mistakes) {
  lesson(id).mistakes = mistakes;
  save();
}

export function recordCheckpoint(level, score) {
  const c = (state.checkpoints[level] ??= { best: 0, passed: false });
  c.best = Math.max(c.best, score);
  if (score >= PASS) c.passed = true;
  save();
  return c;
}

export function recordSpeak() {
  const today = new Date().toISOString().slice(0, 10);
  if (!state.speakDays.includes(today)) { state.speakDays.push(today); save(); }
}

export const lessonState = (id) => state.lessons[id];
export const checkpointState = (level) => state.checkpoints[level];

/** 'done' | 'progress' | 'new' */
export function status(id) {
  const l = state.lessons[id];
  if (!l) return 'new';
  if (l.done) return 'done';
  return Object.keys(l.steps).length || l.best ? 'progress' : 'new';
}

/** Fraction of the 5 lesson steps visited (practice counts once passed). */
export function stepFraction(id) {
  const l = state.lessons[id];
  if (!l) return 0;
  if (l.done) return 1;
  return Math.min(Object.keys(l.steps).length, 5) / 5;
}

function streak(list, fmt) {
  const days = new Set(list);
  let n = 0;
  const d = new Date();
  // today not practised yet still keeps yesterday's streak alive
  if (!days.has(fmt(d))) d.setDate(d.getDate() - 1);
  while (days.has(fmt(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export const speakStreak = () => streak(state.speakDays, (d) => d.toISOString().slice(0, 10));

/* ---------- Settings (⚙ → Settings; saved in the progress file) ---------- */
export const DEFAULT_SETTINGS = {
  level: 'auto', // 'auto' = the level of your current stop on the road, or 'A1' … 'C1'
  newCards: 15, // new flashcards per day
  deck: 'level', // 'level' = all words up to your level, 'mine' = opened lessons, or one level id
  reverse: false, // cards English → German
  autoplay: true, // read the German aloud when a card flips
  quizSize: 10, // questions in the daily quiz
  adaptive: true, // adapt.js: new cards, quiz mix and level follow how you do
};
export const settings = () => ({ ...DEFAULT_SETTINGS, ...state.settings });
export function setSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  if ('newCards' in patch) state.adapt.cards = null; // a number you set yourself is the new starting point
  save();
}

/** The level you're working on: the setting, else (or with auto) the level of the first stop not done yet. */
export function currentLevel(road, { auto = false } = {}) {
  const { level } = settings();
  const ids = road.levels.filter((l) => l.milestones?.length).map((l) => l.id);
  if (!auto && ids.includes(level)) return level;
  for (const lv of road.levels) {
    if (!lv.milestones?.length) continue;
    const passed = state.checkpoints[lv.id]?.passed;
    if (passed && settings().adaptive) continue; // adaptive: passing the checkpoint moves you up, finished stops or not
    if (lv.milestones.some((m) => status(m.id) !== 'done') || !passed) return lv.id;
  }
  return ids.at(-1);
}

/* ---------- Daily quiz (question choice lives in daily.js) ---------- */
export const quizState = () => state.quiz;
/** answers: [{ l: level, t: type, ok }] for the adaptive quiz plan. */
export function recordQuiz(today, score, mistakes, answers = []) {
  state.quiz.days[today] = Math.max(state.quiz.days[today] ?? 0, score);
  state.quiz.mistakes = mistakes;
  state.quiz.answers = [...state.quiz.answers, ...answers].slice(-KEEP_ANSWERS);
  save();
}
export const quizStreak = () => streak(Object.keys(state.quiz.days), srsDay);

/* ---------- Flashcards (scheduling lives in srs.js) ---------- */
export const cards = () => state.cards;
export const openedLessons = () => Object.keys(state.lessons);

/** firstTry: this was the card's first answer in the session (counted in cardStats for adapt.js). */
export function setCard(key, card, today, firstTry = false, ok = false) {
  state.cards[key] = card;
  if (firstTry) {
    const d = (state.cardStats[today] ??= { first: 0, right: 0 });
    d.first += 1;
    if (ok) d.right += 1;
  }
  if (!state.cardDays.includes(today)) state.cardDays.push(today);
  save();
}

export const cardStats = () => state.cardStats;

/* ---------- Adaptive state: today's new-card number and each level's word mastery ---------- */
export const adaptState = () => state.adapt;
export function setAdapt(patch) {
  state.adapt = { ...state.adapt, ...patch };
  save();
}

export const cardStreak = () => streak(state.cardDays, srsDay);

export function wordsLearned() {
  return Object.values(state.lessons).reduce((s, l) => s + (l.done ? l.wordCount || 0 : 0), 0);
}

export function exportFile() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `deutschweg-progress-${new Date().toISOString().slice(0, 10)}.json`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importFile(file) {
  const data = JSON.parse(await file.text());
  if (typeof data !== 'object' || !data.lessons) throw new Error('Not a Deutschweg progress file');
  state = withDefaults(data);
  save();
}

export function reset() {
  state = blank();
  save();
}
