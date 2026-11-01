// The Road: a winding SVG road from A1 (bottom) to C1 (top), one milestone per lesson.
import { h, getRoadmap, getLesson } from './util.js';
import * as progress from './progress.js';
import { STEPS } from './lesson.js';

const STEP = { zone: 150, ms: 108, gate: 120, planned: 96, goal: 130 };

/** Flatten the roadmap into road items, bottom (start) to top (goal). */
function items(road) {
  const out = [];
  for (const lv of road.levels) {
    out.push({ kind: 'zone', level: lv });
    for (const m of lv.milestones || []) out.push({ kind: 'ms', level: lv, m, status: progress.status(m.id) });
    for (const p of lv.planned || []) out.push({ kind: 'planned', level: lv, m: p });
    if (lv.milestones?.length) out.push({ kind: 'gate', level: lv, status: progress.checkpointState(lv.id)?.passed ? 'done' : 'new' });
  }
  out.push({ kind: 'goal' });
  const cur = out.findIndex((x) => (x.kind === 'ms' || x.kind === 'gate') && x.status !== 'done');
  if (cur >= 0) out[cur].current = true;
  return { list: out, current: cur };
}

function stats(road, list, current) {
  const ms = list.filter((x) => x.kind === 'ms');
  const done = ms.filter((x) => x.status === 'done').length;
  const lvl = (list[current] || list.at(-2)).level || road.levels.at(-1);
  const left = ms.filter((x) => x.level === lvl && x.status !== 'done').length;
  const pct = ms.length ? Math.round((done / ms.length) * 100) : 0;
  const stat = (b, span, extra, cls = '') => h(`div.stat${cls}`, h('b', b), h('span', span), extra);
  return h('div.stats',
    stat(lvl.id, 'Level'),
    stat(`${pct}%`, 'of the road', h('div.bar', h('i', { style: `width:${pct}%` }))),
    stat(left, `left in ${lvl.id}`),
    stat(progress.wordsLearned(), 'words', null, '.opt'),
    stat(`${progress.speakStreak()}🔥`, 'speaking days', null, '.opt'));
}

// Catmull-Rom through the points → smooth cubic Bézier path
function smooth(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`;
  }
  return d;
}

export async function renderRoad(view, { at } = {}) {
  const road = await getRoadmap();
  document.title = 'Deutschweg · A1 → C1';
  const { list, current } = items(road);

  const page = h('div.road-page');
  const wrap = h('div.road');
  page.append(
    stats(road, list, current),
    h('div.road-intro',
      h('p', 'Your road from A1 to C1. Every stop is one concept with its wordlist. Scroll up to see what\'s ahead.'),
      h('div.road-jump', road.levels.map((lv) => h('button.btn.small', { type: 'button', onclick: () => scrollToNode(wrap, `zone-${lv.id}`) }, lv.id)),
        h('button.btn.small.primary', { type: 'button', onclick: () => scrollToNode(wrap, 'current') }, '📍 Du bist hier'))),
    wrap);
  view.replaceChildren(page);

  const draw = () => layout(wrap, list, current);
  draw();
  let w = wrap.clientWidth;
  new ResizeObserver(() => { if (Math.abs(wrap.clientWidth - w) > 20) { w = wrap.clientWidth; draw(); } }).observe(wrap);

  requestAnimationFrame(() => scrollToNode(wrap, at ? `ms-${at}` : 'current', false));
}

function scrollToNode(wrap, key, smoothScroll = true) {
  const el = key === 'current' ? wrap.querySelector('.current') : wrap.querySelector(`[data-key="${key}"]`);
  if (!el) return;
  const r = el.getBoundingClientRect();
  window.scrollTo({ top: window.scrollY + r.top - window.innerHeight * 0.55, behavior: smoothScroll ? 'smooth' : 'auto' });
}

function layout(wrap, list, current) {
  const W = wrap.clientWidth || 360;
  const cx = W / 2;
  const amp = Math.min(W * 0.24, 190);
  const total = list.reduce((s, x) => s + STEP[x.kind], 0) + 60;
  let y = total - 40;
  let t = 0;
  const pts = list.map((x) => {
    const step = STEP[x.kind];
    let px = cx;
    if (x.kind === 'ms' || x.kind === 'planned') { px = cx + amp * Math.sin(t); t += 1.05; }
    else if (x.kind === 'gate') t = Math.round(t / Math.PI) * Math.PI; // gates sit near the centre; restart the wave
    const p = { x: Math.round(px), y: Math.round(y) };
    y -= step;
    return p;
  });

  wrap.replaceChildren();
  wrap.style.height = `${total}px`;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', W);
  svg.setAttribute('height', total);
  svg.setAttribute('aria-hidden', 'true');
  const path = (cls, d) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('class', cls); p.setAttribute('d', d); return p; };
  const all = smooth(pts);
  const reached = current < 0 ? pts : pts.slice(0, current + 1);
  svg.append(path('edge', all), path('asphalt', all), path('done-path', smooth(reached)), path('dash', all));
  wrap.append(svg);

  list.forEach((x, i) => wrap.append(node(x, pts[i], cx)));
}

function node(x, p, cx) {
  const style = `left:${p.x}px;top:${p.y}px`;
  if (x.kind === 'zone') {
    return h('div.zone-label', { style: `top:${p.y - 34}px`, 'data-key': `zone-${x.level.id}` },
      h('div.sign', h('b', `${x.level.id} · ${x.level.name}`), h('small', x.level.goal)));
  }
  const side = p.x > cx + 4 ? 'left' : 'right'; // label points toward the middle
  const cls = [x.kind === 'gate' ? 'gate' : x.kind === 'goal' ? 'goal' : '', x.kind === 'planned' ? 'locked' : x.status, side, x.current ? 'current' : ''].filter(Boolean).join(' ');

  if (x.kind === 'goal') {
    return h(`div.ms.${cls.replace(/ /g, '.')}`, { style }, h('div.ms-dot', '🏆'),
      h('div.ms-label', { style: 'cursor:default' }, h('b', 'Ziel: C1'), h('small', 'Fluent, precise German for work and life.')));
  }

  const open = () => sheet(x);
  let dot;
  let title;
  let sub;
  if (x.kind === 'gate') {
    dot = x.status === 'done' ? '✓' : '🚧';
    title = `${x.level.id} Checkpoint`;
    sub = x.status === 'done' ? `${x.level.id} geschafft!` : 'Mixed quiz on the whole level';
  } else {
    const n = x.level.milestones?.indexOf(x.m);
    dot = x.kind === 'planned' ? '🔒' : x.status === 'done' ? '✓' : String(n + 1);
    title = x.m.title;
    sub = x.m.wordlist ? `📍 ${x.m.concept} · 🗂 ${x.m.wordlist}` : x.m.concept;
  }
  const frac = x.kind === 'ms' && x.status === 'progress' ? progress.stepFraction(x.m.id) : 0;
  const ring = frac ? (() => {
    const c = 2 * Math.PI * 30;
    return h('span', { html: `<svg class="ring" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="none" stroke="var(--line)" stroke-width="4"/><circle cx="32" cy="32" r="30" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c * frac} ${c}"/></svg>` });
  })() : null;
  const label = `${title}: ${x.kind === 'planned' ? 'coming soon' : x.status === 'done' ? 'done' : x.status === 'progress' ? 'in progress' : 'not started'}`;

  return h(`div.ms.${cls.replace(/ /g, '.')}`, { style, 'data-key': x.kind === 'ms' ? `ms-${x.m.id}` : `${x.kind}-${x.level.id}-${title}` },
    x.current ? h('div.you-are-here', 'Du bist hier') : null,
    h('button.ms-dot', { type: 'button', onclick: open, 'aria-label': label }, ring, dot),
    h('button.ms-label', { type: 'button', onclick: open, tabindex: '-1' }, h('b', title), h('small', sub)));
}

