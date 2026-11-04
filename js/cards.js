// Karten: daily flashcards. Words you miss come back in the same session until you know them;
// words you know come back later (Anki-style SM-2 or FSRS with four ratings, see srs.js).
// The home page has a statistics panel beside it (statsPanel).
import { h, getRoadmap, getJSON, getAlltag, getPlace, placeWords, nounHTML, shuffle, sayBtn } from './util.js';
import { speak, canSpeak } from './speech.js';
import { wordForms } from './lesson.js';
import * as progress from './progress.js';
import * as srs from './srs.js';
import * as adapt from './adapt.js';

/**
 * Words for a deck, easiest level first:
 * 'level' = every place word and Goethe-tagged dictionary word up to your level,
 * 'mine' = the places you've opened, 'place:<id>' = one place, or a level id = that level only,
 * 'all' = every word the app can put in a deck (for the statistics panel).
 */
async function wordPool(deck, road, myLevel) {
  const order = road.levels.map((l) => l.id);
  const upTo = order.slice(0, order.indexOf(myLevel) + 1);
  const onePlace = deck.startsWith('place:') ? deck.slice(6) : null;
  const wanted = deck === 'level' ? upTo : deck === 'mine' || deck === 'all' || onePlace ? order : [deck];
  const stops = (await getAlltag()).chapters.flatMap((c) => c.stops)
    .filter((s) => (onePlace ? s.id === onePlace : deck !== 'mine' || progress.placeState(s.id)));
  const places = await Promise.all(stops.map((s) => getPlace(s.id).catch(() => null)));
  const words = places.filter(Boolean).flatMap(placeWords).filter((w) => wanted.includes(w.level || 'B2'));
  if (deck !== 'mine' && !onePlace) {
    // the translator's dictionary words, by Goethe level (untagged ones count as B2)
    const core = await getJSON('data/dictionary/core.json').catch(() => []);
    for (const w of core) {
      const lv = w.goethe || 'B2';
      if (wanted.includes(lv)) words.push({ ...w, level: lv });
    }
  }
  // a word met in several places (or also in the dictionary) is one card; the first copy wins
  const seen = new Set();
  const unique = words.filter((w) => { const k = srs.cardKey(w); return !seen.has(k) && seen.add(k); });
  return unique.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level)); // stable: places stay first in a level
}

let keyHandler = null;

