// Dictionary: merges lesson words, core.json and strong-verbs.json, and answers lookups.
import { conjugate } from './conjugate.js';
import { declineAdjective } from './decline.js';

const keyOf = (e) => `${e.pos}|${e.de.toLowerCase()}`;

export function fold(s) {
  return s.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
}

function normEn(s) {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(to|the|a|an)\s+/, '')
    .trim();
}

function push(map, key, value) {
  if (!key) return;
  const list = map.get(key);
  if (list) { if (!list.includes(value)) list.push(value); } else map.set(key, [value]);
}

export function buildDictionary({ core = [], strong = {}, lessonWords = [] } = {}) {
  const merged = new Map();
  for (const w of core) {
    if (!w || !w.de) continue;
    merged.set(keyOf(w), { ...w, source: 'core' });
  }
  for (const w of lessonWords) {
    if (!w || !w.de) continue;
    const k = keyOf(w);
    const prev = merged.get(k);
    if (prev && prev.source === 'lesson') continue; // first lesson wins
    merged.set(k, { ...(prev || {}), ...w, source: 'lesson', lesson: w.lesson });
  }
  const entries = [...merged.values()];

  const byDe = new Map();
  const byFold = new Map();
  const byForm = new Map();
  const byEn = new Map();
  const byEnWord = new Map();

  for (const e of entries) {
    const de = e.de.toLowerCase();
    push(byDe, de, e);
    if (e.pos === 'verb' && de.startsWith('sich ')) push(byDe, de.slice(5), e);
    push(byFold, fold(de), e);

    if (e.pos === 'verb') {
      try {
        const c = conjugate(e, strong);
        const add = (form) => {
          const f = String(form || '').replace(/!$/, '').split(' ')[0].toLowerCase();
          if (f && f !== de) push(byForm, f, e);
        };
        for (const t of ['praesens', 'praeteritum', 'konjunktiv2']) {
          for (const p of Object.keys(c.tenses[t])) add(c.tenses[t][p]);
        }
        add(c.p2);
        add(c.p1);
        if (c.imperativ.du) add(c.imperativ.du);
        if (c.imperativ.ihr) add(c.imperativ.ihr);
      } catch { /* skip malformed entry */ }
    } else if (e.pos === 'noun') {
      if (e.plural && e.plural !== '-') push(byForm, e.plural.toLowerCase(), e);
    } else if (e.pos === 'adj') {
      try {
        const a = declineAdjective(e.de);
        push(byForm, a.comparative.toLowerCase(), e);
      } catch { /* ignore */ }
    }

    String(e.en || '').split(';').forEach((m, idx) => {
      const n = normEn(m);
      if (!n) return;
      push(byEn, n, { e, idx });
      n.split(/[\s,/-]+/).filter((w) => w.length > 1).forEach((w) => push(byEnWord, w, { e, idx }));
    });
  }

  return { entries, strong, byDe, byFold, byForm, byEn, byEnWord };
}

export function lookup(query, dict) {
  let q = String(query || '').trim();
  if (!q || !dict) return [];
  const lower = q.toLowerCase();
  const scores = new Map();
  const bump = (e, s) => { if (!scores.has(e) || scores.get(e) < s) scores.set(e, s); };

  // ---- German side
  let de = lower.replace(/^(der|die|das)\s+(?=\S)/, '').replace(/^sich\s+(?=\S)/, '');
  const artMatch = lower.match(/^(der|die|das)\s+/);
  for (const e of dict.byDe.get(de) || []) {
    let s = 100;
    if (artMatch && e.article === artMatch[1]) s += 3;
    bump(e, s);
  }
  for (const e of dict.byDe.get(lower) || []) bump(e, 104);
  for (const e of dict.byForm.get(de) || []) bump(e, 95);
  for (const e of dict.byFold.get(fold(de)) || []) bump(e, 70);
  if (de.length >= 3) {
    for (const [key, list] of dict.byDe) {
      if (key !== de && key.startsWith(de)) for (const e of list) bump(e, 40 - Math.min(20, key.length - de.length));
    }
  }

  // ---- English side
  const toForm = /^to\s+/.test(lower);
  const en = normEn(lower);
  if (en) {
    for (const { e, idx } of dict.byEn.get(en) || []) {
      let s = 90 - idx * 4;
      if (toForm) s += e.pos === 'verb' ? 8 : -12;
      bump(e, s);
    }
    const words = en.split(' ');
    if (words.length === 1) {
      for (const { e, idx } of dict.byEnWord.get(en) || []) {
        let s = 50 - idx * 3;
        if (toForm) s += e.pos === 'verb' ? 5 : -10;
        bump(e, s);
      }
    }
  }

  const out = [...scores.entries()].map(([e, s]) => ({ e, s: s + (e.source === 'lesson' ? 4 : 0) }));
  out.sort((a, b) => b.s - a.s || a.e.de.length - b.e.de.length || a.e.de.localeCompare(b.e.de, 'de'));
  return out.slice(0, 20).map((x) => x.e);
}

async function getJson(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function loadDictionary() {
  const base = (p) => new URL(`../../data/${p}`, import.meta.url).href;
  const [core, strong, roadmap] = await Promise.all([
    getJson(base('dictionary/core.json')),
    getJson(base('dictionary/strong-verbs.json')),
    getJson(base('roadmap.json')),
  ]);
  const jobs = [];
  for (const level of (roadmap && roadmap.levels) || []) {
    for (const m of level.milestones || []) {
      jobs.push(getJson(base(`lessons/${String(level.id).toLowerCase()}/${m.id}.json`)).then((l) => ({ l, level: level.id, id: m.id })));
    }
  }
  const lessons = await Promise.all(jobs);
  const lessonWords = [];
  for (const { l, level, id } of lessons) {
    if (!l || !Array.isArray(l.words)) continue;
    for (const w of l.words) lessonWords.push({ ...w, lesson: l.id || id, level: l.level || level });
  }
  return buildDictionary({ core: core || [], strong: strong || {}, lessonWords });
}
