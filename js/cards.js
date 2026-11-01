// Karten: daily flashcards. Words you miss come back in the same session until you know them;
// words you know come back later (Leitner boxes, see srs.js).
import { h, getRoadmap, getJSON, lessonURL, nounHTML, shuffle, sayBtn } from './util.js';
import { speak, canSpeak } from './speech.js';
import { wordForms } from './lesson.js';
import * as progress from './progress.js';
import * as srs from './srs.js';

/**
 * Words for a deck, easiest level first:
 * 'level' = every lesson word and Goethe-tagged dictionary word up to your level,
 * 'mine' = the lessons you've opened, or a level id = that level only.
 */
async function wordPool(deck, road, myLevel) {
  const order = road.levels.map((l) => l.id);
  const upTo = order.slice(0, order.indexOf(myLevel) + 1);
  const wanted = deck === 'level' ? upTo : deck === 'mine' ? order : [deck];
  const opened = new Set(progress.openedLessons());
  const ids = road.levels.filter((lv) => wanted.includes(lv.id)).flatMap((lv) => (lv.milestones || [])
    .filter((m) => deck !== 'mine' || opened.has(m.id)).map((m) => [lv.id, m.id]));
  const lessons = await Promise.all(ids.map(([lv, id]) => getJSON(lessonURL(lv, id)).catch(() => null)));
  const words = lessons.filter(Boolean).flatMap((l) => l.words.map((w) => ({ ...w, level: l.level })));
  if (deck !== 'mine') {
    // the translator's dictionary words, by Goethe level (untagged ones count as B2)
    const core = await getJSON('data/dictionary/core.json').catch(() => []);
    for (const w of core) {
      const lv = w.goethe || 'B2';
      if (wanted.includes(lv)) words.push({ ...w, level: lv });
    }
  }
  return words.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level)); // stable: lessons stay first in a level
}

let keyHandler = null;

/** extra: new words allowed beyond today's limit ("+10 more"). */
export async function renderCards(view, extra = 0) {
  document.title = 'Karten · Deutschweg';
  const prefs = progress.settings();
  const road = await getRoadmap();
  const myLevel = progress.currentLevel(road);
  const levels = road.levels.filter((l) => l.milestones?.length).map((l) => l.id);
  const words = await wordPool(prefs.deck, road, myLevel);
  const today = srs.day();
  const queue = srs.buildQueue(words, progress.cards(), today, prefs.newCards + extra);
  const unseen = words.filter((w) => !progress.cards()[srs.cardKey(w)]).length;
  const due = queue.filter((w) => progress.cards()[srs.cardKey(w)]).length;

  const scopeBtn = (id, label) => h(`button.btn.small${prefs.deck === id ? '.primary' : ''}`, {
    type: 'button', 'aria-pressed': String(prefs.deck === id),
    onclick: () => { progress.setSettings({ deck: id }); renderCards(view); },
  }, label);
  const reverse = h('label.cards-switch', h('input', {
    type: 'checkbox', checked: prefs.reverse,
    onchange: (e) => progress.setSettings({ reverse: e.target.checked }),
  }), ' English → Deutsch');

  const stage = h('section');
  view.replaceChildren(h('article.lesson',
    h('header.lesson-head', h('a.back', { href: '#/road' }, '← Zurück zur Straße'), h('h1', '🃏 Karten'),
      h('p', 'A few minutes every day. Words you miss come back until you get them right.')),
    h('div.stats.cards-stats',
      stat(due, 'due today'), stat(queue.length - due, 'new today'),
      stat(Object.values(progress.cards()).filter((c) => c.box >= 3).length, 'well known'),
      stat(`${progress.cardStreak()} 🔥`, 'day streak')),
    h('div.cards-tools', h('div.cards-scope', scopeBtn('level', `My level (${myLevel})`), scopeBtn('mine', 'My lessons'), levels.map((l) => scopeBtn(l, l))), reverse),
    stage,
    hardList()));

  if (!words.length) {
    stage.append(h('div.card', h('p', 'No words yet. Open a lesson on the road, or pick a level above.'),
      h('a.btn.primary', { href: '#/road' }, 'Zur Straße →')));
  } else if (!queue.length) {
    stage.append(h('div.card.cards-done', h('div.result', h('div.score', '✓'),
      h('p', 'Nothing due right now. Come back tomorrow!'),
      h('p.muted', `${words.length} words in this deck.`),
      unseen ? h('button.btn', { type: 'button', onclick: () => renderCards(view, extra + 10) }, `+10 more new words (${unseen} left)`) : null)));
  } else {
    stage.append(h('div.card.cards-start',
      h('p', h('b', `${queue.length} cards`), ` ready: ${due} to review, ${queue.length - due} new. `,
        h('span.muted', `${words.length} words in this deck · ${prefs.newCards} new a day (⚙ Settings)`)),
      h('button.btn.primary', { type: 'button', onclick: () => run(stage, shuffle(queue.slice(0, due))
        .concat(queue.slice(due)), reverse.querySelector('input').checked, view) }, 'Start')));
  }
}