/** start: go straight into the session (after "+ more"). */
export async function renderCards(view, { start = false } = {}) {
  document.title = 'Karten · Deutschweg';
  const prefs = progress.settings();
  const road = await getRoadmap();
  const myLevel = progress.currentLevel(road);
  const levels = road.levels.filter((l) => l.milestones?.length).map((l) => l.id);
  const [deckWords, allWords] = await Promise.all([wordPool(prefs.deck, road, myLevel), wordPool('all', road, myLevel)]);
  let words = deckWords;
  const today = srs.day();
  const { limit, notes } = prefs.adaptive ? await adaptDeck() : { limit: prefs.newCards, notes: [] };
  const queue = srs.buildQueue(words, progress.cards(), today, limit + progress.extraCards(today));
  const unseen = words.filter((w) => !progress.cards()[srs.cardKey(w)]).length;
  const due = queue.filter((w) => progress.cards()[srs.cardKey(w)]).length;

  const stops = (await getAlltag()).chapters.flatMap((c) => c.stops);
  const placePick = h('select.set-select.cards-place', {
    'aria-label': 'One place',
    onchange: (e) => { progress.setSettings({ deck: e.target.value || 'level' }); renderCards(view); },
  }, h('option', { value: '' }, '🗺 One place…'),
  stops.map((s) => h('option', { value: `place:${s.id}`, selected: prefs.deck === `place:${s.id}` }, `${s.icon} ${s.title}`)));
  const scopeBtn = (id, label) => h(`button.btn.small${prefs.deck === id ? '.primary' : ''}`, {
    type: 'button', 'aria-pressed': String(prefs.deck === id),
    onclick: () => { progress.setSettings({ deck: id }); renderCards(view); },
  }, label);
  const reverse = h('label.cards-switch', h('input', {
    type: 'checkbox', checked: prefs.reverse,
    onchange: (e) => progress.setSettings({ reverse: e.target.checked }),
  }), ' English → Deutsch');

  const stage = h('section');
  const layout = h('div.cards-layout',
    h('div.cards-main',
      notes.length ? h('div.adapt-note', notes.map((n) => h('p', n))) : null,
      h('div.stats.cards-stats',
        stat(due, 'due today'), stat(queue.length - due, 'new today'),
        stat(Object.values(progress.cards()).filter(srs.known).length, 'well known'),
        stat(`${progress.cardStreak()} 🔥`, 'day streak')),
      h('div.cards-tools', h('div.cards-scope', scopeBtn('level', `My level (${myLevel})`), scopeBtn('mine', 'My places'), levels.map((l) => scopeBtn(l, l)), placePick), reverse),
      stage),
    statsPanel(allWords, road.levels.map((l) => l.id), today, limit + progress.extraCards(today)));
  view.replaceChildren(h('article.lesson.cards-page',
    h('header.lesson-head', h('a.back', { href: '#/road' }, '← Zurück zur Straße'), h('h1', '🃏 Karten'),
      h('p', 'A few minutes every day. Words you miss come back until you get them right.')),
    layout));

  if (!words.length) {
    stage.append(h('div.card', h('p', 'No words yet. Open a place on the Alltag road, or pick a level above.'),
      h('a.btn.primary', { href: '#/alltag' }, 'Zur Alltag-Straße →')));
  } else if (!queue.length) {
    stage.append(h('div.card.cards-done', h('div.result', h('div.score', '✓'),
      h('p', 'Nothing due right now. Come back tomorrow!'),
      h('p.muted', `${words.length} words in this deck.`),
      unseen ? moreBtn(view, unseen) : null)));
  } else {
    const go = () => run(stage, shuffle(queue.slice(0, due)).concat(queue.slice(due)), reverse.querySelector('input').checked, view, unseen - (queue.length - due));
    stage.append(h('div.card.cards-start',
      h('p', h('b', `${queue.length} cards`), ` ready: ${due} to review, ${queue.length - due} new. `,
        h('span.muted', `${words.length} words in this deck · ${limit} new a day${prefs.adaptive ? ', adaptive' : ''} (⚙ Settings)`)),
      h('button.btn.primary', { type: 'button', onclick: go }, 'Start')));
    if (start) go();
  }

  /**
   * Adaptive mode: today's new-card number from your recent first tries, and, once you know most of
   * your level's words, the next level's words mixed into the "My level" deck.
   */
  async function adaptDeck() {
    const cards = progress.cards();
    const state = progress.adaptState();
    const due = srs.buildQueue(words, cards, today, 0).length;
    const r = adapt.nextNewCards({ base: prefs.newCards, adapt: state.cards, stats: progress.cardStats(), today, due });
    if (r.day === today && r.change) progress.setAdapt({ cards: r });
    const shown = state.cards?.day === today ? state.cards : r; // today's change stays visible all day
    const notes = [`📈 Adaptive: ${r.newCards} new cards today` + (shown.change ? ` (${shown.change > 0 ? '+' : ''}${shown.change}, ${shown.reason})` : shown.reason ? ` · ${shown.reason}` : '')];
    if (prefs.deck === 'level') {
      const mine = words.filter((w) => w.level === myLevel);
      const known = adapt.mastery(mine, cards, srs.cardKey);
      progress.setAdapt({ mastery: { ...state.mastery, [myLevel]: known } });
      const next = levels[levels.indexOf(myLevel) + 1];
      if (next && known >= adapt.UNLOCK_SHARE) {
        const ahead = await wordPool(next, road, myLevel);
        const isNew = (w) => !cards[srs.cardKey(w)];
        // new words alternate between the two levels; words already seen keep their own schedule
        words = [...words.filter((w) => w.level !== myLevel || !isNew(w)), ...ahead.filter((w) => !isNew(w)),
          ...adapt.interleave(mine.filter(isNew), ahead.filter(isNew))];
        notes.push(`🔓 You know ${Math.round(known * 100)}% of the ${myLevel} words, so ${next} words are joining your deck.`);
      } else if (next) {
        notes.push(`${myLevel} words known: ${Math.round(known * 100)}%. ${next} words join your deck at ${Math.round(adapt.UNLOCK_SHARE * 100)}%.`);
      }
    }
    return { limit: r.newCards, notes };
  }
}

