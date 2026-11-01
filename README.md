# Deutschweg: my road from A1 to C1

A calm, personal German study app. It's a scrollable **road** where every stop is one grammar concept with its wordlist, and the road shows where I am and what's left. It's built to sit next to the **Learn German** YouTube courses and Anki.

**Live:** https://areebahmed401.github.io/learning-german/

## What's inside
- **The road:** A1 → A2 → B1 → B2 → C1. Milestones show as done ✓, in progress (ring) or ahead; a level checkpoint gate ends each level, and the "Du bist hier" marker shows where I am.
- **Lessons in 5 steps:** *Lernen* (rule, table, examples with audio) · *Wörter* (wordlist, colour-coded der/die/das, Anki export) · *Mindmap* (foldable rule map) · *Üben* (6 exercise types with explanations; review your mistakes) · *Sprechen* (listen & shadow with mic feedback, free-answer prompts with model answers).
- **⏭ Skip what you know:** on a lesson's *Üben* step, "I know this, skip" marks the stop done without the exercises and opens the next lesson. Skipped stops show ⏭ on the road. To finish the level you still have to pass its checkpoint. Passing the exercises later turns a skipped stop into a normal one, and "Undo skip" reopens it.
- **Translator** (side panel / phone drawer): English or German → German with the full grammar (articles, plurals, declension tables, all verb tenses and adjective endings), in the style of verbformen.com. It works offline for the built-in words and falls back to an online lookup for everything else.
- **Goethe word lists:** every A1, A2 and B1 lesson word is on the official Goethe-Zertifikat word list for that level (or a lower one), and carries a small *Goethe A1/A2/B1* badge. The Goethe-Institut publishes no lists for B2 and C1, so those wordlists are my own selection.
- **🃏 Karten (flashcards):** a few minutes a day with every word up to your level: the lesson words plus the translator's core words that are on the Goethe list for those levels (about 1,100 at A1). You can also pick the lessons you've opened or a single level. Flip a card, then answer *Nochmal* or *Gewusst*. A word you miss comes back in the same session until you get it right; a word you know comes back after 1, 3, 7, 14, then 30 days. New words a day (15 by default, +10 more on request), an English → German mode for speaking recall, a streak and a list of your hardest words.
- **⚡ Tagesquiz (daily grammar quiz):** 10 quick questions a day from your level and the levels below, the same set all day. Questions you get wrong come back in later quizzes until you answer them right; "One more round" gives a fresh set. The *Heute* strip on the road shows today's quiz score and your streaks.
- **📈 Adaptive difficulty** (on by default, ⚙ Settings): the app speeds up while you do well and eases off when you struggle.
  - *Karten:* new cards a day go up by 5 (to 50) when you get 90%+ right on the first try, and down when you're below 70% or reviews pile up. A brand-new word you already know comes back in 3 days, not tomorrow. Once you know 80% of your level's words, the next level's words join the deck.
  - *Tagesquiz:* at 85%+ in your recent answers you get "stretch" questions from the next level; below 60% you get more review and old mistakes. The question types you miss most come up more often.
  - When both say a level is down, the road suggests its checkpoint ("🎯 Ready for A2?"). Passing it moves your level up, even with stops left on the road.
- **⚙ Settings:** adaptive mode, your level (or follow the road automatically), new cards a day, deck, card direction, read aloud, quiz length and theme.
- **Calm road:** hover a stop and its preview opens beside it, never on top of the road; the translator folds away to an edge tab (⟩).
- **Anki:** "⬇ Anki" on a wordlist, or ⚙ → *Export all words*, saves a `.txt` file. In Anki: *File → Import*, then pick the file (the fields are tab-separated; the tags hold the level, the lesson and the Goethe level).
- **No umlaut keys needed:** in exercises and the translator, type ä/ö/ü as a/o/u or ae/oe/ue and ß as ss. It counts as right, and the app shows you the proper spelling.
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
python scripts/goethe_check.py   # optional: needs the Goethe PDFs in references/goethe/ (not in the repo)
```

## Adding content
Lessons are JSON files in `data/lessons/<level>/`; the road order is `data/roadmap.json`. The schema and content rules are in [CLAUDE.md](CLAUDE.md).

## Phases
1. App, translator, speaking practice, Anki export, A1 + A2 + B1 lessons ✓
2. B2 lessons (13 milestones) ✓
3. C1 lessons (13 milestones) ✓
