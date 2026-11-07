// 🎯 Präpositionen-Trainer (#/prep), in the dock next to Tagesquiz and Karten: a daily challenge (the same 12 mixed
// questions all day, scored and streaked) plus two practice rounds, memory hooks, and the prepositions you miss
// come back more often (see prep.js).
import { h, getRoadmap, getJSON, md } from './util.js';
import { runQuiz } from './exercises.js';
import * as progress from './progress.js';
import * as prep from './prep.js';
import { day } from './srs.js';

const ROUNDS = {
  daily: { label: '⚡ Tageschallenge', make: (data, o) => prep.dailyRound(data, { ...o, today: day() }) },
  case: { label: 'Runde 1: Welcher Fall?', make: prep.caseRound },
  gap: { label: 'Runde 2: Lücke', make: prep.gapRound },
};

export async function renderPrep(view) {
  document.title = 'Präpositionen-Trainer · Deutschweg';
  const [road, data] = await Promise.all([getRoadmap(), getJSON('data/prepositions.json')]);
  const level = progress.currentLevel(road);
  const today = day();
  const open = prep.openGroups(data, level);
  let weak = progress.prepState().weak;

  const body = h('section');
  view.replaceChildren(h('article.lesson',
    h('header.lesson-head', h('a.back', { href: '#/road' }, '← Zurück zur Straße'), h('h1', '🎯 Präpositionen-Trainer'),
      h('p', 'Which case does each preposition take? The daily challenge mixes 12 questions; the two practice rounds drill one kind. Prepositions you miss come back more often.')),
    h('div.stats.cards-stats', { id: 'prep-stats' }),
    body));

  const overview = () => {
    const misses = prep.topMisses(weak);
    const score = progress.prepState().days[today];
    body.replaceChildren(
      h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-bottom:16px' },
        prep.CASE_ORDER.filter((k) => data.groups[k]).map((k) => {
          const g = data.groups[k];
          const locked = !open.includes(k);
          return h('div.card', { style: `margin:0${locked ? ';opacity:.6' : ''}` },
            h('h2', g.name, ' ', h('span.muted', { style: 'font-size:.8rem' }, locked ? `from ${g.level}` : g.level === 'B1' ? 'B1' : '')),
            h('p', h('b', g.preps.join(', '))),
            h('p.muted', { style: 'margin:0', html: md(g.hook) }));
        })),
      h('div.card.cards-start',
        h('p', score != null ? `Today's challenge is done: ${Math.round(score * 100)}%. Practise more below, or play it again.` : h('b', '12 questions for today.'),
          misses.length ? ` Weak spots: ${misses.map(([p]) => p).join(', ')}.` : ''),
        h('div.speak-row',
          Object.entries(ROUNDS).map(([kind, r]) =>
            h(`button.btn${kind === 'daily' && score == null ? '.primary' : ''}`, { type: 'button', onclick: () => start(kind) }, kind === 'daily' && score != null ? '↻ Tageschallenge' : r.label)))));
    const q = progress.prepState();
    view.querySelector('#prep-stats').replaceChildren(
      stat(score != null ? `${Math.round(score * 100)}%` : '–', 'today'),
      stat(`${progress.prepStreak()} 🔥`, 'day streak'),
      stat(Object.keys(q.weak).length, 'weak spots'),
      stat(level, 'level'));
  };

  const start = (kind) => {
    const r = ROUNDS[kind];
    const other = kind === 'case' ? 'gap' : 'case'; // after the daily challenge, offer round 1
    const items = r.make(data, { level, weak, seed: `${today}#${Date.now()}` }).map((x, i) => ({ ...x, _i: i }));
    runQuiz(body, items, {
      label: 'Frage',
      onFinish: ({ score, right, total, wrong }) => {
        weak = prep.updateWeak(weak, items.map((x, i) => ({ prep: x._prep, ok: !wrong.includes(i) })));
        progress.recordPrep(today, kind === 'daily' ? score : null, weak);
        const missed = [...new Set(wrong.map((i) => items[i]._prep))];
        const misses = prep.topMisses(weak);
        body.replaceChildren(h('div.card', h(`div.result${score >= progress.passMark() ? '' : '.fail'}`,
          h('div.score', `${Math.round(score * 100)}%`),
          h('p', `${right} of ${total} right.`, missed.length ? ` Missed: ${missed.join(', ')}.` : ' Perfekt! 🎉'),
          kind === 'daily' ? h('p.muted', `Challenge streak: ${progress.prepStreak()} 🔥`) : null,
          h('p.muted', misses.length ? `Weak spots: ${misses.map(([p, n]) => (n > 1 ? `${p} ×${n}` : p)).join(', ')}` : 'No weak spots left.'),
          h('div.speak-row', { style: 'justify-content:center' },
            h('button.btn', { type: 'button', onclick: () => start(kind) }, '↻ Play again'),
            h('button.btn', { type: 'button', onclick: () => start(other) }, ROUNDS[other].label),
            h('button.btn', { type: 'button', onclick: overview }, 'Übersicht'),
            h('a.btn.primary', { href: '#/road' }, 'Zur Straße →')))));
      },
    });
  };

  overview();
}

const stat = (value, label) => h('div.stat', h('b', String(value)), h('span', label));
