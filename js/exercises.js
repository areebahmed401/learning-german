// One-at-a-time quiz runner for the six exercise types in the lesson schema.
import { h, md, shuffle } from './util.js';
import { speak } from './speech.js';
import { sameIgnoringUmlauts, toPlain } from './umlaut.js';
import { sameV2Sentence } from './wordorder.js';
import { loadDictionary } from './translator/dictionary.js';

// The translator dictionary tells verbs apart (for word order) and gives gap hints; it loads in the background.
let dict = null;
const dictReady = loadDictionary().then((d) => (dict = d)).catch(() => null);
const entriesFor = (word) => {
  const k = toPlain(String(word).toLowerCase().trim());
  return dict ? [...(dict.byFold.get(k) || []), ...(dict.byFormFold?.get(k) || [])] : [];
};
const isVerb = (t) => entriesFor(t).some((e) => e.pos === 'verb');

const KIND = {
  mc: 'Choose the answer', gap: 'Fill the gap', article: 'der, die or das?',
  order: 'Build the sentence', match: 'Match the pairs', translate: 'Translate into German',
};

export const normAnswer = (s) =>
  String(s).toLowerCase().replace(/[.,!?;:„“"»«]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Returns 'right' | 'umlaut' (right, typed without ä/ö/ü/ß: a/ae, o/oe, u/ue, ss all count) | 'order' (right, in another verb-second word order) | 'wrong'.
 * All but 'wrong' score as correct; 'umlaut' and 'order' also show the listed answer.
 */
export function grade(given, accepted) {
  return gradeAnswer(given, accepted).grade;
}

/** grade() plus the accepted answer that matched, to show its proper spelling. */
export function gradeAnswer(given, accepted, { sentence = false } = {}) {
  const g = normAnswer(given);
  const exact = accepted.find((a) => normAnswer(a) === g);
  if (exact != null) return { grade: 'right', answer: exact };
  const close = accepted.find((a) => sameIgnoringUmlauts(normAnswer(a), g));
  if (close != null) return { grade: 'umlaut', answer: close };
  if (sentence) {
    const moved = accepted.find((a) => sameV2Sentence(given, a, isVerb));
    if (moved != null) return { grade: 'order', answer: moved };
  }
  return { grade: 'wrong', answer: accepted[0] };
}

/** (exported for checking) A gap's hint from the dictionary: the base form and its meaning, or just the meaning when the answer is the base form. */
export function gapHint(item) {
  const answer = item.answer[0].trim();
  if (/\s/.test(answer) || /\([^)]+\)/.test(item.q)) return null; // several words, or the base form is already given
  const lower = answer.toLowerCase();
  const exact = dict ? [...(dict.byDe.get(lower) || []), ...(dict.byForm.get(lower) || [])] : [];
  const atStart = item.q.trim().startsWith('___');
  const noun = !atStart && answer[0] !== answer[0].toLowerCase(); // a capital mid-sentence means a noun
  const fits = (e) => ['noun', 'verb', 'adj'].includes(e.pos) && (atStart || (e.pos === 'noun') === noun)
    && !(e.pos === 'verb' && lower === e.de.toLowerCase().replace(/e?n$/, '')); // "weh" is not wehen's stem here
  const e = (exact.length ? exact : entriesFor(answer)).sort((x, y) => x.de.startsWith('sich ') - y.de.startsWith('sich ')).find(fits);
  if (!e) return null;
  const en = String(e.en).split(/[;,(]/)[0].trim();
  return normAnswer(e.de) === normAnswer(answer) ? en : `${e.de} · ${en}`;
}

/**
 * Render items into container, one per screen.
 * onFinish({score, wrong: [item._i...]}) runs when the last item is done.
 */
export function runQuiz(container, items, { onFinish, label = 'Übung' } = {}) {
  let i = 0;
  let right = 0;
  const wrong = [];

  const top = h('div.quiz-top', h('div.bar', h('i')), h('span'));
  const stage = h('div.card');
  container.replaceChildren(top, stage);

  function show() {
    top.querySelector('i').style.width = `${(i / items.length) * 100}%`;
    top.querySelector('span').textContent = `${label} ${i + 1} / ${items.length}`;
    const item = items[i];
    const feedback = h('div');
    const actions = h('div.quiz-actions');
    let answered = false;

    const finish = (ok, shown) => {
      if (answered) return;
      answered = true;
      if (ok) right++; else wrong.push(item._i ?? i);
      feedback.className = `feedback ${ok ? 'right' : 'wrong'}`;
      feedback.replaceChildren(...[
        h('b', ok ? 'Richtig! ✓' : 'Nicht ganz.'),
        shown ? h('div', { html: `${ok === 'umlaut' ? 'With umlauts' : ok === 'order' ? 'Also right' : 'Answer'}: <strong>${md(shown)}</strong>` }) : null,
        item.explain ? h('div', { html: md(item.explain) }) : null,
      ].filter(Boolean));
      actions.replaceChildren(h('button.btn.primary', { onclick: next, autofocus: true }, i + 1 < items.length ? 'Weiter →' : 'Ergebnis'));
      actions.querySelector('button').focus();
    };

    const body = render(item, finish, actions);
    stage.replaceChildren(h('div.ex-kind', KIND[item.type] || ''), body, feedback, actions);
    stage.querySelector('input, textarea')?.focus();
  }

  function next() {
    i++;
    if (i < items.length) return show();
    const score = items.length ? right / items.length : 0;
    top.querySelector('i').style.width = '100%';
    onFinish?.({ score, wrong, right, total: items.length });
  }

  show();
}

function render(item, finish, actions) {
  switch (item.type) {
    case 'mc': return renderMC(item, finish);
    case 'article': return renderArticle(item, finish);
    case 'gap': return renderGap(item, finish, actions);
    case 'translate': return renderTranslate(item, finish, actions);
    case 'order': return renderOrder(item, finish, actions);
    case 'match': return renderMatch(item, finish);
    default: return h('p', `Unknown exercise type ${item.type}`);
  }
}

function lockOptions(wrap, correctIdx, picked) {
  wrap.querySelectorAll('.option').forEach((b, j) => {
    b.disabled = true;
    if (j === correctIdx) b.classList.add('right');
    else if (j === picked) b.classList.add('wrong');
  });
}

function renderMC(item, finish) {
  const opts = h('div.options');
  item.options.forEach((o, j) =>
    opts.append(h('button.option', {
      onclick: () => { lockOptions(opts, item.answer, j); finish(j === item.answer, j === item.answer ? null : item.options[item.answer]); },
    }, o)));
  return h('div', h('div.ex-q', { html: md(item.q).replace('___', '<u>&nbsp;&nbsp;&nbsp;&nbsp;</u>') }), opts);
}

function renderArticle(item, finish) {
  const arts = ['der', 'die', 'das'];
  const wrap = h('div.articles');
  arts.forEach((a, j) =>
    wrap.append(h(`button.option.a-${a}`, {
      onclick: () => {
        const ok = a === item.answer;
        lockOptions(wrap, arts.indexOf(item.answer), j);
        finish(ok, ok ? null : `${item.answer} ${item.word}`);
        speak(`${item.answer} ${item.word}`);
      },
    }, a)));
  return h('div', h('div.big-word', item.word), wrap);
}

function checkBtn(actions, fn) {
  actions.replaceChildren(h('button.btn.primary', { onclick: fn }, 'Prüfen'));
}

function renderGap(item, finish, actions) {
  const input = h('input.gap-input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Your answer' });
  const [a, b] = item.q.split('___');
  const check = () => {
    if (!input.value.trim()) return input.focus();
    input.disabled = true;
    const { grade: g, answer } = gradeAnswer(input.value, item.answer);
    finish(g === 'wrong' ? false : g, g === 'right' ? null : answer);
  };
  // preventDefault: otherwise the same Enter press also "clicks" the Weiter button that check() focuses
  input.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), check()));
  input.addEventListener('input', () => (input.style.width = `${Math.max(6, input.value.length + 2)}ch`));
  checkBtn(actions, check);
  const hint = h('p.muted.gap-hint');
  const fill = () => { const t = gapHint(item); if (t) hint.textContent = `💡 ${t}`; };
  dict ? fill() : dictReady.then(fill);
  return h('div', h('div.ex-q', h('span', { html: md(a) }), input, h('span', { html: md(b) })), hint);
}

