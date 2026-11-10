// Translator panel: search box + verbformen-style result cards.
import { loadDictionary, lookup } from './dictionary.js';
import { conjugate, PERSONS } from './conjugate.js';
import { declineNoun, declineAdjective, ADJ_ARTICLES } from './decline.js';
import { translateOnline, wiktionaryNoun, wiktionaryVerb } from './online.js';

const MAX_CARDS = 5;
const TENSES = [
  ['praesens', 'Präsens'], ['praeteritum', 'Präteritum'], ['perfekt', 'Perfekt'],
  ['plusquamperfekt', 'Plusquamperfekt'], ['futur1', 'Futur I'], ['konjunktiv2', 'Konj. II'], ['imperativ', 'Imperativ'],
];
const CASE_LABEL = { nom: 'Nom.', akk: 'Akk.', dat: 'Dat.', gen: 'Gen.' };
const CASES = ['nom', 'akk', 'dat', 'gen'];
const POS_LABEL = { noun: 'noun', verb: 'verb', adj: 'adj.', adv: 'adv.', prep: 'prep.', conj: 'conj.', pron: 'pron.', num: 'num.', phrase: 'phrase' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function artSpan(text, gender) {
  const m = String(text).match(/^(der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines)\s+(.*)$/);
  if (!m) return esc(text);
  return `<span class="g-${gender}">${esc(m[1])}</span> ${esc(m[2])}`;
}

// ---- tables -------------------------------------------------------------------

function nounTable(e) {
  const d = declineNoun({ de: e.de, article: e.article, plural: e.plural, gen: e.gen });
  const g = e.article || 'der';
  // two groups: definite (der/die/das) and indefinite (ein/eine; no article in the plural)
  const cols = d.sg ? ['Singular', 'Plural'] : ['Plural'];
  const group = (label, cls = '') => `<th colspan="${cols.length}" class="tr-group${cls}">${label}</th>`;
  let html = `<div class="tr-scroll"><table class="tr-table tr-noun"><thead>`
    + `<tr><th></th>${group('bestimmt')}${group('unbestimmt', ' tr-split')}</tr>`
    + `<tr><th></th>${[...cols, ...cols].map((c, k) => `<th${k === cols.length ? ' class="tr-split"' : ''}>${c}</th>`).join('')}</tr></thead><tbody>`;
  const cell = (f, gender, cls = '') => `<td${cls}>${f === '–' ? '–' : artSpan(f, gender)}</td>`;
  const split = ' class="tr-split"';
  for (const c of CASES) {
    html += `<tr><th>${CASE_LABEL[c]}</th>`;
    if (d.sg) html += cell(d.sg[c], g);
    html += cell(d.pl[c], 'die');
    if (d.indef.sg) html += cell(d.indef.sg[c], g, split);
    html += `${cell(d.indef.pl[c], 'die', d.indef.sg ? '' : split)}</tr>`;
  }
  return html + '</tbody></table></div>';
}

function personTable(rows) {
  return `<div class="tr-scroll"><table class="tr-table tr-conj"><tbody>${rows
    .map(([p, f]) => `<tr><th>${esc(p)}</th><td>${esc(f ?? '–')}</td></tr>`)
    .join('')}</tbody></table></div>`;
}

function verbTabs(c) {
  const tabs = TENSES.map(([key, label], i) => `<button type="button" class="tr-tab${i === 0 ? ' is-on' : ''}" role="tab" data-pane="${key}" aria-selected="${i === 0}">${label}</button>`).join('');
  const panes = TENSES.map(([key], i) => {
    const rows = key === 'imperativ'
      ? [['du', c.imperativ.du], ['ihr', c.imperativ.ihr], ['Sie', c.imperativ.Sie]]
      : PERSONS.map((p) => [p, c.tenses[key][p]]);
    return `<div class="tr-pane" data-pane="${key}"${i === 0 ? '' : ' hidden'}>${personTable(rows)}</div>`;
  }).join('');
  return `<div class="tr-tabs" role="tablist">${tabs}</div>${panes}`;
}

function verbForms(e, dict) {
  let strong = dict.strong;
  if (e.strongHint) strong = { ...strong, [e.de.replace(/^sich\s+/, '')]: e.strongHint };
  const c = conjugate(e, strong);
  const meta = `<div class="tr-meta">Partizip II <b>${esc(c.p2)}</b> · Partizip I ${esc(c.p1)} · zu-Inf. ${esc(c.zuInfinitive)}${c.sep ? ` · trennbar (${esc(c.sep)}-)` : ''} · ${esc(c.aux)}</div>`;
  return meta + verbTabs(c);
}

function adjForms(e) {
  const a = declineAdjective(e.de);
  const kinds = [['strong', 'stark'], ['weak', 'schwach'], ['mixed', 'gemischt']];
  const line = `<div class="tr-meta">${esc(a.positive)} – <b>${esc(a.comparative)}</b> – <b>${esc(a.superlative)}</b></div>`;
  const tabs = kinds.map(([k, l], i) => `<button type="button" class="tr-tab${i === 0 ? ' is-on' : ''}" role="tab" data-pane="${k}" aria-selected="${i === 0}">${l}</button>`).join('');
  const panes = kinds.map(([k], i) => {
    let t = '<div class="tr-scroll"><table class="tr-table"><thead><tr><th></th><th>m</th><th>f</th><th>n</th><th>Pl.</th></tr></thead><tbody>';
    CASES.forEach((c, ci) => {
      t += `<tr><th>${CASE_LABEL[c]}</th>`;
      for (const g of ['m', 'f', 'n', 'pl']) {
        const art = ADJ_ARTICLES[k] ? ADJ_ARTICLES[k][g][ci] + ' ' : '';
        t += `<td>${esc(art + a[k][g][c])}</td>`;
      }
      t += '</tr>';
    });
    return `<div class="tr-pane" data-pane="${k}"${i === 0 ? '' : ' hidden'}>${t}</tbody></table></div></div>`;
  }).join('');
  return line + `<div class="tr-tabs" role="tablist">${tabs}</div>` + panes;
}

function formsHtml(e, dict) {
  try {
    if (e.pos === 'noun' && e.article) return nounTable(e);
    if (e.pos === 'verb') return verbForms(e, dict);
    if (e.pos === 'adj') return adjForms(e);
  } catch {
    return '<div class="tr-note">Could not build the forms for this word.</div>';
  }
  return '';
}

function hasForms(e) {
  return (e.pos === 'noun' && e.article) || e.pos === 'verb' || e.pos === 'adj';
}

// ---- cards --------------------------------------------------------------------

function chipsHtml(e) {
  const chips = [];
  if (e.source === 'place') chips.push(`<span class="tr-chip tr-chip-src">${esc([e.level, e.placeTitle].filter(Boolean).join(' · '))}</span>`);
  else if (e.source === 'core') chips.push('<span class="tr-chip tr-chip-src">core</span>');
  if (e.goethe) chips.push(`<span class="tr-chip">Goethe ${esc(e.goethe)}</span>`);
  else chips.push('<span class="tr-chip tr-chip-online">online</span>');
  chips.push(`<span class="tr-chip">${esc(POS_LABEL[e.pos] || e.pos || '')}</span>`);
  if (e.pos === 'verb') {
    if (e.sep) chips.push('<span class="tr-chip">sep.</span>');
    if (e.aux) chips.push(`<span class="tr-chip">${esc(e.aux)}</span>`);
  }
  return chips.join('');
}

function speakText(e) {
  return e.pos === 'noun' && e.article ? `${e.article} ${e.de}` : e.de;
}

function headHtml(e) {
  const art = e.pos === 'noun' && e.article ? `<span class="tr-art g-${esc(e.article)}">${esc(e.article)}</span> ` : '';
  const pl = e.pos === 'noun' && e.plural ? `<span class="tr-sub">${e.plural === '-' ? 'no plural' : 'Pl. ' + esc(e.plural)}</span>` : '';
  return `<div class="tr-title">${art}<b class="tr-de">${esc(e.de)}</b>${pl}</div>`;
}

function cardHtml(e, i, expanded, dict) {
  const body = hasForms(e) && expanded ? formsHtml(e, dict) : '';
  const toggle = hasForms(e)
    ? `<button type="button" class="tr-toggle" aria-expanded="${expanded}" data-i="${i}">Formen ${expanded ? '▴' : '▾'}</button>`
    : '';
  return `<article class="tr-card" data-i="${i}">
    <div class="tr-top">
      <div class="tr-main">${headHtml(e)}<div class="tr-en">${esc(e.en || '')}</div></div>
      <button type="button" class="tr-speak" data-i="${i}" aria-label="Pronounce ${esc(e.de)}" title="Pronounce">🔊</button>
    </div>
    <div class="tr-chips">${chipsHtml(e)}${toggle}</div>
    <div class="tr-body"${body ? '' : ' hidden'}>${body}</div>
  </article>`;
}

// ---- search -------------------------------------------------------------------

function stripLead(q) {
  return q.toLowerCase().replace(/^(to|the|a|an|der|die|das|sich)\s+(?=\S)/, '').trim();
}

function exactHit(e, q) {
  const s = stripLead(q);
  if (e.de.toLowerCase().replace(/^sich\s+/, '') === s) return true;
  return String(e.en || '').split(';').some((m) => m.toLowerCase().replace(/\([^)]*\)/g, '').trim().replace(/^(to|the|a|an)\s+/, '') === s);
}

