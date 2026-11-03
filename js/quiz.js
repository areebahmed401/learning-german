// ⚡ Tagesquiz: a few quick grammar questions every day from your level and below.
// Questions you get wrong come back in later quizzes until you answer them right (see daily.js).
import { h, getRoadmap, getJSON, lessonURL } from './util.js';
import { runQuiz } from './exercises.js';
import * as progress from './progress.js';
import * as daily from './daily.js';
import * as adapt from './adapt.js';
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
  const { quizSize, adaptive } = progress.settings();
  const today = day();
  const levels = road.levels.filter((l) => l.milestones?.length).map((l) => l.id);
  const nextLevel = levels[levels.indexOf(level) + 1] ?? null;
  const q = progress.quizState();
  const plan = adaptive ? adapt.quizPlan({ answers: q.answers, level, nextLevel, size: quizSize }) : null;
  // adaptive mode also loads the next level: for stretch questions and for retrying the ones you missed there
  const lessons = await lessonsUpTo(road, adaptive && nextLevel ? nextLevel : level);
  const doneToday = q.days[today] != null;

  const body = h('section');
  view.replaceChildren(h('article.lesson',
    h('header.lesson-head', h('a.back', { href: '#/road' }, '← Zurück zur Straße'), h('h1', '⚡ Tagesquiz'),
      h('p', `${quizSize} quick grammar questions from ${level} and below. Questions you miss come back until you get them right.`)),
    plan ? h('div.adapt-note', h('p', planNote(plan, level))) : null,
    h('div.stats.cards-stats',
      stat(doneToday ? `${Math.round(q.days[today] * 100)}%` : '–', 'today'),
      stat(`${progress.quizStreak()} 🔥`, 'day streak'),
      stat(q.mistakes.length, 'to fix'),
      stat(level, 'level')),
    body));

  const start = (r) => {
    const items = daily.pickDaily({ lessons, level, mistakes: q.mistakes, today, size: quizSize, round: r, plan })
      .map((item, i) => ({ ...item, _i: i }));
    runQuiz(body, items, {
      label: 'Frage',
      onFinish: ({ score, right, total, wrong }) => {
        const wrongRefs = wrong.map((i) => items[i]._ref);
        const answers = items.map((x, i) => ({ l: x._level, t: x.type, ok: !wrong.includes(i) }));
        progress.recordQuiz(today, score, daily.updateMistakes(q.mistakes, items.map((x) => x._ref), wrongRefs), answers);
        body.replaceChildren(h('div.card', h(`div.result${score >= progress.passMark() ? '' : '.fail'}`,
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

const TYPE_NAMES = { mc: 'multiple choice', gap: 'fill the gap', article: 'der/die/das', order: 'word order', translate: 'translation' };

/** One line on how today's quiz adapts. */
function planNote(plan, level) {
  const recent = plan.answered ? ` (${Math.round(plan.acc * 100)}% right in your last ${plan.answered} ${level} answers)` : '';
  const focus = plan.weakest ? ` More ${TYPE_NAMES[plan.weakest] || plan.weakest} questions, since you miss those most.` : '';
  if (plan.mode === 'stretch') return `📈 Stretch: ${plan.stretch} questions from ${plan.stretchLevel} today${recent}.${focus}`;
  if (plan.mode === 'ease') return `🧘 Easing off: more review and earlier mistakes today${recent}.${focus}`;
  if (plan.answered < adapt.QUIZ_MIN_ANSWERS) return `📈 Adaptive: after ${adapt.QUIZ_MIN_ANSWERS} answers at ${level}, the quiz gets harder or easier to match you.${focus}`;
  return `📈 Adaptive: steady today${recent}. At ${Math.round(adapt.STRETCH_AT * 100)}% you get questions from the next level.${focus}`;
}

const stat = (value, label) => h('div.stat', h('b', String(value)), h('span', label));
