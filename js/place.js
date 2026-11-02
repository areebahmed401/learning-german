// Place view (Alltag road): Wörter · Sätze · Üben · Sprechen. Words are grouped by the spot where you meet them.
import { h, getAlltag, getPlace, placeWords, sayBtn, toast } from './util.js';
import { speak, canSpeak } from './speech.js';
import { runQuiz } from './exercises.js';
import { openMindmapModal } from './mindmap-modal.js';
import { wordRow, speakStep } from './lesson.js';
import * as progress from './progress.js';
import * as anki from './anki.js';

export const PLACE_STEPS = [['words', 'Wörter'], ['phrases', 'Sätze'], ['practice', 'Üben'], ['speak', 'Sprechen']];
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

/** The place as a mind map: place → spots → a few words each (for the road's hover card and "⤢ Map"). */
export function placeMap(place, perArea = 6) {
  return {
    label: `${place.icon} ${place.title}`,
    children: place.areas.map((a) => ({
      label: a.name,
      note: a.en,
      children: a.words.filter((w) => w.pos !== 'phrase').slice(0, perArea)
        .map((w) => ({ label: w.pos === 'noun' && w.article ? `${w.article} ${w.de}` : w.de, note: w.en })),
    })),
  };
}

/** A place dressed as a lesson, for the shared mind-map pop-up. */
export const placeAsLesson = (place) => ({
  title: `${place.icon} ${place.title}`, concept: place.en, wordlist: `${placeWords(place).length} words`, mindmap: placeMap(place),
});

export async function renderPlace(view, id, step = 'words') {
  const [place, alltag] = await Promise.all([getPlace(id), getAlltag()]);
  if (!PLACE_STEPS.some(([s]) => s === step)) step = 'words';
  progress.markPlaceStep(id, step);
  document.title = `${place.title} · Deutschweg`;

  const stops = alltag.chapters.flatMap((c) => c.stops).filter((s) => !s.soon);
  const next = stops[stops.findIndex((s) => s.id === id) + 1];
  const idx = PLACE_STEPS.findIndex(([s]) => s === step);
  const st = progress.placeState(id) || { steps: {} };
  const all = placeWords(place);

  const head = h('header.lesson-head',
    h('a.back', { href: `#/alltag?at=${id}` }, '← Zurück zur Alltag-Straße'),
    h('h1', `${place.icon} ${place.title}`),
    h('p', place.intro, ' ', h('span.chip', `🗂 ${all.length} words`), ' ', h('span.chip', `💬 ${place.phrases.length} Sätze`)));
  const tabs = h('nav.steps', { 'aria-label': 'Place steps' },
    PLACE_STEPS.map(([s, label], i) => h('a', {
      href: `#/place/${id}/${s}`, class: [s === step && 'on', st.steps[s] && 'seen'].filter(Boolean).join(' '),
      'aria-current': s === step ? 'step' : null,
    }, `${i + 1} ${label}`)));

  const body = h('section');
  const prev = PLACE_STEPS[idx - 1];
  const nxt = PLACE_STEPS[idx + 1];
  const nav = h('div.step-nav',
    prev ? h('a.btn', { href: `#/place/${id}/${prev[0]}` }, `← ${prev[1]}`) : h('span'),
    nxt ? h('a.btn.primary', { href: `#/place/${id}/${nxt[0]}` }, `${nxt[1]} →`)
      : next ? h('a.btn.primary', { href: `#/alltag?at=${next.id}` }, `Weiter: ${next.icon} ${next.title} →`)
        : h('a.btn.primary', { href: '#/alltag' }, 'Zur Alltag-Straße →'));

  view.replaceChildren(h('article.lesson.place', head, tabs, body, nav));
  ({ words, phrases, practice, speak: speakStep })[step](body, place);
}

