// App shell: router (#/road, #/alltag, #/place, #/lesson, #/checkpoint, #/cards, #/quiz, #/settings), theme, settings menu, translator panel, checkpoint quizzes.
import { h, getRoadmap, getJSON, lessonURL, shuffle, toast, getAlltag, getPlace, placeWords } from './util.js';
import { renderRoad } from './road.js';
import { renderLesson } from './lesson.js';
import { renderPlace } from './place.js';
import { renderCards } from './cards.js';
import { renderQuiz } from './quiz.js';
import { renderSettings } from './settings.js';
import { runQuiz } from './exercises.js';
import * as progress from './progress.js';
import * as anki from './anki.js';
import { day } from './srs.js';
import './speech.js';

const view = document.getElementById('view');

async function route() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(query));
  document.querySelectorAll('.sheet, .sheet-backdrop, .peek, .mm-modal-backdrop').forEach((e) => e.remove());
  document.body.classList.toggle('on-cards', ['cards', 'quiz'].includes(parts[0])); // the dock would cover the answer buttons
  const score = progress.quizState().days[day()];
  document.getElementById('dock-quiz').textContent = score != null ? `today ✓ ${Math.round(score * 100)}%` : 'daily grammar';
  try {
    if (parts[0] === 'lesson' && parts[1]) {
      await renderLesson(view, parts[1], parts[2]);
      window.scrollTo(0, 0);
    } else if (parts[0] === 'place' && parts[1]) {
      await renderPlace(view, parts[1], parts[2]);
      window.scrollTo(0, 0);
    } else if (parts[0] === 'alltag') {
      await renderRoad(view, { ...params, mode: 'alltag' });
    } else if (parts[0] === 'cards') {
      await renderCards(view);
      window.scrollTo(0, 0);
    } else if (parts[0] === 'quiz') {
      await renderQuiz(view);
      window.scrollTo(0, 0);
    } else if (parts[0] === 'settings') {
      await renderSettings(view);
      window.scrollTo(0, 0);
    } else if (parts[0] === 'checkpoint' && parts[1]) {
      await renderCheckpoint(view, parts[1].toUpperCase());
      window.scrollTo(0, 0);
    } else {
      await renderRoad(view, params);
    }
  } catch (e) {
    console.error(e);
    view.replaceChildren(h('div.lesson', h('div.card', h('h2', 'Hoppla!'), h('p', 'This page could not be loaded.'),
      h('p.muted', String(e.message)), h('a.btn', { href: '#/road' }, '← Zurück zur Straße'))));
  }
}

async function renderCheckpoint(view, level) {
  const road = await getRoadmap();
  const lv = road.levels.find((l) => l.id === level && l.milestones?.length);
  if (!lv) throw new Error(`No checkpoint for ${level}`);
  document.title = `${level} Checkpoint · Deutschweg`;
  const lessons = (await Promise.all(lv.milestones.map((m) => getJSON(lessonURL(level, m.id)).catch(() => null)))).filter(Boolean);
  // two questions from every lesson, skipping match grids (too slow for a quick test)
  const pool = lessons.flatMap((l) => shuffle(l.exercises.filter((e) => e.type !== 'match')).slice(0, 2));
  const items = shuffle(pool).map((e, i) => ({ ...e, _i: i }));
  const body = h('section');
  view.replaceChildren(h('article.lesson',
    h('header.lesson-head', h('a.back', { href: '#/road' }, '← Zurück zur Straße'), h('h1', `${level} Checkpoint`),
      h('p', `${items.length} questions from all ${lessons.length} ${level} milestones. Pass with ${Math.round(progress.passMark() * 100)}%.`)),
    body));
  runQuiz(body, items, {
    label: 'Frage',
    onFinish: ({ score, right, total }) => {
      const c = progress.recordCheckpoint(level, score);
      const pass = score >= progress.passMark();
      body.replaceChildren(h('div.card', h(`div.result${pass ? '' : '.fail'}`,
        h('div.score', `${Math.round(score * 100)}%`),
        h('p', `${right} of ${total} right. `, pass ? `${level} geschafft! 🎉 The gate is open.` : 'Not yet. Review the milestones with red mistakes and try again.'),
        c.passed && !pass ? h('p.muted', 'You already passed this checkpoint before.') : null,
        h('div.speak-row', { style: 'justify-content:center' },
          h('button.btn', { onclick: () => renderCheckpoint(view, level) }, '↺ New checkpoint'),
          h('a.btn.primary', { href: '#/road' }, 'Zur Straße →')))));
    },
  });
}

