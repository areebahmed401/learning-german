// Online helpers (MyMemory translation, German Wiktionary grammar). Never throw; send only the searched word.

const TIMEOUT_MS = 6000;

async function getJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(s) {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export async function translateOnline(text, from, to) {
  try {
    const q = String(text || '').trim();
    if (!q) return [];
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${encodeURIComponent(from)}|${encodeURIComponent(to)}`;
    const data = await getJson(url);
    if (!data) return [];
    const out = [];
    const add = (t) => {
      if (typeof t !== 'string') return;
      const s = decodeEntities(t).trim();
      if (!s || /MYMEMORY WARNING|INVALID/i.test(s)) return;
      if (s.toLowerCase() === q.toLowerCase()) return;
      if (!out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
    };
    add(data.responseData && data.responseData.translatedText);
    const matches = Array.isArray(data.matches) ? data.matches : [];
    for (const m of matches) {
      if (out.length >= 4) break;
      add(m && m.translation);
    }
    return out.slice(0, 4);
  } catch {
    return [];
  }
}

// ---- Wiktionary ---------------------------------------------------------------

async function wikitext(page) {
  const url = `https://de.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&origin=*`;
  const data = await getJson(url);
  const t = data && data.parse && data.parse.wikitext;
  return typeof t === 'string' ? t : t && t['*'] ? t['*'] : null;
}

function cleanValue(v) {
  return String(v || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/'''?/g, '')
    .trim();
}

// Return the key=value pairs of the first template whose name starts with `name`.
function parseTemplate(text, name) {
  const start = text.indexOf('{{' + name);
  if (start < 0) return null;
  let depth = 0;
  let i = start;
  let end = -1;
  for (; i < text.length - 1; i++) {
    if (text[i] === '{' && text[i + 1] === '{') { depth++; i++; }
    else if (text[i] === '}' && text[i + 1] === '}') { depth--; i++; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) return null;
  const body = text.slice(start + 2, end - 2);
  const params = {};
  // split on top-level "|" (ignore pipes inside [[ ]] or {{ }})
  let level = 0;
  let cur = '';
  const parts = [];
  for (let k = 0; k < body.length; k++) {
    const c = body[k];
    const two = body.slice(k, k + 2);
    if (two === '[[' || two === '{{') { level++; cur += two; k++; continue; }
    if (two === ']]' || two === '}}') { level--; cur += two; k++; continue; }
    if (c === '|' && level === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur);
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    params[p.slice(0, eq).trim()] = cleanValue(p.slice(eq + 1));
  }
  return params;
}

const first = (v) => String(v || '').split(/[,;/]/)[0].trim();
const GENUS = { m: 'der', f: 'die', n: 'das' };

export async function wiktionaryNoun(word) {
  try {
    const w = String(word || '').trim();
    if (!w) return null;
    const text = await wikitext(w);
    if (!text) return null;
    const p = parseTemplate(text, 'Deutsch Substantiv Übersicht');
    if (!p) return null;
    const genus = first(p['Genus'] || p['Genus 1']).toLowerCase();
    const article = GENUS[genus];
    if (!article) return null;
    let plural = first(p['Nominativ Plural'] || p['Nominativ Plural 1'] || '');
    if (!plural || /^[-–—]+$/.test(plural)) plural = '-';
    const gen = first(p['Genitiv Singular'] || p['Genitiv Singular 1'] || '') || null;
    return { article, plural, gen };
  } catch {
    return null;
  }
}

export async function wiktionaryVerb(inf) {
  try {
    const w = String(inf || '').trim();
    if (!w) return null;
    const text = await wikitext(w);
    if (!text) return null;
    const p = parseTemplate(text, 'Deutsch Verb Übersicht');
    if (!p) return null;
    const praet = first(p['Präteritum_ich']);
    const p2 = first(p['Partizip II']);
    const aux = first(p['Hilfsverb']).toLowerCase();
    if (!praet && !p2) return null;
    return { praet, p2, aux: aux === 'sein' ? 'sein' : 'haben' };
  } catch {
    return null;
  }
}
