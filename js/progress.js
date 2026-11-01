// Learner progress, kept in localStorage. Every read/write is guarded:
// private windows or blocked storage just mean progress isn't remembered.
import { day as srsDay } from './srs.js';

const KEY = 'lg-progress-v1';
export const PASS = 0.7;

const blank = () => ({ lessons: {}, checkpoints: {}, speakDays: [], cards: {}, cardDays: [], version: 1 });
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...blank(), ...JSON.parse(raw) };
  } catch {}
  return blank();
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

/* ---------- Flashcards (scheduling lives in srs.js) ---------- */
export const cards = () => state.cards;
export const openedLessons = () => Object.keys(state.lessons);

export function setCard(key, card, today) {
  state.cards[key] = card;
  if (!state.cardDays.includes(today)) state.cardDays.push(today);
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
  state = { ...blank(), ...data };
  save();
}

export function reset() {
  state = blank();
  save();
}