function closeSheet() {
  document.querySelectorAll('.sheet, .sheet-backdrop').forEach((e) => e.remove());
  document.removeEventListener('keydown', escClose);
}
const escClose = (e) => e.key === 'Escape' && closeSheet();

async function sheet(x) {
  closeSheet();
  const card = h('div.sheet', { role: 'dialog', 'aria-modal': 'true' });
  document.body.append(h('div.sheet-backdrop', { onclick: closeSheet }), card);
  document.addEventListener('keydown', escClose);
  const close = h('button.btn', { type: 'button', onclick: closeSheet }, 'Schließen');

  if (x.kind === 'planned') {
    append(card, h('span.chip', `${x.level.id} · coming soon`), h('h2', x.m.title), h('p', x.m.concept),
      h('p.muted', `The ${x.level.id} lessons arrive in a later phase. Finish B1 first; it's the base for this.`), h('div.row', close));
  } else if (x.kind === 'gate') {
    const c = progress.checkpointState(x.level.id);
    append(card, h('span.chip.accent', `${x.level.id} Checkpoint`), h('h2', `${x.level.id} geschafft?`),
      h('p', `A mixed quiz with questions from every ${x.level.id} milestone. Score ${Math.round(progress.PASS * 100)}% to pass the gate.`),
      c ? h('p.muted', `Best so far: ${Math.round(c.best * 100)}%${c.passed ? ' · passed ✓' : ''}`) : null,
      h('div.row', close, h('a.btn.primary', { href: `#/checkpoint/${x.level.id}`, onclick: closeSheet }, c?.passed ? 'Retake' : 'Start checkpoint')));
  } else {
    const st = progress.lessonState(x.m.id);
    const firstOpen = STEPS.find(([s]) => !st?.steps?.[s])?.[0] || 'practice';
    const go = h('a.btn.primary', { href: `#/lesson/${x.m.id}/${x.status === 'new' ? 'learn' : firstOpen}`, onclick: closeSheet },
      x.status === 'new' ? 'Start' : x.status === 'done' ? 'Review' : 'Continue');
    const meta = h('div.meta', h('span.chip.accent', x.level.id), h('span.chip', `🗂 ${x.m.wordlist}`));
    append(card, meta, h('h2', x.m.title), h('p', x.m.concept),
      st?.best ? h('p.muted', `Best practice score: ${Math.round(st.best * 100)}%${st.done ? ' · milestone reached ✓' : ''}`) : null,
      h('div.row', close, go));
    go.focus();
    try {
      const lesson = await getLesson(x.m.id);
      meta.append(h('span.chip', `${lesson.words.length} words`), h('span.chip', `${lesson.exercises.length} exercises`), h('span.chip', `⏱ ${lesson.minutes} min`));
    } catch {
      go.replaceWith(h('span.muted', 'This lesson file is missing.'));
    }
  }
}

// Node.append prints null as text; drop optional (null) parts first
const append = (el, ...kids) => el.append(...kids.filter((k) => k != null));
