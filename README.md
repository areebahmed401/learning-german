# Deutschweg: my road from A1 to C1

A calm, personal German study app. It's a scrollable **road** where every stop is one grammar concept with its wordlist, and the road shows where I am and what's left. It's built to sit next to the **Learn German** YouTube courses and Anki.

**Live:** https://areebahmed401.github.io/learning-german/

## What's inside
- **The road:** A1 → A2 → B1 → B2 → C1. Milestones show as done ✓, in progress (ring) or ahead; a level checkpoint gate ends each level, and the "Du bist hier" marker shows where I am.
- **Lessons in 5 steps:** *Lernen* (rule, table, examples with audio) · *Wörter* (wordlist, colour-coded der/die/das, Anki export) · *Mindmap* (foldable rule map) · *Üben* (6 exercise types with explanations; review your mistakes) · *Sprechen* (listen & shadow with mic feedback, free-answer prompts with model answers).
- **Translator** (side panel / phone drawer): English or German → German with the full grammar (articles, plurals, declension tables, all verb tenses and adjective endings), in the style of verbformen.com. It works offline for the built-in words and falls back to an online lookup for everything else.
- **Anki:** "⬇ Anki" on a wordlist, or ⚙ → *Export all words*, saves a `.txt` file. In Anki: *File → Import*, then pick the file (the fields are tab-separated; the tags hold the level and lesson).
- **Progress** is stored in the browser. ⚙ → *Save my progress* writes a file you can load on another device.

Mic transcription uses the Web Speech API (Chrome or Edge). Audio uses your system's German voice; Edge's "Natural" voices sound best.

## Run locally
```bash
python -m http.server 8137
```
Then open http://localhost:8137.

## Checks
```bash
python scripts/validate_content.py
node --test tests/*.test.mjs
```

## Adding content
Lessons are JSON files in `data/lessons/<level>/`; the road order is `data/roadmap.json`. The schema and content rules are in [CLAUDE.md](CLAUDE.md).

## Phases
1. App, translator, speaking practice, Anki export, A1 + A2 + B1 lessons ← *current*
2. B2 lessons
3. C1 lessons
