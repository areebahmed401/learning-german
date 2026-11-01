// German verb conjugation. Pure functions, no DOM, no fetch.
// conjugate(entry, strongVerbs) -> { infinitive, reflexive, sep, aux, p1, p2, zuInfinitive, tenses, imperativ }

export const PERSONS = ['ich', 'du', 'er', 'wir', 'ihr', 'sie'];
const REFL = ['mich', 'dich', 'sich', 'uns', 'euch', 'sich'];

// separable prefixes, longest first (spec list + a few common compound ones)
const SEP_PREFIXES = [
  'zusammen', 'entgegen', 'zurück', 'heraus', 'herein', 'hinaus', 'hinein', 'vorbei', 'weiter',
  'fern', 'fest', 'los', 'mit', 'nach', 'weg', 'her', 'hin', 'vor', 'bei', 'ein', 'aus', 'auf', 'ab', 'an', 'zu',
].sort((a, b) => b.length - a.length);

// inseparable prefixes: no ge- in the Partizip II
const INSEP_PREFIXES = ['miss', 'emp', 'ent', 'zer', 'unter', 'über', 'wider', 'hinter', 'ver', 'be', 'er', 'ge'];

// valid German syllable onset followed by a vowel (used to avoid false prefix matches)
const ONSET = /^(?:sch[lmnrtw]?|spr|spl|str|[bdfgkp][lr]|kn|qu|pf|ph|th|tr|zw|sp|st|[bcdfghjklmnpqrstvwxyz])?[aeiouäöüy]/;

// look like prefix + strong verb but are regular
const NOT_DERIVED = new Set(['bereiten', 'begleiten', 'verleiten', 'erreichen', 'verwenden']);

// verbs that take sein although the base verb (or the default) would not
const SEIN_VERBS = new Set([
  'aufstehen', 'aufwachen', 'einschlafen', 'passieren', 'begegnen', 'entkommen', 'entstehen', 'entlaufen',
  'entgehen', 'entfallen', 'erscheinen', 'erwachen', 'ertrinken', 'verreisen', 'verunglücken', 'geraten',
  'verfallen', 'vergehen', 'ergehen', 'verbleiben', 'folgen', 'reisen', 'wandern', 'landen',
  'misslingen', 'wachsen', 'einziehen', 'umziehen', 'umfallen',
]);

const SPECIAL = {
  sein: {
    pres: ['bin', 'bist', 'ist', 'sind', 'seid', 'sind'], praet: ['war', 'warst', 'war', 'waren', 'wart', 'waren'],
    p2: 'gewesen', aux: 'sein', k2: ['wäre', 'wärst', 'wäre', 'wären', 'wärt', 'wären'],
    imp: { du: 'sei', ihr: 'seid', Sie: 'seien' }, p1: 'seiend',
  },
  haben: {
    pres: ['habe', 'hast', 'hat', 'haben', 'habt', 'haben'], praet: ['hatte', 'hattest', 'hatte', 'hatten', 'hattet', 'hatten'],
    p2: 'gehabt', aux: 'haben', k2: ['hätte', 'hättest', 'hätte', 'hätten', 'hättet', 'hätten'],
    imp: { du: 'hab', ihr: 'habt', Sie: 'haben' },
  },
  werden: {
    pres: ['werde', 'wirst', 'wird', 'werden', 'werdet', 'werden'], praet: ['wurde', 'wurdest', 'wurde', 'wurden', 'wurdet', 'wurden'],
    p2: 'geworden', aux: 'sein', k2: ['würde', 'würdest', 'würde', 'würden', 'würdet', 'würden'],
    imp: { du: 'werde', ihr: 'werdet', Sie: 'werden' },
  },
  wissen: {
    pres: ['weiß', 'weißt', 'weiß', 'wissen', 'wisst', 'wissen'], praet: ['wusste', 'wusstest', 'wusste', 'wussten', 'wusstet', 'wussten'],
    p2: 'gewusst', aux: 'haben', k2: ['wüsste', 'wüsstest', 'wüsste', 'wüssten', 'wüsstet', 'wüssten'],
    imp: { du: 'wisse', ihr: 'wisst', Sie: 'wissen' },
  },
  tun: {
    pres: ['tue', 'tust', 'tut', 'tun', 'tut', 'tun'], praet: ['tat', 'tatest', 'tat', 'taten', 'tatet', 'taten'],
    p2: 'getan', aux: 'haben', k2: ['täte', 'tätest', 'täte', 'täten', 'tätet', 'täten'],
    imp: { du: 'tu', ihr: 'tut', Sie: 'tun' }, p1: 'tuend',
  },
  können: modal(['kann', 'kannst', 'kann', 'können', 'könnt', 'können'], 'konnte', 'gekonnt', 'könnte'),
  müssen: modal(['muss', 'musst', 'muss', 'müssen', 'müsst', 'müssen'], 'musste', 'gemusst', 'müsste'),
  dürfen: modal(['darf', 'darfst', 'darf', 'dürfen', 'dürft', 'dürfen'], 'durfte', 'gedurft', 'dürfte'),
  sollen: modal(['soll', 'sollst', 'soll', 'sollen', 'sollt', 'sollen'], 'sollte', 'gesollt', 'sollte'),
  wollen: modal(['will', 'willst', 'will', 'wollen', 'wollt', 'wollen'], 'wollte', 'gewollt', 'wollte'),
  mögen: modal(['mag', 'magst', 'mag', 'mögen', 'mögt', 'mögen'], 'mochte', 'gemocht', 'möchte'),
  möchten: modal(['möchte', 'möchtest', 'möchte', 'möchten', 'möchtet', 'möchten'], 'wollte', 'gewollt', 'möchte'),
};

