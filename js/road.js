// The Road: a winding SVG road from A1 (bottom) to C1 (top), one milestone per lesson.
import { h, md, getRoadmap, getLesson, getAlltag, getPlace, placeWords } from './util.js';
import { PLACE_STEPS, placeMap, placeAsLesson } from './place.js';
import { renderMindmapPreview } from './mindmap.js';
import { openMindmapModal } from './mindmap-modal.js';
import * as progress from './progress.js';
import { readyToAdvance } from './adapt.js';
import { STEPS } from './lesson.js';

const STEP = { zone: 150, ms: 108, gate: 120, planned: 96, goal: 130 };

/** "Heute" strip: your quiz and flashcard streaks, plus the checkpoint once you're ready for it. */
function today(road) {
  return h('div.today',
    h('b', 'Heute'),
    h('span.muted', `🔥 Quiz ${progress.quizStreak()} · Karten ${progress.cardStreak()}`),
    h('div.today-go', readyLink(road))); // Quiz and Karten live in the dock at the bottom
}

/** Adaptive mode: when the quiz and the cards both say your level is down, suggest its checkpoint. */
function readyLink(road) {
  if (!progress.settings().adaptive) return null;
  const level = progress.currentLevel(road);
  const ready = readyToAdvance({
    answers: progress.quizState().answers, level,
    levelMastery: progress.adaptState().mastery?.[level] ?? 0,
    checkpointPassed: progress.checkpointState(level)?.passed,
  });
  if (!ready) return null;
  const ids = road.levels.filter((l) => l.milestones?.length).map((l) => l.id);
  const next = ids[ids.indexOf(level) + 1];
  return h('a.btn.small.primary', { href: `#/checkpoint/${level}`, title: `Take the ${level} checkpoint` },
    next ? [`🎯 Ready for ${next}?`, h('span.ready-more', ` Take the ${level} checkpoint`)] : `🎯 Take the ${level} checkpoint`);
}

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

/** The Alltag road: chapters (as zones) → places, bottom (arrival) to top. Places not written yet are "soon". */
function alltagItems(alltag) {
  const out = [];
  for (const c of alltag.chapters) {
    const zone = { id: c.id, name: c.name, goal: c.goal, sign: c.name, milestones: c.stops };
    out.push({ kind: 'zone', level: zone, mode: 'alltag' });
    for (const s of c.stops) {
      out.push(s.soon ? { kind: 'planned', level: zone, m: s, mode: 'alltag' } : { kind: 'ms', level: zone, m: s, mode: 'alltag', status: progress.placeStatus(s.id) });
    }
  }
  out.push({ kind: 'goal', mode: 'alltag' });
  const cur = out.findIndex((x) => x.kind === 'ms' && x.status !== 'done');
  if (cur >= 0) out[cur].current = true;
  return { list: out, current: cur };
}

function alltagStats(list, current) {
  const ms = list.filter((x) => x.kind === 'ms');
  const done = ms.filter((x) => x.status === 'done').length;
  const all = list.filter((x) => x.kind === 'ms' || x.kind === 'planned').length;
  const here = list[current] || ms.at(-1);
  const pct = all ? Math.round((done / all) * 100) : 0;
  const stat = (b, span, extra, cls = '') => h(`div.stat${cls}`, h('b', b), h('span', span), extra);
  return h('div.stats',
    stat(here ? here.m.icon : '🏁', here ? here.level.name : 'Alltag'),
    stat(`${pct}%`, 'of the road', h('div.bar', h('i', { style: `width:${pct}%` }))),
    stat(`${done}/${all}`, 'places'),
    stat(`${ms.length}`, 'places ready', null, '.opt'),
    stat(`${progress.cardStreak()}🔥`, 'card days', null, '.opt'));
}

