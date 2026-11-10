// German noun and adjective declension. Pure functions.

const ART = {
  der: { nom: 'der', akk: 'den', dat: 'dem', gen: 'des' },
  die: { nom: 'die', akk: 'die', dat: 'der', gen: 'der' },
  das: { nom: 'das', akk: 'das', dat: 'dem', gen: 'des' },
};
const ART_PL = { nom: 'die', akk: 'die', dat: 'den', gen: 'der' };
const ART_INDEF = {
  der: { nom: 'ein', akk: 'einen', dat: 'einem', gen: 'eines' },
  die: { nom: 'eine', akk: 'eine', dat: 'einer', gen: 'einer' },
  das: { nom: 'ein', akk: 'ein', dat: 'einem', gen: 'eines' },
};
const CASES = ['nom', 'akk', 'dat', 'gen'];

const PLURAL_ONLY = new Set(['Eltern', 'Geschwister', 'Leute', 'Ferien', 'Kosten', 'Möbel', 'Großeltern', 'Schulden', 'Zinsen']);
// one-syllable (mostly foreign) words that take only -s in the genitive
const GEN_S = new Set(['Film', 'Job', 'Test', 'Team', 'Chat', 'Club', 'Pub', 'Typ', 'Clip', 'Hit']);
// masculine weak nouns with their own ending
const WEAK_END = { Herr: 'n', Nachbar: 'n' };
const WEAK_SET = new Set(['Herr', 'Mensch', 'Held', 'Prinz', 'Graf', 'Narr', 'Bär', 'Nachbar', 'Bauer', 'Fürst', 'Hirt', 'Kamerad']);
const WEAK_SUFFIX = /(ent|ant|ist|at|oge|ot|et|graf|krat|loge)$/;
const NS_SUFFIX = /(name|gedanke|buchstabe|funke|glaube|haufe|wille|friede)$/i;

function syllables(w) {
  return (w.toLowerCase().match(/[aeiouäöüy]+/g) || []).length;
}

function cleanGen(gen, de) {
  if (!gen) return null;
  let g = String(gen).split(/[,/]/)[0].trim();
  g = g.replace('(e)', 'e');
  if (/^-?\(?e?\)?s$/.test(g)) return null;
  return g || null;
}

function isWeak(de, article, plural, flag) {
  if (flag === true) return true;
  if (flag === false) return false;
  if (article !== 'der' || !plural || plural === '-') return false;
  if (WEAK_SET.has(de)) return true;
  if (de.endsWith('e') && plural === de + 'n') return true;
  if (WEAK_SUFFIX.test(de) && plural === de + 'en') return true;
  return false;
}

function weakEnding(de) {
  if (WEAK_END[de]) return WEAK_END[de];
  return /(e|er)$/.test(de) ? 'n' : 'en';
}

function genitiveSg(de, article, gen, weak) {
  const given = cleanGen(gen, de);
  if (given) return given;
  if (article === 'die') return de;
  if (weak) {
    const w = de + weakEnding(de);
    return NS_SUFFIX.test(de) ? w + 's' : w;
  }
  if (de === 'Herz') return 'Herzens';
  if (GEN_S.has(de)) return de + 's';
  const syl = syllables(de);
  if (/nis$/i.test(de)) return de + 'ses';
  if (syl >= 2 && /(us|os)$/i.test(de)) return de;
  if (/(s|ß|x|z|sch)$/.test(de)) return de + 'es';
  if (syl === 1) return de + 'es';
  return de + 's';
}

export function declineNoun({ de, article, plural, gen, weak, plOnly }) {
  const pluralOnly = plOnly === true || (plural === '-' && article === 'die' && PLURAL_ONLY.has(de));
  const hasPlural = pluralOnly || (plural && plural !== '-');
  const plWord = pluralOnly ? de : hasPlural ? plural : null;

  let pl;
  if (plWord) {
    const datWord = /[ns]$/.test(plWord) ? plWord : plWord + 'n';
    pl = {
      nom: `${ART_PL.nom} ${plWord}`, akk: `${ART_PL.akk} ${plWord}`,
      dat: `${ART_PL.dat} ${datWord}`, gen: `${ART_PL.gen} ${plWord}`,
    };
  } else {
    pl = { nom: '–', akk: '–', dat: '–', gen: '–' };
  }
  // indefinite: ein/eine in the singular, no article in the plural (Kinder, mit Kindern)
  const plain = (forms) => Object.fromEntries(Object.entries(forms).map(([c, f]) => [c, f === '–' ? f : f.replace(/^\S+ /, '')]));
  if (pluralOnly) return { sg: null, pl, indef: { sg: null, pl: plain(pl) } };

  const a = ART[article] || ART.der;
  const w = isWeak(de, article, plural, weak);
  let akk = de, dat = de;
  if (w) { akk = dat = de + weakEnding(de); }
  else if (de === 'Herz') { dat = 'Herzen'; }
  const g = genitiveSg(de, article, gen, w);
  const sg = {
    nom: `${a.nom} ${de}`, akk: `${a.akk} ${akk}`, dat: `${a.dat} ${dat}`, gen: `${a.gen} ${g}`,
  };
  if (w && plural === '-') pl = { nom: '–', akk: '–', dat: '–', gen: '–' };
  const i = ART_INDEF[article] || ART_INDEF.der;
  const indefSg = { nom: `${i.nom} ${de}`, akk: `${i.akk} ${akk}`, dat: `${i.dat} ${dat}`, gen: `${i.gen} ${g}` };
  return { sg, pl, indef: { sg: indefSg, pl: plain(pl) } };
}