function weakForms(past) { // past ends in -te: 'konnte' -> konnte, konntest, ...
  const w = past.slice(0, -1);
  return [w + 'e', w + 'est', w + 'e', w + 'en', w + 'et', w + 'en'];
}
function k2Forms(k) { // 'könnte' -> könnte, könntest, ...
  return [k, k + 'st', k, k + 'n', k + 't', k + 'n'];
}
function modal(pres, past, p2, k2) {
  return { pres, praet: weakForms(past), p2, aux: 'haben', k2: k2Forms(k2), imp: null };
}

const AUX_PRES = {
  haben: ['habe', 'hast', 'hat', 'haben', 'habt', 'haben'],
  sein: ['bin', 'bist', 'ist', 'sind', 'seid', 'sind'],
};
const AUX_PRAET = {
  haben: ['hatte', 'hattest', 'hatte', 'hatten', 'hattet', 'hatten'],
  sein: ['war', 'warst', 'war', 'waren', 'wart', 'waren'],
};
const WERDEN_PRES = ['werde', 'wirst', 'wird', 'werden', 'werdet', 'werden'];
const WUERDE = ['würde', 'würdest', 'würde', 'würden', 'würdet', 'würden'];

// ---- helpers --------------------------------------------------------------

function weakStem(inf) {
  if (/(eln|ern)$/.test(inf)) return inf.slice(0, -1);
  if (inf.endsWith('en')) return inf.slice(0, -2);
  if (inf.endsWith('n')) return inf.slice(0, -1);
  return inf;
}

// stem needs an extra -e- before -st/-t/-te (arbeitest, öffnest, rechnest, atmest)
function needsE(stem) {
  if (/[dt]$/.test(stem)) return true;
  if (/chn$/.test(stem)) return true;
  const m = stem.match(/([^aeiouäöüy])[mn]$/);
  return !!m && !/[lrhmn]/.test(m[1]);
}

function insepPrefix(base) {
  for (const pre of INSEP_PREFIXES) {
    if (!base.startsWith(pre)) continue;
    const rem = base.slice(pre.length);
    if (rem.length >= 4 && /[aeiouäöü]/.test(rem) && rem[0] !== rem[1]) return pre;
  }
  return null;
}

function detectSep(de, strong) {
  for (const pre of SEP_PREFIXES) {
    if (!de.startsWith(pre)) continue;
    const rem = de.slice(pre.length);
    if (strong[rem] || SPECIAL[rem]) return pre;
    if (rem.length >= 5 && ONSET.test(rem) && /n$/.test(rem)) return pre;
  }
  return null;
}

function resolveStrong(base, strong) {
  if (NOT_DERIVED.has(base)) return null;
  if (strong[base]) return { data: strong[base], prefix: '' };
  for (const pre of INSEP_PREFIXES) {
    if (!base.startsWith(pre)) continue;
    const d = strong[base.slice(pre.length)];
    if (d) return { data: d, prefix: pre };
  }
  return null;
}

function presentRegular(base) {
  const stem = weakStem(base);
  const e = needsE(stem);
  let ich = stem + 'e';
  if (/eln$/.test(base)) ich = stem.slice(0, -2) + 'le';
  const du = stem + (/[sßzx]$/.test(stem) ? 't' : e ? 'est' : 'st');
  const er = stem + (e ? 'et' : 't');
  return [ich, du, er, base, er, base];
}

function duFromPres3(pres3, stemEndsT) {
  if (/dt$/.test(pres3)) return pres3.slice(0, -1) + 'st';
  if (stemEndsT) return pres3 + 'st';
  const s = pres3.slice(0, -1);
  return s + (/[sßzx]$/.test(s) ? 't' : 'st');
}

function praetStrong(P) {
  if (P.endsWith('te')) return weakForms(P);
  if (P.endsWith('e')) return [P, P + 'st', P, P + 'n', P + 't', P + 'n'];
  const du = P + (/[dtsßzx]$|sch$/.test(P) ? 'est' : 'st');
  const ihr = P + (/[dt]$/.test(P) ? 'et' : 't');
  return [P, du, P, P + 'en', ihr, P + 'en'];
}

function praetRegular(base) {
  const stem = weakStem(base);
  return weakForms(stem + (needsE(stem) ? 'e' : '') + 'te');
}

// ---- main -----------------------------------------------------------------

