# Learning German: notes for agents

Personal German study app (A1 → C1) for one learner. They use the **Learn German** YouTube courses and Anki. Their roadmap starts at A1; **speaking is their weakest skill**. Plain HTML/CSS/JS (ES modules), no build step, no npm dependencies. All content lives in JSON under `data/`.

## Commands
- Dev server: `python -m http.server 8137` (ES modules need http, not file://), then open http://localhost:8137
- Content check: `python scripts/validate_content.py`
- Engine tests: `node --test tests/`

## Layout
- `index.html`, `css/app.css`: shell and theme tokens (light/dark via `[data-theme]` + `prefers-color-scheme`)
- `js/app.js`: hash router: `#/road`, `#/lesson/<id>/<step>`, `#/checkpoint/<LEVEL>`
- `js/road.js`: the scrollable road (A1 at the bottom, C1 at the top)
- `js/lesson.js`: lesson steps learn · words · mindmap · practice · speak
- `js/exercises.js`, `js/mindmap.js`, `js/speech.js`, `js/progress.js`, `js/anki.js`
- `js/translator/`: verbformen-style lookup (`panel.js` UI, `dictionary.js`, `conjugate.js`, `decline.js`, `online.js`)
- `data/roadmap.json`: levels → milestones (lesson ids in road order); B2/C1 have `planned` concepts
- `data/lessons/<level>/<id>.json`: one lesson per file; the file name is `<id>.json`
- `data/dictionary/core.json`, `data/dictionary/strong-verbs.json`: translator data

## Lesson JSON schema (see `data/lessons/a1/a1-05-artikel.json` for a full example)
```jsonc
{
  "id": "a1-05-artikel",          // matches the file name and the roadmap entry
  "level": "A1",
  "title": "Artikel & Genus",      // German title shown on the road
  "concept": "Articles and gender: der, die, das, ein, eine",  // one-line English summary
  "wordlist": "Familie",           // wordlist theme name, shown on the road
  "minutes": 25,
  "youtube": "https://www.youtube.com/results?search_query=Learn+German+A1+articles+der+die+das",
  "learn": [                       // 2–4 sections
    {
      "heading": "…",
      "text": "Short explanation in English. **bold** allowed. 2–5 sentences.",
      "table": { "head": ["…"], "rows": [["…"]] },   // optional
      "examples": [ { "de": "…", "en": "…" } ]          // 2–6 real-life sentences
    }
  ],
  "tip": "One memory hook / mnemonic.",                 // optional
  "words": [                       // 15–25 words for the wordlist theme
    { "de": "Mutter", "en": "mother", "pos": "noun", "article": "die", "plural": "Mütter" },  // plural without article; "-" if none
    { "de": "aufstehen", "en": "to get up", "pos": "verb", "aux": "sein", "sep": "auf", "p2": "aufgestanden" },
    { "de": "schön", "en": "beautiful", "pos": "adj" },
    { "de": "heute", "en": "today", "pos": "adv" }     // pos: noun|verb|adj|adv|phrase|prep|pron|conj|num
  ],
  "mindmap": { "label": "…", "children": [ { "label": "…", "note": "optional hook", "children": [] } ] },  // 3–6 branches, depth ≤ 3
  "exercises": [                   // 10–14 items, mixing types
    { "type": "mc", "q": "…", "options": ["…","…","…"], "answer": 1, "explain": "…" },
    { "type": "gap", "q": "Das ist ___ Vater.", "answer": ["mein"], "explain": "…" },          // exactly one ___
    { "type": "article", "word": "Tisch", "answer": "der", "explain": "…" },
    { "type": "order", "words": ["ich","Heute","arbeite"], "answer": "Heute arbeite ich", "explain": "…" },  // answer = the words joined by spaces, no final punctuation
    { "type": "match", "pairs": [["die Mutter","mother"],["der Vater","father"]], "explain": "…" },          // 4–5 pairs
    { "type": "translate", "en": "…", "answer": ["…","accepted alternative"], "explain": "…" }
  ],
  "speak": {
    "shadow": [ { "de": "…", "en": "…" } ],                 // 4–6 sentences to listen to and repeat
    "prompts": [ { "q": "German question", "qEn": "English", "model": "Model answer in German", "hint": "optional" } ]  // 2–4 role-play prompts
  }
}
```

## Content rules
- German must be correct, natural, standard German (Hochdeutsch). Use ß and umlauts (never ae/oe/ue).
- Stay inside the lesson's level: earlier grammar is fine, later grammar is not.
- Examples come from real life in Germany: Bäcker, Arzt, Amt, WG, Arbeit, Uni, Bahn, Supermarkt.
- Every exercise has an `explain` that says *why* the answer is right.
- Gap/translate answers list every reasonable correct variant. Comparison ignores case and final punctuation.
- Keep it calm: short explanations and one table per section, at most.