/* ---------- Theme ---------- */
document.getElementById('theme-btn').onclick = () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('lg-theme', root.dataset.theme); } catch {}
};

/* ---------- Settings menu ---------- */
const menu = document.getElementById('menu');
const menuBtn = document.getElementById('menu-btn');
const setMenu = (open) => { menu.hidden = !open; menuBtn.setAttribute('aria-expanded', open); };
menuBtn.onclick = (e) => { e.stopPropagation(); setMenu(menu.hidden); };
document.addEventListener('click', (e) => { if (!menu.contains(e.target)) setMenu(false); });
menu.addEventListener('click', async (e) => {
  const act = e.target.closest('button')?.dataset.act;
  if (!act) return;
  setMenu(false);
  if (act === 'settings') location.hash = '#/settings';
  if (act === 'export') progress.exportFile();
  if (act === 'reset' && confirm('Reset all progress on this device? Save a progress file first if you want to keep it.')) {
    progress.reset();
    route();
    toast('Progress reset');
  }
  if (act === 'anki-all') {
    const alltag = await getAlltag();
    const rows = [];
    const byKey = new Map(); // a word met in several places is one note, tagged with every place
    for (const s of alltag.chapters.flatMap((c) => c.stops)) {
      const p = await getPlace(s.id).catch(() => null);
      for (const r of p ? anki.placeRows(p, placeWords(p)) : []) {
        const k = `${r.word.article || ''} ${r.word.de}`;
        if (byKey.has(k)) byKey.get(k).tags.push(r.tags[0]);
        else { byKey.set(k, r); rows.push(r); }
      }
    }
    anki.download(rows, 'deutschweg-all-words.txt');
    toast(`${rows.length} words exported for Anki`);
  }
});
document.getElementById('import-file').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try { await progress.importFile(f); toast('Progress loaded'); route(); } catch (err) { toast(err.message); }
  e.target.value = '';
  setMenu(false);
};

/* ---------- Translator side panel / mobile drawer ---------- */
const trBtn = document.getElementById('tr-btn');
const mobile = matchMedia('(max-width: 900px)');
try { if (localStorage.getItem('lg-side') === 'hidden') document.body.classList.add('side-hidden'); } catch {}
trBtn.setAttribute('aria-expanded', !document.body.classList.contains('side-hidden'));
trBtn.onclick = () => {
  const hidden = document.body.classList.toggle('side-hidden');
  trBtn.setAttribute('aria-expanded', !hidden);
  try { localStorage.setItem('lg-side', hidden ? 'hidden' : 'shown'); } catch {}
};
const openDrawer = () => {
  document.body.classList.add('drawer-open');
  document.querySelector('#translator input')?.focus();
};
document.getElementById('fab').onclick = openDrawer;
// desktop: fold the panel away (⟩) and bring it back from the edge tab
document.getElementById('side-collapse').onclick = () => trBtn.click();
document.getElementById('side-rail').onclick = () => { trBtn.click(); document.querySelector('#translator input')?.focus(); };
document.getElementById('side-close').onclick = () => document.body.classList.remove('drawer-open');
window.addEventListener('lg:lookup', () => {
  if (mobile.matches) openDrawer();
  else if (document.body.classList.contains('side-hidden')) trBtn.click();
});

import('./translator/panel.js')
  .then((m) => m.initTranslator(document.getElementById('translator')))
  .catch((e) => {
    console.error(e);
    document.getElementById('translator').replaceChildren(h('p.muted', 'The translator could not load.'));
  });

window.addEventListener('hashchange', route);
route();
