// Text-to-speech (de-DE) and speech recognition for shadowing practice.
const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = !!Recognition;
export const canSpeak = !!synth;

let voice = null;
function pickVoice() {
  const voices = synth?.getVoices() ?? [];
  const de = voices.filter((v) => v.lang?.toLowerCase().startsWith('de'));
  // prefer natural/online voices (Edge "Natural", Chrome "Google Deutsch")
  voice = de.find((v) => /natural|online/i.test(v.name)) || de.find((v) => /google/i.test(v.name)) || de[0] || null;
}
if (synth) {
  pickVoice();
  synth.addEventListener?.('voiceschanged', pickVoice);
}

export function speak(text, { slow = false } = {}) {
  if (!synth) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  if (voice) u.voice = voice;
  u.rate = slow ? 0.7 : 0.95;
  synth.speak(u);
}
window.lgSpeak = speak;

/** Listen once; resolves with the best transcript ('' on silence). */
export function listen() {
  return new Promise((resolve, reject) => {
    if (!Recognition) return reject(new Error('unsupported'));
    const r = new Recognition();
    r.lang = 'de-DE';
    r.interimResults = false;
    r.maxAlternatives = 1;
    let said = '';
    r.onresult = (e) => { said = Array.from(e.results).map((x) => x[0].transcript).join(' '); };
    r.onerror = (e) => (e.error === 'no-speech' ? resolve('') : reject(new Error(e.error)));
    r.onend = () => resolve(said);
    r.start();
  });
}

export const norm = (s) =>
  s.toLowerCase().replace(/[.,!?;:„“"«»()–—-]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Compare a target sentence with what was heard.
 * Returns the target words, each marked hit or missed (LCS alignment), plus a 0–1 score.
 */
export function compare(target, heard) {
  const t = target.split(/\s+/).filter(Boolean);
  const tn = t.map(norm);
  const h = norm(heard).split(' ').filter(Boolean);
  const dp = Array.from({ length: tn.length + 1 }, () => new Array(h.length + 1).fill(0));
  for (let i = tn.length - 1; i >= 0; i--)
    for (let j = h.length - 1; j >= 0; j--)
      dp[i][j] = tn[i] === h[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const words = [];
  let i = 0, j = 0;
  while (i < tn.length) {
    if (j < h.length && tn[i] === h[j]) { words.push({ w: t[i], hit: true }); i++; j++; }
    else if (j < h.length && dp[i][j + 1] >= dp[i + 1][j]) j++;
    else { words.push({ w: t[i], hit: !tn[i] }); i++; }
  }
  const real = words.filter((x) => norm(x.w));
  return { words, score: real.length ? real.filter((x) => x.hit).length / real.length : 0 };
}