const stat = (value, label) => h('div.stat', h('b', String(value)), h('span', label));

function hardList() {
  const hard = srs.hardest(progress.cards());
  if (!hard.length) return null;
  return h('details.card.cards-hard',
    h('summary', h('b', 'Schwierige Wörter'), h('span.muted', ` · the words you miss most`)),
    h('ul', hard.map(([k, c]) => h('li', h('span', k), h('span.muted', `✗ ${c.fails}`)))));
}

/** One session: show cards until the queue is empty; a missed card goes back into the queue. */
function run(stage, queue, reverse, view) {
  const today = srs.day();
  const autoplay = canSpeak && progress.settings().autoplay;
  const missed = new Set();
  let knew = 0;
  let flipped = false;

  const card = h('div.flash', { role: 'button', tabindex: '0', 'aria-live': 'polite' });
  const counter = h('p.muted.flash-count');
  const no = h('button.btn.flash-no', { type: 'button', onclick: () => grade(false) }, '✗ Nochmal');
  const yes = h('button.btn.primary.flash-yes', { type: 'button', onclick: () => grade(true) }, '✓ Gewusst');
  const flipBtn = h('button.btn.primary', { type: 'button', onclick: () => flip() }, 'Umdrehen');
  const actions = h('div.flash-actions');
  stage.replaceChildren(h('div.card.flash-wrap', counter, card, actions, h('p.muted.flash-keys', 'Space: flip · 1: Nochmal · 2: Gewusst')));
  card.onclick = (e) => { if (!e.target.closest('.say')) flip(); };

  const say = (w) => (w.pos === 'noun' && w.article ? `${w.article} ${w.de}` : w.de);
  const german = (w) => h('div.flash-word', h('div.flash-de', { html: nounHTML(w) }), canSpeak ? sayBtn(say(w), speak) : null);
  const english = (w) => h('div.flash-en', w.en);

  function show() {
    const w = queue[0];
    flipped = false;
    counter.textContent = `${queue.length} left · ✓ ${knew} · ✗ ${missed.size}` + (missed.has(srs.cardKey(w)) ? ' · again' : '');
    card.className = 'flash';
    card.replaceChildren(h('div.flash-side', reverse ? english(w) : german(w)), h('div.flash-hint.muted', 'tap to flip'));
    if (!reverse && autoplay) speak(say(w));
    actions.replaceChildren(flipBtn);
    flipBtn.focus();
  }

  function flip() {
    if (flipped) return;
    flipped = true;
    const w = queue[0];
    const forms = wordForms(w);
    card.className = 'flash flipped';
    // the question stays on top (faded), the answer comes in below it
    card.replaceChildren(h('div.flash-side', reverse ? english(w) : german(w)),
      h('div.flash-back', reverse ? german(w) : english(w), forms ? h('div.flash-forms', forms) : null, h('span.chip', w.level)));
    if (reverse && autoplay) speak(say(w));
    actions.replaceChildren(no, yes);
    yes.focus();
  }

  function grade(ok) {
    if (!flipped) return;
    const w = queue.shift();
    const k = srs.cardKey(w);
    progress.setCard(k, srs.answer(progress.cards()[k], ok, today), today);
    if (ok) knew++;
    else { missed.add(k); queue = srs.requeue(queue, w); }
    if (queue.length) show();
    else finish();
  }

  function finish() {
    document.removeEventListener('keydown', keyHandler);
    stage.replaceChildren(h('div.card', h('div.result',
      h('div.score', '🎉'),
      h('p', h('b', 'Fertig für heute!'), ` ✓ ${knew} right` + (missed.size ? `, ${missed.size} word${missed.size > 1 ? 's' : ''} practised until right.` : ', no misses.')),
      h('p.muted', `Streak: ${progress.cardStreak()} 🔥`),
      h('div.speak-row', { style: 'justify-content:center' },
        h('button.btn', { type: 'button', onclick: () => renderCards(view) }, 'Overview'),
        h('a.btn.primary', { href: '#/road' }, 'Zur Straße →')))));
  }

  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = (e) => {
    if (!document.body.contains(card)) { document.removeEventListener('keydown', keyHandler); return; }
    if (e.target.matches?.('input, textarea')) return;
    if (e.key === ' ' || e.key === 'Enter') { if (!flipped) { e.preventDefault(); flip(); } }
    else if (e.key === '1') grade(false);
    else if (e.key === '2') grade(true);
  };
  document.addEventListener('keydown', keyHandler);
  show();
}
