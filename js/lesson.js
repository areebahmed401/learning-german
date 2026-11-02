// Lesson view: Lernen · Mindmap · Üben · Sprechen, one step at a time. Words live on the Alltag road (place.js).
import { h, md, nounHTML, getLesson, getRoadmap, sayBtn, toast } from './util.js';
import { speak, listen, compare, canListen, canSpeak } from './speech.js';
import { runQuiz } from './exercises.js';
import { renderMindmap } from './mindmap.js';
import { openMindmapModal } from './mindmap-modal.js';
import * as progress from './progress.js';

export const STEPS = [
  ['learn', 'Lernen'], ['mindmap', 'Mindmap'], ['practice', 'Üben'], ['speak', 'Sprechen'],
];

export async function renderLesson(view, id, step = 'learn') {
  const [lesson, road] = await Promise.all([getLesson(id), getRoadmap()]);
  if (!STEPS.some(([s]) => s === step)) step = 'learn';
  progress.markStep(id, step);
  document.title = `${lesson.title} · Deutschweg`;

  const all = road.levels.flatMap((l) => l.milestones || []);
  const next = all[all.findIndex((m) => m.id === id) + 1];
  // skipping goes straight to the next lesson of this level; after the last one, back to the road (its checkpoint)
  const sameLevel = road.levels.find((l) => l.id === lesson.level)?.milestones?.some((m) => m.id === next?.id);
  const skipTo = sameLevel ? `#/lesson/${next.id}/learn` : '#/road';
  const idx = STEPS.findIndex(([s]) => s === step);
  const st = progress.lessonState(id) || { steps: {} };

  const head = h('header.lesson-head',
    h('a.back', { href: `#/road?at=${id}` }, '← Zurück zur Straße'),
    h('h1', lesson.title),
    h('p', lesson.concept, ' · ', h('span.chip.accent', lesson.level), ' ', h('span.chip', `⏱ ${lesson.minutes} min`)),
  );
  const tabs = h('nav.steps', { 'aria-label': 'Lesson steps' },
    STEPS.map(([s, label], i) => h('a', {
      href: `#/lesson/${id}/${s}`, class: [s === step && 'on', st.steps[s] && 'seen'].filter(Boolean).join(' '),
      'aria-current': s === step ? 'step' : null,
    }, `${i + 1} ${label}`)));

  const body = h('section');
  const prev = STEPS[idx - 1];
  const nxt = STEPS[idx + 1];
  const nav = h('div.step-nav',
    prev ? h('a.btn', { href: `#/lesson/${id}/${prev[0]}` }, `← ${prev[1]}`) : h('span'),
    nxt ? h('a.btn.primary', { href: `#/lesson/${id}/${nxt[0]}` }, `${nxt[1]} →`)
      : next ? h('a.btn.primary', { href: `#/road?at=${next.id}` }, 'Zur Straße: nächster Meilenstein →')
        : h('a.btn.primary', { href: '#/road' }, 'Zur Straße →'),
  );

  view.replaceChildren(h('article.lesson', head, tabs, body, nav));
  ({ learn, mindmap, practice, speak: speakStep })[step](body, lesson, skipTo);
}

function learn(body, lesson) {
  for (const sec of lesson.learn) {
    body.append(h('div.card',
      h('h2', sec.heading),
      h('p', { html: md(sec.text) }),
      sec.table ? h('div.table-wrap', h('table.grid',
        h('thead', h('tr', sec.table.head.map((c) => h('th', { html: md(c) })))),
        h('tbody', sec.table.rows.map((r) => h('tr', r.map((c) => h('td', { html: md(c) })))))),
      ) : null,
      sec.examples?.length ? h('ul.examples', sec.examples.map((e) =>
        h('li', canSpeak ? sayBtn(e.de, speak) : null, h('div', h('div.de', e.de), h('div.en', e.en))))) : null,
    ));
  }
  if (lesson.tip) body.append(h('div.card.tip', h('b', '💡 Merke: '), h('span', { html: md(lesson.tip) })));
  if (lesson.youtube) body.append(h('div.card.yt', '▶️', h('div',
    h('a', { href: lesson.youtube, target: '_blank', rel: 'noopener' }, 'Watch this topic in the Learn German course'),
    h('div.muted', { style: 'font-size:.85rem' }, 'Opens YouTube in a new tab.'))));
}