/** Switch between the two roads; sits in the pinned header. */
const roadTabs = (mode) => h('nav.road-tabs', { 'aria-label': 'Roads' },
  h(`a.grammar${mode === 'grammar' ? '.on' : ''}`, { href: '#/road', 'aria-current': mode === 'grammar' ? 'page' : null }, '📘 Grammatik'),
  h(`a.alltag${mode === 'alltag' ? '.on' : ''}`, { href: '#/alltag', 'aria-current': mode === 'alltag' ? 'page' : null }, '🗺 Alltag · Wörter'));

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
    stat(progress.wordsLearned(), 'words known', null, '.opt'),
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

/** mode: 'grammar' (concepts, A1 → C1) or 'alltag' (places, words by where you meet them). */
/** Cheat sheet cards beside the grammar road: one per level, with how many of its lessons are done. */
function sheetRail(road) {
  return h('aside.sheet-rail', { 'aria-label': 'Cheat sheets' }, h('div.sheet-rail-title', '📄 Cheat sheets'),
    road.levels.filter((lv) => lv.milestones?.length).map((lv) => {
      const done = lv.milestones.filter((m) => progress.lessonState(m.id)?.done).length;
      return h('a.sheet-card', { href: `#/sheet/${lv.id}`, title: `${lv.id} cheat sheet` },
        h('b', lv.id), h('span', lv.name), h('small', `${done} / ${lv.milestones.length} lessons`),
        h('div.bar', h('i', { style: `width:${Math.round((done / lv.milestones.length) * 100)}%` })));
    }));
}

export async function renderRoad(view, { at, mode = 'grammar' } = {}) {
  const road = await getRoadmap();
  const alltag = mode === 'alltag' ? await getAlltag() : null;
  document.title = alltag ? 'Alltag · Deutschweg' : 'Deutschweg · A1 → C1';
  const { list, current } = alltag ? alltagItems(alltag) : items(road);
  const zones = alltag ? alltag.chapters.map((c) => [c.id, c.name]) : road.levels.map((lv) => [lv.id, lv.id]);

  const page = h(`div.road-page${alltag ? '.alltag-theme' : ''}`);
  const wrap = h('div.road');
  page.append(
    h('div.road-top', roadTabs(mode), alltag ? alltagStats(list, current) : stats(road, list, current), today(road)), // all stay pinned while you scroll
    h('div.road-intro',
      h('p', alltag
        ? 'Your words, by the places you need them: from the airport to your own flat, the uni and work. Scroll up to see what\'s ahead.'
        : 'Your grammar road from A1 to C1. Every stop is one concept. Scroll up to see what\'s ahead.'),
      h('div.road-jump', zones.map(([id, label]) => h('button.btn.small', { type: 'button', onclick: () => scrollToNode(wrap, `zone-${id}`) }, label)),
        h('button.btn.small.primary', { type: 'button', onclick: () => scrollToNode(wrap, 'current') }, '📍 Du bist hier'))),
    wrap);
  view.replaceChildren(alltag ? page : h('div.road-shell', sheetRail(road), page));

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
      h('div.sign', h('b', x.level.sign ?? `${x.level.id} · ${x.level.name}`), h('small', x.level.goal),
        x.level.milestones?.[0]?.id?.startsWith(x.level.id.toLowerCase()) ? h('a.sheet-link', { href: `#/sheet/${x.level.id}` }, '📄 Cheat sheet') : null));
  }
  const side = p.x > cx + 4 ? 'left' : 'right'; // label points toward the middle
  const skipped = x.kind === 'ms' && x.mode !== 'alltag' && progress.isSkipped(x.m.id);
  const cls = [x.kind === 'gate' ? 'gate' : x.kind === 'goal' ? 'goal' : '', x.kind === 'planned' ? 'locked' : x.status, skipped ? 'skipped' : '', side, x.current ? 'current' : ''].filter(Boolean).join(' ');

  if (x.kind === 'goal') {
    return h(`div.ms.${cls.replace(/ /g, '.')}`, { style }, h('div.ms-dot', '🏆'),
      x.mode === 'alltag'
        ? h('div.ms-label', { style: 'cursor:default' }, h('b', 'Ziel: Zuhause in Deutschland'), h('small', 'The words for every place in your new life.'))
        : h('div.ms-label', { style: 'cursor:default' }, h('b', 'Ziel: C1'), h('small', 'Fluent, precise German for work and life.')));
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
    dot = x.mode === 'alltag' ? (x.status === 'done' ? '✓' : x.m.icon)
      : x.kind === 'planned' ? '🔒' : x.status === 'done' ? (progress.isSkipped(x.m.id) ? '⏭' : '✓') : String(n + 1);
    title = x.m.title;
    sub = x.m.concept;
  }
  const frac = x.kind === 'ms' && x.status === 'progress' ? (x.mode === 'alltag' ? progress.placeFraction : progress.stepFraction)(x.m.id) : 0;
  const ring = frac ? (() => {
    const c = 2 * Math.PI * 30;
    return h('span', { html: `<svg class="ring" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="none" stroke="var(--line)" stroke-width="4"/><circle cx="32" cy="32" r="30" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c * frac} ${c}"/></svg>` });
  })() : null;
  const label = `${title}: ${x.kind === 'planned' ? 'coming soon' : x.status === 'done' ? (skipped ? 'skipped' : 'done') : x.status === 'progress' ? 'in progress' : 'not started'}`;

  const el = h(`div.ms.${cls.replace(/ /g, '.')}`, { style, 'data-key': x.kind === 'ms' ? `ms-${x.m.id}` : `${x.kind}-${x.level.id}-${title}` },
    x.current ? h('div.you-are-here', 'Du bist hier') : null,
    h('button.ms-dot', { type: 'button', onclick: open, 'aria-label': label }, ring, dot),
    h('button.ms-label', { type: 'button', onclick: open, tabindex: '-1' }, h('b', { lang: 'de' }, title), h('small', sub)));
  if (x.kind === 'ms' && canHover) {
    el.addEventListener('mouseenter', () => peek(x, el));
    el.addEventListener('mouseleave', leaveSoon);
    el.addEventListener('focusin', () => peek(x, el));
    el.addEventListener('focusout', leaveSoon);
  }
  return el;
}