export function conjugate(entry, strongVerbs = {}) {
  const strong = strongVerbs || {};
  let de = String(entry.de || '').trim();
  let reflexive = false;
  if (/^sich\s+/i.test(de)) { reflexive = true; de = de.replace(/^sich\s+/i, ''); }
  const infinitive = de;

  // separable prefix
  let sep = null;
  let base = de;
  if (entry.sep) {
    if (de.startsWith(entry.sep) && de.length > entry.sep.length + 2) { sep = entry.sep; base = de.slice(sep.length); }
  } else if (!strong[de] && !SPECIAL[de]) {
    const p = detectSep(de, strong);
    if (p) { sep = p; base = de.slice(p.length); }
  }

  const special = SPECIAL[base] || null;
  const res = special ? null : resolveStrong(base, strong);
  const data = res ? res.data : null;
  const prefix = res ? res.prefix : '';
  const inseparable = !special && (prefix || (!data && insepPrefix(base)) || /ieren$/.test(base));
  const stem = weakStem(base);
  const stemEndsT = /t$/.test(stem);

  // ---- finite forms (without reflexive pronoun / separable prefix)
  let pres, praet, k2 = null, p2;
  if (special) {
    pres = special.pres; praet = special.praet; k2 = special.k2; p2 = special.p2;
  } else if (data) {
    const pres3 = data.pres ? prefix + data.pres : null;
    const reg = presentRegular(base);
    pres = pres3 ? [reg[0], duFromPres3(pres3, stemEndsT), pres3, reg[3], reg[4], reg[5]] : reg;
    praet = praetStrong(prefix + data.praet);
    if (data.k2) k2 = k2Forms(prefix + data.k2);
    p2 = prefix && data.p2.startsWith('ge') ? prefix + data.p2.slice(2) : prefix ? prefix + data.p2 : data.p2;
  } else {
    pres = presentRegular(base);
    praet = praetRegular(base);
    p2 = (inseparable ? '' : 'ge') + (/eln$|ern$/.test(base) ? stem : stem + (needsE(stem) ? 'e' : '')) + 't';
  }
  if (!special && sep && data) p2 = data.p2.startsWith('ge') && prefix ? prefix + data.p2.slice(2) : data.p2;
  if (sep) p2 = sep + p2;
  if (entry.p2) p2 = entry.p2;

  // ---- auxiliary
  let aux = 'haben';
  if (special) aux = special.aux;
  else if (data) aux = prefix && data.aux === 'sein' ? 'haben' : data.aux;
  if (SEIN_VERBS.has(infinitive)) aux = 'sein';
  if (reflexive) aux = 'haben';
  if (entry.aux === 'haben' || entry.aux === 'sein') aux = entry.aux;

  // ---- sentence assembly
  const pron = (i) => (reflexive ? REFL[i] : '');
  const join = (...parts) => parts.filter(Boolean).join(' ');
  const finite = (forms) => forms.map((f, i) => join(f, pron(i), sep));
  const infFull = infinitive;

  const tenses = {
    praesens: finite(pres),
    praeteritum: finite(praet),
    perfekt: AUX_PRES[aux].map((a, i) => join(a, pron(i), p2)),
    plusquamperfekt: AUX_PRAET[aux].map((a, i) => join(a, pron(i), p2)),
    futur1: WERDEN_PRES.map((w, i) => join(w, pron(i), infFull)),
    konjunktiv2: k2 ? finite(k2) : WUERDE.map((w, i) => join(w, pron(i), infFull)),
  };
  for (const [name, forms] of Object.entries(tenses)) {
    tenses[name] = Object.fromEntries(PERSONS.map((p, i) => [p, forms[i]]));
  }

  // ---- imperative
  let imperativ;
  if (special && !special.imp) {
    imperativ = { du: null, ihr: null, Sie: null };
  } else {
    let duForm, ihrForm, sieForm;
    if (special) {
      duForm = special.imp.du; ihrForm = special.imp.ihr; sieForm = special.imp.Sie;
    } else {
      const core3 = data && data.pres ? data.pres : null;
      if (core3 && !/[äöü]/.test(core3)) {
        const p3 = prefix + core3;
        duForm = /tt$/.test(p3) ? p3 : p3.slice(0, -1);
      } else if (/eln$/.test(base)) {
        duForm = stem.slice(0, -2) + 'le';
      } else if (/ern$/.test(base)) {
        duForm = stem + 'e';
      } else {
        duForm = stem + (needsE(stem) || /ig$/.test(stem) ? 'e' : '');
      }
      ihrForm = pres[4];
      sieForm = base;
    }
    imperativ = {
      du: join(duForm, reflexive ? 'dich' : '', sep) + '!',
      ihr: join(ihrForm, reflexive ? 'euch' : '', sep) + '!',
      Sie: join(sieForm, 'Sie', reflexive ? 'sich' : '', sep) + '!',
    };
  }

  return {
    infinitive,
    reflexive,
    sep,
    aux,
    p1: (special && special.p1) || infinitive + 'd',
    p2,
    zuInfinitive: sep ? sep + 'zu' + base : 'zu ' + base,
    tenses,
    imperativ,
  };
}