/** "+ more new words": adds the amount from ⚙ Settings to today's new cards and starts right away. */
function moreBtn(view, unseen) {
  const n = Math.min(progress.settings().moreCards, unseen);
  return h('button.btn.primary', { type: 'button', onclick: () => { progress.addExtraCards(srs.day(), n); renderCards(view, { start: true }); } },
    `+${n} more new words (${unseen} left)`);
}

const stat = (value, label) => h('div.stat', h('b', String(value)), h('span', label));

const DE_DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** A review gap for a button or list: "now", "3 d", "2.5 mo", "1.2 y". */
function gapLabel(n) {
  if (!n) return 'now';
  if (n < 30) return `${n} d`;
  if (n < 365) return `${+(n / 30).toFixed(1)} mo`;
  return `${+(n / 365).toFixed(1)} y`;
}

/**
 * The statistics panel beside the Karten home: words by level (over every word the app can put in a deck),
 * today's numbers, a 7-day forecast, first-try recall, the hardest words, streak and known total.
 * Everything is computed once per render.
 */
function statsPanel(pool, order, today, newAllowed) {
  const cards = progress.cards();
  const rows = new Map(order.map((l) => [l, { total: 0, known: 0, learning: 0 }]));
  let unseen = 0;
  for (const w of pool) {
    const row = rows.get(w.level || 'B2');
    if (!row) continue;
    const c = cards[srs.cardKey(w)];
    row.total++;
    if (!c) unseen++;
    else if (srs.known(c)) row.known++;
    else row.learning++;
  }
  const all = Object.values(cards);
  const dueNow = all.filter((c) => c.due && c.due <= today).length;
  const newToday = all.filter((c) => c.first === today).length;
  const newLeft = Math.min(unseen, Math.max(0, newAllowed - newToday));
  const done = all.filter((c) => c.last === today).length;

  const levelRows = [...rows].filter(([, r]) => r.total).map(([l, r]) => h('div.cp-level',
    h('div.cp-level-top', h('b', l), h('span', `${r.known} / ${r.total}`)),
    h('div.cp-bar', h('i', { style: `width:${Math.round((r.known / r.total) * 100)}%` })),
    h('small.muted', `learning ${r.learning} · new ${r.total - r.known - r.learning}`)));

  const fc = srs.forecast(cards, today, 7);
  const [y, m, d] = today.split('-').map(Number);
  const peak = Math.max(1, ...fc);
  const bars = fc.map((n, i) => h('div.cp-day',
    h('span.cp-count', String(n)),
    h('div.cp-col', h('i', { style: `height:${Math.round((n / peak) * 100)}%` })),
    h('span.cp-wd', i ? DE_DAYS[new Date(y, m - 1, d + i).getDay()] : 'Heute')));

  let first = 0;
  let right = 0;
  for (const [date, s] of Object.entries(progress.cardStats())) {
    const age = srs.daysBetween(date, today);
    if (age >= 0 && age < 30) { first += s.first; right += s.right; }
  }

  const hard = srs.hardest(cards, 5).map(([k, c]) => h('li',
    h('button.cp-word', {
      type: 'button', title: 'Look up in the translator',
      onclick: () => window.dispatchEvent(new CustomEvent('lg:lookup', { detail: { word: k.replace(/^(der|die|das) /, '') } })),
    }, k),
    h('span.muted', `✗ ${c.fails}`)));

  return h('aside.cards-panel', { 'aria-label': 'Statistics' },
    h('div.card', h('h2', 'Words by level'), levelRows.length ? levelRows : h('p.muted', 'No words yet.')),
    h('div.card', h('h2', 'Today'),
      h('div.cp-today', stat(dueNow, 'due now'), stat(newLeft, 'new left'), stat(done, 'reviewed'))),
    h('div.card', h('h2', 'Next 7 days'), h('div.cp-forecast', bars)),
    h('div.card', h('h2', 'Recall'),
      h('div.cp-recall', h('b', first ? `${Math.round((right / first) * 100)}%` : '—'), h('span.muted', 'first tries, last 30 days'))),
    hard.length ? h('div.card', h('h2', 'Hardest words'), h('ul.cp-hard', hard)) : null,
    h('div.card.cp-totals',
      h('div', h('b', `${progress.cardStreak()} 🔥`), h('span.muted', 'day streak')),
      h('div', h('b', String(progress.wordsLearned())), h('span.muted', 'words known'))));
}

