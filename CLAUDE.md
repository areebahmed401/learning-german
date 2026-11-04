# Learning German: notes for agents

Personal German study app (A1 → C1) for one learner. They use the **Learn German** YouTube courses and Anki. Their roadmap starts at A1; **speaking is their weakest skill**. Plain HTML/CSS/JS (ES modules), no build step, no npm dependencies. All content lives in JSON under `data/`.

## Commands
- Dev server: `python -m http.server 8137` (ES modules need http, not file://), then open http://localhost:8137
- Content check: `python scripts/validate_content.py`
- Engine tests: `node --test tests/*.test.mjs`
- Goethe check (local only): `python -I scripts/goethe_check.py` reports A1–B1 place words that are on no official Goethe-Zertifikat list; `--badges` writes the `goethe` field (and that level) into place words and core.json. It needs the three Goethe PDFs in `references/goethe/` (gitignored) and `pdftotext`; it skips quietly without them, so it is not in CI.

## Layout
- `index.html`, `css/app.css`: shell and theme tokens (light/dark via `[data-theme]` + `prefers-color-scheme`)
- `js/app.js`: hash router: `#/road`, `#/lesson/<id>/<step>`, `#/checkpoint/<LEVEL>`, `#/cards`, `#/quiz`, `#/settings`
- `js/place.js`: a place on the Alltag road (`#/place/<id>/<step>`: words · phrases · practice · speak); progress in progress.js `places` (`placeState`, `recordPlacePractice`, `placeStatus`)
- `js/road.js`: draws both roads: `#/road` (grammar, A1 at the bottom, C1 at the top) and `#/alltag` (places from `data/alltag.json`, chapters drawn as zones, violet via `.alltag-theme` while grammar stays green; `"soon": true` stops show locked until their file exists), the pinned stats + *Heute* strip (streaks; Quiz and Karten are the bottom dock in index.html), and the hover preview (placed beside the stop, never over the road)
- `js/settings.js`: the settings page. Settings live in progress.js (`settings()`, `setSettings()`); `currentLevel(road)` is the level setting, or the first level with unfinished stops when it is `auto`
- `js/adapt.js`: adaptive difficulty rules (pure, tested in `tests/adapt.test.mjs`): `nextNewCards`, `mastery`, `quizPlan`, `readyToAdvance`. Its inputs live in progress.js: `cardStats` (first tries per day), `quiz.answers` (last 200, `{l, t, ok}`), `adapt` (`cards`: today's new-card number; `mastery`: known share per level, cached by the cards page for the road). With `settings.adaptive`, a passed checkpoint makes `currentLevel` skip that level
- `js/quiz.js`: the daily grammar quiz view; `js/daily.js`: which questions to ask (pure, date-seeded, tested in `tests/daily.test.mjs`). Score and open mistakes live in progress.js (`quiz.days`, `quiz.mistakes`)
- `js/lesson.js`: lesson steps learn · mindmap · practice · speak (grammar only: all vocabulary lives in the Alltag places). The practice step offers "I know this, skip" (`progress.skipLesson`: `done` + `skipped`, drawn ⏭ on the road); a skipped level still needs its checkpoint
- `js/cards.js`: daily flashcards view (deck and new-cards-per-day come from settings). Four ratings after the flip: 1 Nochmal, 2 Schwer, 3 Gut, 0 Leicht (number keys; Enter or Space flips), each button showing its next gap from `srs.preview`. The home page has a statistics panel beside it (`statsPanel`: words by level over every deck word, today, 7-day forecast, 30-day first-try recall, hardest words that open the translator via the `lg:lookup` event, streak); it stacks under 820px and hides during a session. `js/srs.js`: Anki-style scheduling, SM-2 (default) or FSRS, chosen by the setting `algorithm` (pure functions, tested in `tests/srs.test.mjs`); both models are updated on every answer so switching keeps history, and old Leitner cards convert on first use. A word counts as known (`srs.known`) once its review gap is 7 days or more. Card state lives in progress.js (`cards`, `cardDays`) so it is saved with the progress file
- `js/exercises.js` (answers in another verb-second order count via `js/wordorder.js`; gap questions show a dictionary hint), `js/mindmap.js`, `js/speech.js`, `js/progress.js`, `js/anki.js`
- `js/translator/`: verbformen-style lookup (`panel.js` UI, `dictionary.js`, `conjugate.js`, `decline.js`, `online.js`)
- `data/roadmap.json`: levels → milestones (lesson ids in road order). A level can list `planned` concepts (shown locked) instead of milestones until its lessons exist
- `data/lessons/<level>/<id>.json`: one lesson per file; the file name is `<id>.json`
- `data/dictionary/core.json`, `data/dictionary/strong-verbs.json`: translator data. Core words carry `"goethe"` (written by `goethe_check.py --badges`, which also tidies their glosses); the "My level" flashcard deck takes core words up to the learner's level from it

## Lesson JSON schema (see `data/lessons/a1/a1-05-artikel.json` for a full example)
```jsonc
{
  "id": "a1-05-artikel",          // matches the file name and the roadmap entry
  "level": "A1",
  "title": "Artikel & Genus",      // German title shown on the road
  "concept": "Articles and gender: der, die, das, ein, eine",  // one-line English summary
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

## Place JSON schema (Alltag road; see `data/places/flughafen.json`)
`data/alltag.json` lists chapters → stops (`id`, `icon`, `title`, `concept`, optional `"soon": true`) in road order. Each ready stop has `data/places/<id>.json`:
```jsonc
{
  "id": "flughafen", "icon": "✈️", "title": "Flughafen", "en": "Airport",
  "intro": "1–2 English sentences: what you do here.",
  "areas": [ { "name": "Gepäckausgabe", "en": "baggage claim", "words": [  // 8–25 per area, 45–170 per place
    { "de": "Koffer", "en": "suitcase", "pos": "noun", "article": "der", "plural": "Koffer", "level": "A1" },  // plural without article; "-" if none
    { "de": "abholen", "en": "to pick up", "pos": "verb", "aux": "haben", "sep": "ab", "p2": "abgeholt", "level": "A1" },
    { "de": "verspätet", "en": "delayed", "pos": "adj", "level": "A2" }  // pos: noun|verb|adj|adv|phrase|prep|pron|conj|num
  ] } ],  // 4–9 spots
  "phrases": [ { "de": "Ihren Reisepass, bitte.", "en": "…", "who": "staff" /* or "you" */, "level": "A1" } ],  // 10–16
  "exercises": [ /* lesson exercise types, using this place's words */ ],  // 10–14
  "speak": { "shadow": [ … ], "prompts": [ … ] }  // as in lessons
}
```
`goethe_check.py --badges` sets `goethe` on place words found on a Goethe list and sets their `level` to it. It rewrites place files with one word/phrase per line (`dump_place`).

## Content rules
- German must be correct, natural, standard German (Hochdeutsch). Use ß and umlauts (never ae/oe/ue).
- Stay inside the lesson's level: earlier grammar is fine, later grammar is not.
- Examples come from real life in Germany: Bäcker, Arzt, Amt, WG, Arbeit, Uni, Bahn, Supermarkt.
- Every exercise has an `explain` that says *why* the answer is right.
- Gap/translate answers list every reasonable correct variant. Comparison ignores case and final punctuation.
- Exercises use new sentences, never a Learn example word for word (the validator fails copies). A possessive gap ends with whose it is, e.g. `(my)`, `(her)`. Translate prompts with "you" get an automatic du/ihr/Sie hint from the accepted answers (`youHint` in exercises.js), so list only the forms that fit.
- Keep it calm: short explanations and one table per section, at most.
- Put each word in the place where you meet it (lessons have no words). A word may repeat in another place that needs it; keep its level, article and plural the same in every copy (Karten and the Anki export merge repeats). Give each word an honest `level`; after changing words run the Goethe check with `--badges`, which sets `"goethe"` and the level for words on a Goethe list (don't write `goethe` by hand).
- The Goethe PDFs are copyrighted: never commit them or copy their example sentences. Use headwords only and write your own examples.