// ---- adjectives -------------------------------------------------------------

const IRREGULAR = {
  gut: { comp: 'besser', sup: 'best' },
  viel: { comp: 'mehr', sup: 'meist' },
  gern: { comp: 'lieber', sup: 'liebst' },
  hoch: { comp: 'höher', sup: 'höchst', stem: 'hoh' },
  nah: { comp: 'näher', sup: 'nächst' },
  groß: { comp: 'größer', sup: 'größt' },
};
const UMLAUT = new Set(['alt', 'jung', 'kalt', 'warm', 'lang', 'kurz', 'arm', 'stark', 'schwach', 'klug', 'dumm', 'oft',
  'hart', 'scharf', 'krank', 'gesund', 'schwarz', 'nass', 'grob']);

function umlaut(w) {
  // last a/o/u in the stem becomes ä/ö/ü (alt -> ält, jung -> jüng, klug -> klüg)
  const idx = [...w].map((c, k) => (/[aou]/.test(c) ? k : -1)).filter((k) => k >= 0).pop();
  if (idx === undefined) return w;
  const map = { a: 'ä', o: 'ö', u: 'ü' };
  return w.slice(0, idx) + map[w[idx]] + w.slice(idx + 1);
}

// stem used before endings (dunkel -> dunkl, teuer -> teur, hoch -> hoh)
function declStem(adj, irr) {
  if (irr && irr.stem) return irr.stem;
  if (/[^aeiouäöüy]el$/.test(adj) && adj.length > 4) return adj.slice(0, -2) + 'l';
  if (/(eu|au)er$/.test(adj)) return adj.slice(0, -2) + 'r';
  return adj;
}

function addEnding(stem, ending) {
  return stem.endsWith('e') && ending.startsWith('e') ? stem + ending.slice(1) : stem + ending;
}

function compBase(adj) {
  return UMLAUT.has(adj) ? umlaut(adj) : adj;
}

function comparativeOf(adj) {
  const b = compBase(adj);
  if (/[^aeiouäöüy]el$/.test(adj) && adj.length > 4) return b.slice(0, -2) + 'ler';
  if (/(eu|au)er$/.test(adj)) return b.slice(0, -2) + 'rer';
  return addEnding(b, 'er');
}

function superlativeOf(adj) {
  const b = compBase(adj);
  return /(d|t|s|ß|z|sch|x)$/.test(b) ? b + 'est' : b + 'st';
}

const ENDINGS = {
  strong: {
    m: ['er', 'en', 'em', 'en'], f: ['e', 'e', 'er', 'er'], n: ['es', 'es', 'em', 'en'], pl: ['e', 'e', 'en', 'er'],
  },
  weak: {
    m: ['e', 'en', 'en', 'en'], f: ['e', 'e', 'en', 'en'], n: ['e', 'e', 'en', 'en'], pl: ['en', 'en', 'en', 'en'],
  },
  mixed: {
    m: ['er', 'en', 'en', 'en'], f: ['e', 'e', 'en', 'en'], n: ['es', 'es', 'en', 'en'], pl: ['en', 'en', 'en', 'en'],
  },
};

// articles that go with the tables (strong: none)
export const ADJ_ARTICLES = {
  strong: null,
  weak: {
    m: ['der', 'den', 'dem', 'des'], f: ['die', 'die', 'der', 'der'], n: ['das', 'das', 'dem', 'des'], pl: ['die', 'die', 'den', 'der'],
  },
  mixed: {
    m: ['ein', 'einen', 'einem', 'eines'], f: ['eine', 'eine', 'einer', 'einer'], n: ['ein', 'ein', 'einem', 'eines'], pl: ['keine', 'keine', 'keinen', 'keiner'],
  },
};

export function declineAdjective(adj, strongAdj) {
  const word = typeof adj === 'string' ? adj : adj.de;
  const irr = IRREGULAR[word] || null;
  const ov = strongAdj || {};
  const comparative = ov.comparative || (irr ? irr.comp : comparativeOf(word));
  const supBase = ov.superlative || (irr ? irr.sup : superlativeOf(word));
  const superlative = supBase.startsWith('am ') ? supBase : 'am ' + supBase + 'en';
  const stem = declStem(word, irr);
  const table = (type) => {
    const out = {};
    for (const g of ['m', 'f', 'n', 'pl']) {
      out[g] = {};
      CASES.forEach((c, i) => { out[g][c] = addEnding(stem, ENDINGS[type][g][i]); });
    }
    return out;
  };
  return { positive: word, comparative, superlative, strong: table('strong'), weak: table('weak'), mixed: table('mixed') };
}