/** Where "Start/Continue" goes: the first lesson step not visited yet. */
function lessonHref(x) {
  if (x.mode === 'alltag') {
    const st = progress.placeState(x.m.id);
    return `#/place/${x.m.id}/${x.status === 'new' ? 'words' : PLACE_STEPS.find(([s]) => !st?.steps?.[s])?.[0] || 'practice'}`;
  }
  const st = progress.lessonState(x.m.id);
  const step = x.status === 'new' ? 'learn' : STEPS.find(([s]) => !st?.steps?.[s])?.[0] || 'practice';
  return `#/lesson/${x.m.id}/${step}`;
}

/* ---------- Hover peek: the milestone's mind map; click the map to expand ---------- */
const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
let peekTimer;
let hideTimer;
let peekId;

function unpeek() {
  clearTimeout(peekTimer);
  clearTimeout(hideTimer);
  peekId = null;
  document.querySelector('.peek')?.remove();
}

// a short grace period lets the mouse travel from the milestone onto the card
function leaveSoon() {
  clearTimeout(peekTimer);
  clearTimeout(hideTimer);
  hideTimer = setTimeout(unpeek, 300);
}

function peek(x, el) {
  clearTimeout(peekTimer);
  clearTimeout(hideTimer);
  if (peekId === x.m.id && document.querySelector('.peek')) return;
  peekId = x.m.id;
  // short delay so sweeping the mouse along the road doesn't flash cards
  peekTimer = setTimeout(async () => {
    let lesson;
    try { lesson = x.mode === 'alltag' ? placeAsLesson(await getPlace(x.m.id)) : await getLesson(x.m.id); } catch { return; }
    if (peekId !== x.m.id || document.querySelector('.sheet, .mm-modal-backdrop')) return;
    document.querySelector('.peek')?.remove();
    const href = lessonHref(x);
    const expand = () => { unpeek(); openMindmapModal(lesson, { lessonHref: href }); };
    const map = h('div.peek-map', {
      role: 'button', tabindex: '0', title: 'Click to expand', 'aria-label': `Expand the mind map: ${lesson.title}`,
      onclick: expand, onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), expand()),
    });
    const card = h('div.peek', { onmouseenter: () => clearTimeout(hideTimer), onmouseleave: leaveSoon },
      h('div.peek-head', h('b', `🧠 ${lesson.title}`), h('span.muted', x.mode === 'alltag' ? lesson.wordlist : `${lesson.exercises.length} exercises`)),
      map,
      lesson.tip ? h('div.peek-tip', { html: `💡 ${md(lesson.tip)}` }) : null,
      h('div.peek-foot',
        h('span.muted', '🔍 Click the map to expand'),
        h('a.btn.small', { href, onclick: unpeek }, x.mode === 'alltag' ? 'Open place →' : 'Open lesson →')));
    el.closest('.road-page').append(card);
    renderMindmapPreview(map, lesson.mindmap);
    Object.assign(card.style, placePeek(el, card.offsetWidth, card.offsetHeight));
    requestAnimationFrame(() => card.classList.add('on'));
  }, 220);
}
addEventListener('scroll', unpeek, { passive: true });