/** One session: show cards until the queue is empty; a missed card goes back into the queue. */
function run(stage, queue, reverse, view, unseen) {
  const today = srs.day();
  const autoplay = canSpeak && progress.settings().autoplay;
  const missed = new Set();
  const answered = new Set(); // first answer per card this session feeds the adaptive stats
  let knew = 0;
  let flipped = false;
  stage.closest('.cards-layout')?.classList.add('in-session'); // the statistics panel steps aside during a session

  const card = h('div.flash', { role: 'button', tabindex: '0', 'aria-live': 'polite' });
  const counter = h('p.muted.flash-count');
  const flipBtn = h('button.btn.primary', { type: 'button', onclick: () => flip() }, 'Umdrehen');
  const actions = h('div.flash-actions');
  stage.replaceChildren(h('div.card.flash-wrap', counter, card, actions,
    h('p.muted.flash-keys', '0 or Space: flip · 1 Nochmal · 2 Schwer · 3 Gut · 4 Leicht')));
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
    // four ratings, each with the gap until the card comes back
    const gaps = srs.preview(progress.cards()[srs.cardKey(w)], today, progress.settings().algorithm);
    const rate = (r, label, cls) => h(`button.btn${cls}`, { type: 'button', onclick: () => grade(r) },
      h('span', label), h('small.flash-gap', gapLabel(gaps[r - 1])));
    const good = rate(3, '✓ Gut', '.primary.flash-yes');
    actions.replaceChildren(rate(1, '✗ Nochmal', '.flash-no'), rate(2, 'Schwer', ''), good, rate(4, 'Leicht', ''));
    good.focus();
  }

  /** rating: 1 Nochmal (Again), 2 Schwer (Hard), 3 Gut (Good), 4 Leicht (Easy) */
  function grade(rating) {
    if (!flipped) return;
    const ok = rating >= 2;
    const w = queue.shift();
    const k = srs.cardKey(w);
    progress.setCard(k, srs.answer(progress.cards()[k], rating, today, progress.settings().algorithm), today, !answered.has(k), ok);
    answered.add(k);
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
        unseen > 0 ? moreBtn(view, unseen) : null,
        h('a.btn.primary', { href: '#/road' }, 'Zur Straße →')))));
  }

  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = (e) => {
    if (!document.body.contains(card)) { document.removeEventListener('keydown', keyHandler); return; }
    if (e.target.matches?.('input, textarea')) return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === '0') { if (!flipped) { e.preventDefault(); flip(); } }
    else if (e.key >= '1' && e.key <= '4') grade(Number(e.key));
  };
  document.addEventListener('keydown', keyHandler);
  show();
}