const looksGerman = (q) => /[äöüß]/i.test(q);
const isCapWord = (q) => /^[A-ZÄÖÜ][\p{L}-]+$/u.test(q);

export function initTranslator(container) {
  container.classList.add('tr');
  container.innerHTML = `
    <div class="tr-search">
      <input class="tr-input" type="search" placeholder="English or German word…" aria-label="Translate a word" autocomplete="off" autocapitalize="none" spellcheck="false">
      <span class="tr-hint" aria-hidden="true">EN ⇄ DE</span>
    </div>
    <div class="tr-status" role="status" hidden></div>
    <div class="tr-results" aria-live="polite"></div>`;
  const input = container.querySelector('.tr-input');
  const status = container.querySelector('.tr-status');
  const results = container.querySelector('.tr-results');

  let dictPromise = null;
  const getDict = () => (dictPromise ||= loadDictionary());
  let entries = [];
  let dictRef = null;
  let seq = 0;
  let timer = null;

  const setStatus = (msg) => { status.textContent = msg || ''; status.hidden = !msg; };

  function render(list, dict) {
    entries = list;
    dictRef = dict;
    results.innerHTML = list.map((e, i) => cardHtml(e, i, i === 0, dict)).join('');
  }

  async function onlineEntries(q) {
    const order = looksGerman(q) || isCapWord(q) ? [['de', 'en'], ['en', 'de']] : [['en', 'de'], ['de', 'en']];
    for (const [from, to] of order) {
      const tr = await translateOnline(q, from, to);
      if (!tr.length) continue;
      if (from === 'en') {
        // translations are German: try Wiktionary for single capitalised words
        const list = tr.slice(0, MAX_CARDS).map((t) => ({ de: t, en: q, pos: /^[A-ZÄÖÜ][\p{L}-]+$/u.test(t) ? 'noun' : 'phrase', source: 'online' }));
        await Promise.all(list.map(async (e) => {
          if (e.pos !== 'noun') return;
          const w = await wiktionaryNoun(e.de);
          if (w) Object.assign(e, w);
          else e.pos = 'phrase';
        }));
        return list;
      }
      // German query: show the query with its English meanings and try Wiktionary for grammar
      const e = { de: q, en: tr.join('; '), pos: 'phrase', source: 'online' };
      if (isCapWord(q)) {
        const w = await wiktionaryNoun(q);
        if (w) Object.assign(e, w, { pos: 'noun' });
      } else if (/^[a-zäöüß]+en$/.test(q)) {
        const w = await wiktionaryVerb(q);
        if (w) Object.assign(e, { pos: 'verb', aux: w.aux, p2: w.p2, strongHint: { pres: null, praet: w.praet, p2: w.p2, aux: w.aux } });
      }
      return [e];
    }
    return [];
  }

  async function search(raw) {
    const q = String(raw || '').trim();
    const mine = ++seq;
    if (!q) { results.innerHTML = ''; setStatus(''); entries = []; return; }
    const dict = await getDict();
    if (mine !== seq) return;
    const builtinMissing = !dict.entries.length;
    const words = stripLead(q).split(/\s+/).filter(Boolean);
    let hits = lookup(q, dict);
    if (words.length >= 2) hits = hits.filter((e) => exactHit(e, q));
    hits = hits.slice(0, MAX_CARDS);
    if (hits.length) {
      setStatus(builtinMissing ? 'Offline: showing only built-in words.' : '');
      render(hits, dict);
      return;
    }
    results.innerHTML = '<div class="tr-empty">Searching online…</div>';
    const online = await onlineEntries(q);
    if (mine !== seq) return;
    if (online.length) {
      setStatus('Online (MyMemory)');
      render(online, dict);
      return;
    }
    setStatus('Offline: showing only built-in words.');
    results.innerHTML = '<div class="tr-empty">Not found</div>';
    entries = [];
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => search(input.value), 250);
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { clearTimeout(timer); search(input.value); }
  });

  window.addEventListener('lg:lookup', (ev) => {
    const word = ev && ev.detail && ev.detail.word;
    if (!word) return;
    input.value = word;
    clearTimeout(timer);
    search(word);
  });

  results.addEventListener('click', (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    const card = t.closest('.tr-card');
    if (t.classList.contains('tr-speak')) {
      const e = entries[Number(t.dataset.i)];
      if (e && typeof window.lgSpeak === 'function') window.lgSpeak(speakText(e));
      return;
    }
    if (t.classList.contains('tr-toggle') && card) {
      const e = entries[Number(t.dataset.i)];
      const body = card.querySelector('.tr-body');
      const open = t.getAttribute('aria-expanded') !== 'true';
      if (open && !body.innerHTML.trim()) body.innerHTML = formsHtml(e, dictRef);
      body.hidden = !open;
      t.setAttribute('aria-expanded', String(open));
      t.textContent = `Formen ${open ? '▴' : '▾'}`;
      return;
    }
    if (t.classList.contains('tr-tab') && card) {
      const body = t.closest('.tr-body');
      body.querySelectorAll('.tr-tab').forEach((b) => { const on = b === t; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
      body.querySelectorAll('.tr-pane').forEach((p) => { p.hidden = p.dataset.pane !== t.dataset.pane; });
    }
  });

  getDict(); // warm up
  return { search };
}