/**
 * Put the hover card beside the stop, on the side away from its label, level with it, so the
 * stop, its label and the road around it stay clickable. Falls back to above/below when narrow.
 */
function placePeek(el, w, hgt) {
  const gap = 18;
  const dot = el.querySelector('.ms-dot').getBoundingClientRect();
  const label = el.querySelector('.ms-label').getBoundingClientRect();
  const labelRight = label.left > dot.left;
  const box = [dot, label];
  const minX = Math.min(...box.map((b) => b.left));
  const maxX = Math.max(...box.map((b) => b.right));
  const right = innerWidth - (document.querySelector('.side')?.getBoundingClientRect().width || 0);
  const roomLeft = minX - gap - 12;
  const roomRight = right - maxX - gap - 12;
  const minTop = (document.querySelector('.road-top')?.getBoundingClientRect().bottom ?? 56) + 8; // below the pinned stats
  const top = Math.min(Math.max(minTop, dot.top + dot.height / 2 - hgt / 2), innerHeight - hgt - 12);
  // prefer the side without the label; otherwise whichever side has room
  const sides = labelRight ? ['left', 'right'] : ['right', 'left'];
  for (const side of sides) {
    if (side === 'left' && roomLeft >= w) return { left: `${minX - gap - w}px`, top: `${top}px` };
    if (side === 'right' && roomRight >= w) return { left: `${maxX + gap}px`, top: `${top}px` };
  }
  const left = Math.min(Math.max(16, dot.left + dot.width / 2 - w / 2), innerWidth - w - 16);
  const above = dot.top - hgt - 30;
  return { left: `${left}px`, top: `${above > minTop ? above : Math.min(dot.bottom + 70, innerHeight - hgt - 12)}px` };
}

function closeSheet() {
  document.querySelectorAll('.sheet, .sheet-backdrop').forEach((e) => e.remove());
  document.removeEventListener('keydown', escClose);
}
const escClose = (e) => e.key === 'Escape' && closeSheet();

