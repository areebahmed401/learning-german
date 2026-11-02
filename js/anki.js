// Anki export: a tab-separated file with Anki's import headers.
// Front = German (article coloured), back = English + forms, tags = level and lesson.
const COLORS = { der: '#2f6fd6', die: '#d64560', das: '#1f9460' };
const clean = (s) => String(s ?? '').replace(/[\t\n\r]/g, ' ');

export function front(w) {
  if (w.pos === 'noun' && w.article) return `<span style="color:${COLORS[w.article]}"><b>${w.article}</b></span> ${clean(w.de)}`;
  return clean(w.de);
}

export function forms(w) {
  if (w.pos === 'noun') return w.plural && w.plural !== '-' ? `Pl.: die ${w.plural}` : 'no plural';
  if (w.pos === 'verb' && w.p2) return `${w.aux === 'sein' ? 'ist' : 'hat'} ${w.p2}${w.sep ? ' · separable' : ''}`;
  return '';
}

export function toTSV(rows) {
  const lines = ['#separator:tab', '#html:true', '#tags column:3'];
  for (const { word, tags } of rows) {
    const f = forms(word);
    const back = clean(word.en) + (f ? `<br><small>${clean(f)}</small>` : '');
    lines.push([front(word), back, tags.join(' ')].join('\t'));
  }
  return lines.join('\n') + '\n';
}

export function download(rows, filename) {
  const blob = new Blob([toTSV(rows)], { type: 'text/tab-separated-values;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const placeRows = (place, words) =>
  words.map((word) => ({
    word,
    tags: [`Deutschweg::Alltag::${place.id}`, word.level && `Deutschweg::${word.level}`, word.goethe && `Goethe::${word.goethe}`].filter(Boolean),
  }));

export const lessonRows = (lesson) =>
  lesson.words.map((word) => ({
    word,
    tags: [`Deutschweg::${lesson.level}`, `Deutschweg::${lesson.level}::${lesson.id}`, word.goethe && `Goethe::${word.goethe}`].filter(Boolean),
  }));
