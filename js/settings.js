// ⚙ Settings page: level, flashcards, daily quiz, theme. Changes save at once (with the progress file).
import { h, getRoadmap, toast } from './util.js';
import * as progress from './progress.js';

const field = (label, hint, control) =>
  h('label.set-row', h('span.set-label', h('b', label), hint ? h('small.muted', hint) : null), control);

function select(value, options, onChange) {
  return h('select.set-select', { onchange: (e) => onChange(e.target.value) },
    options.map(([v, text]) => h('option', { value: v, selected: String(v) === String(value) }, text)));
}

const saved = () => toast('Saved');

export async function renderSettings(view) {
  document.title = 'Settings · Deutschweg';
  const road = await getRoadmap();
  const s = progress.settings();
  const levels = road.levels.filter((l) => l.milestones?.length).map((l) => l.id);
  const set = (patch) => { progress.setSettings(patch); saved(); };

  let theme = 'system';
  try { theme = localStorage.getItem('lg-theme') || 'system'; } catch {}
  const setTheme = (t) => {
    const root = document.documentElement;
    try {
      if (t === 'system') { delete root.dataset.theme; localStorage.removeItem('lg-theme'); }
      else { root.dataset.theme = t; localStorage.setItem('lg-theme', t); }
    } catch {}
    saved();
  };

  // shown as "Auto (A2)", so it is clear what auto means right now
  const autoLevel = progress.currentLevel(road, { auto: true });
  const autoLabel = `Auto: follow my road (now ${autoLevel})`;

  view.replaceChildren(h('article.lesson.settings',
    h('header.lesson-head', h('a.back', { href: '#/road' }, '← Zurück zur Straße'), h('h1', '⚙ Settings'),
      h('p', 'Saved on this device and in your progress file (⚙ → Save my progress).')),

    h('section.card',
      h('h2', '📈 Adaptive difficulty'),
      field('Adapt to how I do', 'New cards a day, the quiz mix and words from the next level follow your results. Passing a level checkpoint moves "Auto" up to the next level.',
        h('input.set-check', { type: 'checkbox', checked: s.adaptive, onchange: (e) => set({ adaptive: e.target.checked }) }))),

    h('section.card',
      h('h2', '📍 My level'),
      field('Level I am working on', 'Used for the flashcard deck and the daily quiz.',
        select(s.level, [['auto', autoLabel], ...levels.map((l) => [l, l])], (v) => set({ level: v })))),

    h('section.card',
      h('h2', '🃏 Karten'),
      field('New cards per day', s.adaptive && progress.adaptState().cards
        ? `Reviews are always shown. Adaptive starts here and is at ${progress.adaptState().cards.newCards} now; changing this restarts it.`
        : 'Reviews are always shown. With adaptive on, this is the starting point.',
        select(s.newCards, [5, 10, 15, 20, 25, 30, 40, 50].map((n) => [n, String(n)]), (v) => set({ newCards: Number(v) }))),
      field('More new cards per click', 'When today\u2019s new cards are done, "+ more new words" adds this many and starts straight away.',
        select(s.moreCards, [5, 10, 15, 20, 25, 30, 40, 50].map((n) => [n, String(n)]), (v) => set({ moreCards: Number(v) }))),
      field('Deck', '"My level" = every word up to your level (Alltag places + dictionary). Pick one place in Karten.',
        select(s.deck, [['level', 'My level'], ['mine', 'Places I have opened'], ...levels.map((l) => [l, `${l} only`]),
          ...(s.deck.startsWith('place:') ? [[s.deck, 'One place (picked in Karten)']] : [])], (v) => set({ deck: v }))),
      field('Scheduling', 'How long until a card comes back. SM-2 multiplies the gap by each card’s ease; FSRS predicts when you would forget (aims for 90% recall). Your cards keep their history when you switch.',
        select(s.algorithm, [['sm2', 'SM-2 (Anki classic)'], ['fsrs', 'FSRS (Anki’s newer default)']], (v) => set({ algorithm: v }))),
      field('Direction', 'English → Deutsch is better speaking practice.',
        select(s.reverse ? 'en' : 'de', [['de', 'Deutsch → English'], ['en', 'English → Deutsch']], (v) => set({ reverse: v === 'en' }))),
      field('Read German aloud', 'When a card shows the German word.',
        h('input.set-check', { type: 'checkbox', checked: s.autoplay, onchange: (e) => set({ autoplay: e.target.checked }) }))),

    h('section.card',
      h('h2', '⚡ Tagesquiz'),
      field('Questions per quiz', null,
        select(s.quizSize, [5, 10, 15, 20].map((n) => [n, String(n)]), (v) => set({ quizSize: Number(v) }))),
      field('Pass mark', 'The share you need right to finish a lesson, a place or a level checkpoint, and to pass the daily quiz.',
        select(String(s.passMark), [0.5, 0.6, 0.7, 0.8, 0.9, 1].map((n) => [String(n), `${Math.round(n * 100)}%`]), (v) => set({ passMark: Number(v) })))),

    h('section.card',
      h('h2', '📄 Cheat sheets'),
      h('p.muted', 'One page per level: the top rules, each lesson’s main table, tip and an example. Printable.'),
      h('div.sheet-levels', levels.map((l) => h('a.chip', { href: `#/sheet/${l}` }, l)))),

    h('section.card',
      h('h2', '🎨 Appearance'),
      field('Theme', null, select(theme, [['system', 'Like my device'], ['light', 'Light'], ['dark', 'Dark']], setTheme))),

    h('div.speak-row',
      h('a.btn', { href: '#/cards' }, '🃏 Karten'),
      h('a.btn', { href: '#/quiz' }, '⚡ Tagesquiz'),
      h('a.btn.primary', { href: '#/road' }, 'Zur Straße →'))));
}
