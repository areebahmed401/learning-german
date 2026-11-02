// Small DOM and data helpers shared by the views.

/** h('div.card', {onclick}, child, 'text', ...) */
export function h(tag, attrs, ...kids) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (attrs != null && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Escape, then allow **bold** and *italic*. */
export const md = (s) =>
  esc(s ?? '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');

/** "der Vater" with the article coloured; used for nouns everywhere. */
export function nounHTML(w) {
  if (w.pos === 'noun' && w.article) return `<span class="g-${w.article}">${w.article}</span> ${esc(w.de)}`;
  return esc(w.de);
}

export function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const cache = new Map();
export function getJSON(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json();
    }).catch((e) => { cache.delete(url); throw e; }));
  }
  return cache.get(url);
}

export const getRoadmap = () => getJSON('data/roadmap.json');
export const getAlltag = () => getJSON('data/alltag.json');
export const getPlace = (id) => getJSON(`data/places/${id}.json`);
/** Every word of a place, each with its area name (the spot where you meet it). */
export const placeWords = (place) => place.areas.flatMap((a) => a.words.map((w) => ({ ...w, area: a.name })));
export const lessonURL = (level, id) => `data/lessons/${level.toLowerCase()}/${id}.json`;

export async function getLesson(id) {
  const road = await getRoadmap();
  const level = road.levels.find((l) => l.milestones?.some((m) => m.id === id));
  if (!level) throw new Error(`Unknown lesson ${id}`);
  return getJSON(lessonURL(level.id, id));
}

export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2600);
}

export const sayBtn = (text, speak) =>
  h('button.say', { type: 'button', title: 'Listen', 'aria-label': `Listen: ${text}`, onclick: () => speak(text) }, '🔊');
