// ⚡ Tagesquiz: a few quick grammar questions every day from your level and below.
// Questions you get wrong come back in later quizzes until you answer them right (see daily.js).
import { h, getRoadmap, getJSON, lessonURL } from './util.js';
import { runQuiz } from './exercises.js';
import * as progress from './progress.js';
import * as daily from './daily.js';
import { day } from './srs.js';

/** Lessons of your level and every level below it. */
async function lessonsUpTo(road, level) {
  const levels = road.levels.slice(0, road.levels.findIndex((l) => l.id === level) + 1);
  const all = await Promise.all(levels.flatMap((lv) => (lv.milestones || [])
    .map((m) => getJSON(lessonURL(lv.id, m.id)).catch(() => null))));
  return all.filter(Boolean);
}

export async function renderQuiz(view, round = 0) {
  document.title = 'Tagesquiz · Deutschweg';
  const road = await getRoadmap();
  const level = progress.currentLevel(road);
  const { quizSize } = progress.settings();
  const today = day();
  const lessons = await lessonsUpTo(road, level);
  const q = progress.quizState();
  const doneToday = q.days[today] != null;

  const body = h('section');
  view.replaceChildren(h('article.lesson',
    h('header.lesson-head', h('a.back', { href: '#/road' }, '← Zurück zur Straße'), h('h1', '⚡ Tagesquiz'),
      h('p', `${quizSize} quick grammar questions from ${level} and below. Questions you miss come back until you get them right.`)),
    h('div.stats.cards-stats',
      stat(doneToday ? `${Math.round(q.days[today] * 100)}%` : '–', 'today'),
      stat(`${progress.quizStreak()} 🔥`, 'day streak'),
      stat(q.mistakes.length, 'to fix'),
      stat(level, 'level')),
    body));

  const start = (r) => {
    const items = daily.pickDaily({ lessons, level, mistakes: q.mistakes, today, size: quizSize, round: r })
      .map((item, i) => ({ ...item, _i: i }));
    runQuiz(body, items, {
      label: 'Frage',
      onFinish: ({ score, right, total, wrong }) => {
        const wrongRefs = wrong.map((i) => items[i]._ref);
        progress.recordQuiz(today, score, daily.updateMistakes(q.mistakes, items.map((x) => x._ref), wrongRefs));
        body.replaceChildren(h('div.card', h(`div.result${score >= progress.PASS ? '' : '.fail'}`,
          h('div.score', `${Math.round(score * 100)}%`),
          h('p', `${right} of ${total} right.`, wrongRefs.length ? ` The ${wrongRefs.length} you missed will come back in your next quizzes.` : ' Perfekt! 🎉'),
          h('p.muted', `Quiz streak: ${progress.quizStreak()} 🔥`),
          h('div.speak-row', { style: 'justify-content:center' },
            h('button.btn', { type: 'button', onclick: () => renderQuiz(view, r + 1).then(() => view.querySelector('.quiz-start')?.click()) }, '↻ One more round'),
            h('a.btn.primary', { href: '#/road' }, 'Zur Straße →')))));
      },
    });
  };

  if (!lessons.length) {
    body.append(h('div.card', h('p', 'No lessons found for your level yet.')));
  } else if (doneToday && round === 0) {
    body.append(h('div.card.cards-done', h('div.result', h('div.score', '✓'),
      h('p', `Today's quiz is done: ${Math.round(q.days[today] * 100)}%. See you tomorrow!`),
      h('button.btn.quiz-start', { type: 'button', onclick: () => start(1 + Math.floor(Math.random() * 1e6)) }, '↻ One more round'))));
  } else {
    body.append(h('div.card.cards-start',
      h('p', h('b', `${quizSize} questions`), q.mistakes.length ? `, including some you missed before.` : '.'),
      h('button.btn.primary.quiz-start', { type: 'button', onclick: () => start(round) }, 'Start')));
  }
}

const stat = (value, label) => h('div.stat', h('b', String(value)), h('span', label));
