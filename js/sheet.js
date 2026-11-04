// Cheat sheet for one level (#/sheet/<LEVEL>): the level's top rules, then per lesson its main table, tip and one example.
// Built from the lesson files, so it stays in step with them; only the top rules (roadmap.json "rules") are written by hand.
import { h, md, getRoadmap, getJSON, lessonURL } from './util.js';

const table = (t) => h('div.table-wrap', h('table.grid',
  h('thead', h('tr', t.head.map((c) => h('th', { html: md(c) })))),
  h('tbody', t.rows.map((r) => h('tr', r.map((c) => h('td', { html: md(c) })))))));

function block(m, lesson) {
  const sec = lesson.learn.find((s) => s.table) || lesson.learn[0];
  const ex = sec.examples?.[0] || lesson.learn.find((s) => s.examples?.length)?.examples[0];
  return h('section.card.sheet-block', { id: `sheet-${m.id}` },
    h('h2', m.title), h('p.muted.sheet-concept', m.concept),
    sec.table ? table(sec.table) : h('p', { html: md(sec.text) }),
    lesson.tip ? h('p.sheet-tip', '💡 ', h('span', { html: md(lesson.tip) })) : null,
    ex ? h('p.sheet-ex', h('span.de', ex.de), ' ', h('span.muted', `· ${ex.en}`)) : null,
    h('a.sheet-more', { href: `#/lesson/${m.id}/learn` }, 'Full lesson →'));
}

export async function renderSheet(view, level) {
  const road = await getRoadmap();
  const levels = road.levels.filter((l) => l.milestones?.length);
  const lv = levels.find((l) => l.id === level);
  if (!lv) throw new Error(`No cheat sheet for ${level}`);
  document.title = `${level} Cheat sheet · Deutschweg`;
  const lessons = await Promise.all(lv.milestones.map((m) => getJSON(lessonURL(level, m.id)).catch(() => null)));
  const ready = lv.milestones.map((m, i) => [m, lessons[i]]).filter(([, l]) => l);
  view.replaceChildren(h('article.lesson.sheet-page',
    h('header.lesson-head',
      h('a.back', { href: '#/road' }, '← Zurück zur Straße'),
      h('h1', `📄 ${level} Cheat sheet`),
      h('p', `${lv.name} · ${lv.goal}`),
      h('nav.sheet-levels', levels.map((l) => h(`a.chip${l.id === level ? '.accent' : ''}`, { href: `#/sheet/${l.id}` }, l.id)),
        h('button.btn.small', { type: 'button', onclick: () => window.print() }, '🖨 Print / PDF'))),
    lv.rules?.length ? h('section.card.sheet-rules', h('h2', `Top rules ${level}`),
      h('ol', lv.rules.map((r) => h('li', { html: md(r) })))) : null,
    h('nav.sheet-jump', ready.map(([m]) => h('a.chip', { href: `#/sheet/${level}`, onclick: (e) => {
      e.preventDefault(); document.getElementById(`sheet-${m.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } }, m.title))),
    h('div.sheet-grid', ready.map(([m, l]) => block(m, l))),
    h('div.speak-row', h('a.btn', { href: `#/checkpoint/${level}` }, `🎯 ${level} Checkpoint`), h('a.btn.primary', { href: '#/road' }, 'Zur Straße →'))));
}