// Which German "you" the accepted answers use, so an English "you" is not a guess between du, ihr and Sie.
const YOU_FORMS = [
  ['informal: du', /\b(du|dich|dir|dein\w*)\b/i],
  ['you all: ihr', /\b(euch|eure?\w*|seid)\b|\bihr\b/],
  ['formal: Sie', /\b(Sie|Ihnen|Ihre?\w*)\b/],
];
export function youHint(item) {
  if (!/\byou/i.test(item.en) || /\((in)?formal|\b(du|Sie|ihr)\b/.test(item.en)) return null;
  const forms = YOU_FORMS.filter(([, re]) => item.answer.some((a) => re.test(a))).map(([label]) => label);
  if (!forms.length) return null;
  return forms.length === 1 ? forms[0] : `any "you" is fine: ${forms.map((f) => f.split(': ')[1]).join(', ')}`;
}

function renderTranslate(item, finish, actions) {
  const ta = h('textarea.answer', { placeholder: 'Auf Deutsch… (no umlaut keys? type a/ae for ä, ss for ß)', autocapitalize: 'sentences', spellcheck: 'false', 'aria-label': 'Your translation' });
  const check = () => {
    if (!ta.value.trim()) return ta.focus();
    ta.disabled = true;
    const { grade: g, answer } = gradeAnswer(ta.value, item.answer, { sentence: true });
    finish(g === 'wrong' ? false : g, g === 'right' ? null : answer);
    speak(item.answer[0]);
  };
  ta.addEventListener('keydown', (e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), check()));
  checkBtn(actions, check);
  const you = youHint(item);
  return h('div', h('div.ex-q', item.en), you ? h('p.muted.gap-hint', `👤 ${you}`) : null, ta);
}