export function wordForms(w) {
  if (w.pos === 'noun') return w.plural && w.plural !== '-' ? `die ${w.plural}` : w.note || 'no plural';
  if (w.pos === 'verb') return [w.aux === 'sein' ? 'ist' : 'hat', w.p2].filter(Boolean).join(' ') + (w.sep ? ` · trennbar (${w.sep}-)` : '');
  return w.note || '';
}

/** One word: audio, the word (tap → translator), its forms and badges, the English. Also used by place.js. */
export function wordRow(w, extra = null) {
  return h('li',
    canSpeak ? sayBtn(w.pos === 'noun' && w.article ? `${w.article} ${w.de}` : w.de, speak) : h('span'),
    h('div',
      h('button.w', {
        type: 'button', title: 'See all forms in the translator', html: nounHTML(w),
        onclick: () => window.dispatchEvent(new CustomEvent('lg:lookup', { detail: { word: w.de } })),
      }),
      h('span.forms', wordForms(w), extra, w.goethe ? h('span.goethe', { title: `On the official Goethe-Zertifikat ${w.goethe} word list` }, `Goethe ${w.goethe}`) : null)),
    h('span.en', w.en));
}

function mindmap(body, lesson) {
  const wrap = h('div.mindmap-wrap');
  body.append(
    h('div.words-tools',
      h('p.muted', { style: 'margin:0;flex:1' }, 'Say each branch out loud. Tap a branch to fold it, then try to recall what was inside.'),
      h('button.btn.small', { type: 'button', onclick: () => openMindmapModal(lesson) }, '⤢ Expand')),
    wrap);
  requestAnimationFrame(() => renderMindmap(wrap, lesson.mindmap));
}

function practice(body, lesson, skipTo) {
  const items = lesson.exercises.map((e, i) => ({ ...e, _i: i }));
  const start = (subset, label) => runQuiz(body, subset, {
    label,
    onFinish: ({ score, wrong, right, total }) => {
      // a mistakes-only review keeps the full-lesson score; it only shrinks the mistake list
      if (subset.length === items.length) progress.recordPractice(lesson.id, score, wrong);
      else progress.setMistakes(lesson.id, wrong);
      const pass = score >= progress.PASS;
      body.replaceChildren(h('div.card', h(`div.result${pass ? '' : '.fail'}`,
        h('div.score', `${Math.round(score * 100)}%`),
        h('p', `${right} of ${total} right. `, pass
          ? (subset.length === items.length ? 'Milestone reached! ✓' : 'Nice review!')
          : `You need ${Math.round(progress.PASS * 100)}% to complete this milestone.`),
        h('div.speak-row', { style: 'justify-content:center' },
          wrong.length ? h('button.btn', { onclick: () => start(items.filter((x) => wrong.includes(x._i)), 'Fehler') }, `↻ Review ${wrong.length} mistake${wrong.length > 1 ? 's' : ''}`) : null,
          h('button.btn', { onclick: () => start(items, 'Übung') }, '↺ Try all again'),
          h('a.btn.primary', { href: `#/lesson/${lesson.id}/speak` }, 'Sprechen →')),
      )));
    },
  });

  const st = progress.lessonState(lesson.id);
  const mistakes = st?.mistakes?.length ? items.filter((x) => st.mistakes.includes(x._i)) : [];
  body.append(h('div.card',
    h('h2', `${items.length} exercises`),
    h('p.muted', `One at a time, with an explanation after each answer. Score ${Math.round(progress.PASS * 100)}% or more to complete this milestone.`,
      st?.best ? ` Your best so far: ${Math.round(st.best * 100)}%.` : ''),
    h('div.speak-row',
      h('button.btn.primary', { onclick: () => start(items, 'Übung') }, '▶ Start'),
      mistakes.length ? h('button.btn', { onclick: () => start(mistakes, 'Fehler') }, `↻ Review my ${mistakes.length} mistakes`) : null),
  ), skipCard(lesson, skipTo, () => { body.replaceChildren(); practice(body, lesson, skipTo); }));
}

