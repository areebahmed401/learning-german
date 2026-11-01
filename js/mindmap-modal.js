// Full-size mind map in a pop-up (from the road's hover card or the lesson's Mindmap step).
import { h, md } from './util.js';
import { renderMindmap } from './mindmap.js';

export function closeMindmapModal() {
  document.querySelector('.mm-modal-backdrop')?.remove();
  document.removeEventListener('keydown', onKey);
  opener?.focus?.();
  opener = null;
}

let opener = null;
const onKey = (e) => e.key === 'Escape' && closeMindmapModal();

/** lessonHref: show an "open lesson" button (left out when already inside the lesson). */
export function openMindmapModal(lesson, { lessonHref } = {}) {
  closeMindmapModal();
  opener = document.activeElement;
  const map = h('div.mindmap-wrap.mm-modal-map');
  const close = h('button.icon-btn', { type: 'button', 'aria-label': 'Close mind map', onclick: closeMindmapModal }, '✕');
  const dialog = h('div.mm-modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': `Mind map: ${lesson.title}` },
    h('div.mm-modal-head',
      h('div', h('b', `🧠 ${lesson.title}`), h('div.muted', `${lesson.concept} · 🗂 ${lesson.wordlist}`)),
      h('div.mm-modal-actions',
        lessonHref ? h('a.btn.small.primary', { href: lessonHref, onclick: closeMindmapModal }, 'Open lesson →') : null,
        close)),
    h('p.muted.mm-modal-hint', 'Tap a branch to fold it, then try to recall what was inside.'),
    map,
    lesson.tip ? h('div.peek-tip', { html: `💡 ${md(lesson.tip)}` }) : null);
  const backdrop = h('div.mm-modal-backdrop', { onclick: (e) => e.target === backdrop && closeMindmapModal() }, dialog);
  document.body.append(backdrop);
  document.addEventListener('keydown', onKey);
  renderMindmap(map, lesson.mindmap);
  close.focus();
}