function renderOrder(item, finish, actions) {
  const line = h('div.tiles.answer-line', { 'aria-label': 'Your sentence' });
  const pool = h('div.tiles');
  const tile = (w) => {
    const b = h('button.tile', { type: 'button' }, w);
    b.onclick = () => {
      (b.parentElement === pool ? line : pool).append(b);
      done.disabled = pool.children.length > 0;
    };
    return b;
  };
  shuffle(item.words).forEach((w) => pool.append(tile(w)));
  const done = h('button.btn.primary', { disabled: true, onclick: () => {
    const given = [...line.children].map((b) => b.textContent).join(' ');
    [...line.children, ...pool.children].forEach((b) => (b.disabled = true));
    const g = gradeAnswer(given, [item.answer], { sentence: true }).grade;
    const ok = g !== 'wrong';
    finish(ok && g, g === 'right' ? null : item.answer);
    speak(item.answer);
  } }, 'Prüfen');
  actions.replaceChildren(done);
  return h('div', h('p.muted', 'Tap the words in the right order.'), line, pool);
}

function renderMatch(item, finish) {
  const left = shuffle(item.pairs.map((p, k) => ({ t: p[0], k })));
  const right = shuffle(item.pairs.map((p, k) => ({ t: p[1], k })));
  let sel = null;
  let mistakes = 0;
  let matched = 0;
  const grid = h('div.match');
  const btn = (x, side) => {
    const b = h('button.option', { type: 'button', 'data-k': x.k, 'data-side': side }, x.t);
    b.onclick = () => {
      if (b.classList.contains('ok')) return;
      if (!sel || sel.dataset.side === side) {
        sel?.classList.remove('sel');
        sel = b;
        b.classList.add('sel');
        if (side === 'l') speak(x.t);
        return;
      }
      if (sel.dataset.k === b.dataset.k) {
        [sel, b].forEach((e) => { e.classList.remove('sel'); e.classList.add('ok'); e.disabled = true; });
        matched++;
        if (matched === item.pairs.length) finish(mistakes === 0, null);
      } else {
        mistakes++;
        b.classList.add('shake');
        setTimeout(() => b.classList.remove('shake'), 300);
      }
      sel.classList.remove('sel');
      sel = null;
    };
    return b;
  };
  for (let k = 0; k < left.length; k++) grid.append(btn(left[k], 'l'), btn(right[k], 'r'));
  return h('div', h('p.muted', 'Tap a German word, then its meaning.'), grid);
}