/** "I know this": mark the stop done without the exercises and go on. The level checkpoint stays required. */
function skipCard(lesson, skipTo, redraw) {
  const st = progress.lessonState(lesson.id);
  if (st?.skipped) {
    return h('div.card.skip-card',
      h('p', h('b', '⏭ You skipped this stop.'), ' Pass the exercises to complete it properly.'),
      h('button.btn.small', { type: 'button', onclick: () => { progress.undoSkip(lesson.id); redraw(); } }, 'Undo skip'));
  }
  if (st?.done) return null;
  return h('div.card.skip-card',
    h('p', h('b', 'Already know this?'), ` Skip the exercises and go on. You still need to pass the ${lesson.level} checkpoint to finish the level.`),
    h('button.btn', { type: 'button', onclick: () => {
      progress.skipLesson(lesson.id);
      toast(`⏭ ${lesson.title} skipped`);
      location.hash = skipTo;
    } }, '⏭ I know this, skip'));
}

function heardLine(target, said) {
  const { words, score } = compare(target, said);
  return h('div.heard',
    h('div.muted', `Heard: “${said || '…nothing'}”`),
    h('div', words.map((x) => [h(`span.${x.hit ? 'hit' : 'miss'}`, x.w), ' '])),
    h('div', score >= 0.85 ? '✓ Sehr gut!' : score >= 0.5 ? 'Almost: try the red words again, slowly.' : 'Listen again (🐢), then repeat in small chunks.'));
}

function micButton(target, out) {
  const b = h('button.btn.small.mic', { type: 'button' }, '🎙 Say it');
  b.onclick = async () => {
    b.classList.add('live');
    b.textContent = '● Listening…';
    try {
      const said = await listen();
      progress.recordSpeak();
      out.replaceChildren(target ? heardLine(target, said) : h('div.heard', h('div.muted', 'You said:'), h('div', `“${said || '…nothing heard'}”`)));
    } catch (e) {
      out.replaceChildren(h('div.heard.muted', e.message === 'not-allowed' ? 'Microphone blocked. Allow it in the browser to use this.' : `Mic error: ${e.message}`));
    } finally {
      b.classList.remove('live');
      b.textContent = '🎙 Say it';
    }
  };
  return b;
}

function saidIt() {
  return h('button.btn.small', { type: 'button', onclick: (e) => { progress.recordSpeak(); e.target.textContent = '✓ Gesagt'; e.target.disabled = true; } }, '✓ I said it');
}

export function speakStep(body, lesson) {
  if (!canListen) body.append(h('div.notice', 'Mic transcription works in Chrome and Edge. Here you can still listen and repeat out loud. Tap “I said it” to count it.'));
  body.append(h('div.card',
    h('h2', '1 · Hören & Nachsprechen'),
    h('p.muted', 'Listen, then say the sentence out loud. Copy the rhythm, not just the words.'),
    lesson.speak.shadow.map((s) => {
      const out = h('div');
      return h('div.card.shadow-card',
        h('div.de', s.de), h('div.en', s.en),
        h('div.speak-row',
          h('button.btn.small', { type: 'button', onclick: () => speak(s.de) }, '🔊 Hören'),
          h('button.btn.small', { type: 'button', onclick: () => speak(s.de, { slow: true }) }, '🐢 Langsam'),
          canListen ? micButton(s.de, out) : saidIt()),
        out);
    })));

  body.append(h('div.card',
    h('h2', '2 · Antworte frei'),
    h('p.muted', 'Answer out loud in your own words first. Then compare with the model and shadow it.'),
    lesson.speak.prompts.map((p) => {
      const out = h('div');
      const modelOut = h('div');
      const model = h('div.model', { hidden: true },
        h('div', h('b', 'Model: '), p.model),
        h('div.speak-row', { style: 'margin-top:6px' },
          h('button.btn.small', { type: 'button', onclick: () => speak(p.model) }, '🔊 Hören'),
          canListen ? micButton(p.model, modelOut) : null),
        modelOut);
      return h('div.card.shadow-card',
        h('div.de', p.q), h('div.en', p.qEn, p.hint ? h('span', { html: ` · Tipp: <em>${md(p.hint)}</em>` }) : null),
        h('div.speak-row',
          h('button.btn.small', { type: 'button', onclick: () => speak(p.q) }, '🔊 Frage'),
          canListen ? micButton(null, out) : saidIt(),
          h('button.btn.small', { type: 'button', onclick: (e) => { model.hidden = !model.hidden; e.target.textContent = model.hidden ? '💬 Show model' : '💬 Hide model'; } }, '💬 Show model')),
        out, model);
    })));
}
