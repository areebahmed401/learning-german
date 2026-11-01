// Typing German on a US keyboard: ä/ö/ü/ß may be typed as a/o/u/ss or ae/oe/ue/ss.
// Two spellings of a word count as the same when either folding makes them equal.

/** ä→a, ö→o, ü→u, ß→ss (lower case) */
export const toPlain = (s) =>
  String(s).toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');

/** ä→ae, ö→oe, ü→ue, ß→ss (lower case) */
export const toDigraph = (s) =>
  String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');

/** Both spellings a typed word may match: "über" → ["uber", "ueber"]. */
export const umlautKeys = (s) => [...new Set([toPlain(s), toDigraph(s)])];

/** "uber", "ueber" and "über" all match "über"; "Strasse" matches "Straße". */
export const sameIgnoringUmlauts = (typed, target) =>
  toPlain(typed) === toPlain(target) || toDigraph(typed) === toDigraph(target);