/** Wörter: one card per spot. Filter by level; hide the English to test yourself. */
function words(body, place) {
  const all = placeWords(place);
  const present = LEVELS.filter((l) => all.some((w) => w.level === l));
  let upTo = 'all';
  const areas = h('div');
  const draw = () => {
    const max = upTo === 'all' ? LEVELS.length : LEVELS.indexOf(upTo) + 1;
    const keep = (w) => LEVELS.indexOf(w.level) < max || !w.level;
    areas.replaceChildren(...place.areas.map((a) => {
      const list = a.words.filter(keep);
      if (!list.length) return null;
      return h('div.card.area',
        h('h2', a.name, ' ', h('small.muted', a.en)),
        h('ul.wordlist', list.map((w) => wordRow(w, w.level && !w.goethe ? h('span.chip.lvl', w.level) : null)))); // a Goethe badge already names the level
    }).filter(Boolean));
  };
  const levelBtn = (l, label) => h(`button.btn.small${upTo === l ? '.primary' : ''}`, {
    type: 'button', 'aria-pressed': String(upTo === l),
    onclick: (e) => {
      upTo = l;
      e.target.parentElement.querySelectorAll('button').forEach((b) => { b.classList.toggle('primary', b === e.target); b.setAttribute('aria-pressed', String(b === e.target)); });
      draw();
    },
  }, label);
  const wrap = h('div.place-words');
  const hide = h('button.btn.small', {
    type: 'button', 'aria-pressed': 'false',
    onclick: () => {
      const on = wrap.classList.toggle('hide-en');
      hide.setAttribute('aria-pressed', on);
      hide.textContent = on ? '👁 Show English' : '🙈 Hide English';
    },
  }, '🙈 Hide English');
  wrap.append(
    h('div.card.words-tools',
      h('div.cards-scope', levelBtn('all', 'All'), present.map((l) => levelBtn(l, `up to ${l}`))),
      h('span.spacer'),
      h('button.btn.small', { type: 'button', onclick: () => openMindmapModal(placeAsLesson(place)) }, '🧠 Map'),
      hide,
      h('button.btn.small', {
        type: 'button', title: 'Download a file to import into Anki (File → Import)',
        onclick: () => { anki.download(anki.placeRows(place, all), `deutschweg-${place.id}.txt`); toast('Anki file saved: import it in Anki via File → Import'); },
      }, '⬇ Anki')),
    h('p.muted', { style: 'font-size:.85rem;margin:0 0 8px' }, 'Grouped by where you meet them. Tap a word to see all its forms in the translator.'),
    areas);
  draw();
  body.append(wrap);
}

/** Sätze: what you hear (staff) and what you say there. */
function phrases(body, place) {
  const row = (p) => h('li',
    canSpeak ? sayBtn(p.de, speak) : h('span'),
    h('div', h('div.de', p.de), h('div.en', p.en)),
    h('span.chip', p.who === 'staff' ? '👂 you hear' : '🗣 you say'));
  const hear = place.phrases.filter((p) => p.who === 'staff');
  const say = place.phrases.filter((p) => p.who !== 'staff');
  body.append(...[
    say.length ? h('div.card', h('h2', '🗣 What you say'), h('ul.examples.phrases', say.map(row))) : null,
    hear.length ? h('div.card', h('h2', '👂 What you hear'), h('ul.examples.phrases', hear.map(row))) : null,
  ].filter(Boolean));
}

function practice(body, place) {
  const items = place.exercises.map((e, i) => ({ ...e, _i: i }));
  const start = (subset, label) => runQuiz(body, subset, {
    label,
    onFinish: ({ score, wrong, right, total }) => {
      if (subset.length === items.length) progress.recordPlacePractice(place.id, score, wrong);
      else progress.setPlaceMistakes(place.id, wrong);
      const pass = score >= progress.PASS;
      body.replaceChildren(h('div.card', h(`div.result${pass ? '' : '.fail'}`,
        h('div.score', `${Math.round(score * 100)}%`),
        h('p', `${right} of ${total} right. `, pass
          ? (subset.length === items.length ? `${place.title}: geschafft! ✓` : 'Nice review!')
          : `You need ${Math.round(progress.PASS * 100)}% to complete this place.`),
        h('div.speak-row', { style: 'justify-content:center' },
          wrong.length ? h('button.btn', { onclick: () => start(items.filter((x) => wrong.includes(x._i)), 'Fehler') }, `↻ Review ${wrong.length} mistake${wrong.length > 1 ? 's' : ''}`) : null,
          h('button.btn', { onclick: () => start(items, 'Übung') }, '↺ Try all again'),
          h('a.btn.primary', { href: `#/place/${place.id}/speak` }, 'Sprechen →')))));
    },
  });

  const st = progress.placeState(place.id);
  const mistakes = st?.mistakes?.length ? items.filter((x) => st.mistakes.includes(x._i)) : [];
  body.append(h('div.card',
    h('h2', `${items.length} exercises`),
    h('p.muted', `Words and sentences from ${place.title}. Score ${Math.round(progress.PASS * 100)}% or more to complete this place.`,
      st?.best ? ` Your best so far: ${Math.round(st.best * 100)}%.` : ''),
    h('div.speak-row',
      h('button.btn.primary', { onclick: () => start(items, 'Übung') }, '▶ Start'),
      mistakes.length ? h('button.btn', { onclick: () => start(mistakes, 'Fehler') }, `↻ Review my ${mistakes.length} mistakes`) : null)));
}