async function sheet(x) {
  closeSheet();
  unpeek();
  const card = h(`div.sheet${x.mode === 'alltag' ? '.alltag-theme' : ''}`, { role: 'dialog', 'aria-modal': 'true' });
  document.body.append(h('div.sheet-backdrop', { onclick: closeSheet }), card);
  document.addEventListener('keydown', escClose);
  const close = h('button.btn', { type: 'button', onclick: closeSheet }, 'Schließen');

  if (x.mode === 'alltag') return placeSheet(x, card, close);
  if (x.kind === 'planned') {
    append(card, h('span.chip', `${x.level.id} · coming soon`), h('h2', x.m.title), h('p', x.m.concept),
      h('p.muted', `The ${x.level.id} lessons arrive in a later phase. Keep going on the road; they build on what comes before.`), h('div.row', close));
  } else if (x.kind === 'gate') {
    const c = progress.checkpointState(x.level.id);
    append(card, h('span.chip.accent', `${x.level.id} Checkpoint`), h('h2', `${x.level.id} geschafft?`),
      h('p', `A mixed quiz with questions from every ${x.level.id} milestone. Score ${Math.round(progress.passMark() * 100)}% to pass the gate.`),
      c ? h('p.muted', `Best so far: ${Math.round(c.best * 100)}%${c.passed ? ' · passed ✓' : ''}`) : null,
      h('div.row', close, h('a.btn', { href: `#/sheet/${x.level.id}`, onclick: closeSheet }, '📄 Cheat sheet'),
        h('a.btn.primary', { href: `#/checkpoint/${x.level.id}`, onclick: closeSheet }, c?.passed ? 'Retake' : 'Start checkpoint')));
  } else {
    const st = progress.lessonState(x.m.id);
    const go = h('a.btn.primary', { href: lessonHref(x), onclick: closeSheet },
      x.status === 'new' ? 'Start' : x.status === 'done' ? 'Review' : 'Continue');
    const meta = h('div.meta', h('span.chip.accent', x.level.id));
    append(card, meta, h('h2', x.m.title), h('p', x.m.concept),
      st?.best ? h('p.muted', `Best practice score: ${Math.round(st.best * 100)}%${st.done && !st.skipped ? ' · milestone reached ✓' : ''}`) : null,
      st?.skipped ? h('p.muted', '⏭ Skipped. Pass its exercises any time to complete it properly.') : null,
      h('div.row', close, go));
    go.focus();
    try {
      const lesson = await getLesson(x.m.id);
      meta.append(h('span.chip', `${lesson.exercises.length} exercises`), h('span.chip', `⏱ ${lesson.minutes} min`));
      // no hover on touch screens, so the mind map preview lives in the sheet instead
      if (!canHover) {
        const map = h('div.sheet-map', {
          role: 'button', tabindex: '0', title: 'Tap to expand',
          onclick: () => { closeSheet(); openMindmapModal(lesson, { lessonHref: lessonHref(x) }); },
        });
        card.querySelector('.row').before(map);
        renderMindmapPreview(map, lesson.mindmap);
      }
    } catch {
      go.replaceWith(h('span.muted', 'This lesson file is missing.'));
    }
  }
}

/** Tap a place on the Alltag road: what's there, then Start / Continue. */
async function placeSheet(x, card, close) {
  if (x.kind === 'planned') {
    append(card, h('span.chip', `${x.level.name} · coming soon`), h('h2', `${x.m.icon} ${x.m.title}`), h('p', x.m.concept),
      h('p.muted', 'This place is being written. The places before it are ready.'), h('div.row', close));
    return;
  }
  const st = progress.placeState(x.m.id);
  const go = h('a.btn.primary', { href: lessonHref(x), onclick: closeSheet }, x.status === 'new' ? 'Start' : x.status === 'done' ? 'Review' : 'Continue');
  const meta = h('div.meta', h('span.chip.accent', x.level.name));
  append(card, meta, h('h2', `${x.m.icon} ${x.m.title}`), h('p', x.m.concept),
    st?.best ? h('p.muted', `Best practice score: ${Math.round(st.best * 100)}%${st.done ? ' · geschafft ✓' : ''}`) : null,
    h('div.row', close, go));
  go.focus();
  try {
    const place = await getPlace(x.m.id);
    meta.append(h('span.chip', `${placeWords(place).length} words`), h('span.chip', `${place.phrases.length} Sätze`), h('span.chip', `${place.exercises.length} exercises`));
    if (!canHover) {
      const map = h('div.sheet-map', { role: 'button', tabindex: '0', title: 'Tap to expand', onclick: () => { closeSheet(); openMindmapModal(placeAsLesson(place), { lessonHref: lessonHref(x) }); } });
      card.querySelector('.row').before(map);
      renderMindmapPreview(map, placeMap(place));
    }
  } catch {
    go.replaceWith(h('span.muted', 'This place file is missing.'));
  }
}

// Node.append prints null as text; drop optional (null) parts first
const append = (el, ...kids) => el.append(...kids.filter((k) => k != null));
