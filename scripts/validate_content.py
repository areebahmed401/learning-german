"""Check roadmap, lesson, Alltag road and place JSON files against the schemas in CLAUDE.md.

Usage: python scripts/validate_content.py [lesson-id ...]
Exits 1 if any error is found. Missing lesson files are reported as warnings
(milestones not written yet), unless --strict is given.
"""
import difflib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
POS = {"noun", "verb", "adj", "adv", "phrase", "prep", "pron", "conj", "num"}
EX_TYPES = {"mc", "gap", "article", "order", "match", "translate"}
LEVELS = {"A1", "A2", "B1", "B2", "C1"}
# ae/oe anywhere, or ue not after a vowel/q (Frauen, neue, Quelle) and not in -uell (aktuell)
ASCII_UMLAUT = re.compile(r"\b\w*(?:ae|oe|(?<![aeiouäq])ue(?!ll))\w*\b", re.I)
UMLAUT_OK = {"michael", "israel", "raphael", "poet", "poesie", "aerobic", "manuel", "samuel", "duett", "zuerst"}

errors: list[str] = []
warnings: list[str] = []


def err(where: str, msg: str) -> None:
    errors.append(f"{where}: {msg}")


def need(obj: dict, keys: list[str], where: str) -> bool:
    ok = True
    for k in keys:
        if k not in obj or obj[k] in ("", None, []):
            err(where, f"missing '{k}'")
            ok = False
    return ok


def check_mindmap(node: dict, where: str, depth: int = 0) -> None:
    if not isinstance(node, dict) or not node.get("label"):
        err(where, "mindmap node without label")
        return
    if depth > 3:
        err(where, f"mindmap deeper than 3 at '{node['label']}'")
    for child in node.get("children", []):
        check_mindmap(child, where, depth + 1)


def check_exercise(ex: dict, where: str) -> None:
    t = ex.get("type")
    if t not in EX_TYPES:
        err(where, f"unknown exercise type {t!r}")
        return
    if not ex.get("explain"):
        err(where, "missing 'explain'")
    if t == "mc":
        if need(ex, ["q", "options"], where):
            if not isinstance(ex.get("answer"), int) or not 0 <= ex["answer"] < len(ex["options"]):
                err(where, "mc answer must be an index into options")
    elif t == "gap":
        if need(ex, ["q", "answer"], where):
            if ex["q"].count("___") != 1:
                err(where, "gap q needs exactly one ___")
            if not isinstance(ex["answer"], list):
                err(where, "gap answer must be a list")
    elif t == "article":
        need(ex, ["word", "answer"], where)
        if ex.get("answer") not in ("der", "die", "das"):
            err(where, "article answer must be der/die/das")
    elif t == "order":
        if need(ex, ["words", "answer"], where):
            if sorted(" ".join(ex["words"]).split()) != sorted(ex["answer"].split()):
                err(where, f"order words don't match answer: {ex['answer']!r}")
    elif t == "match":
        if need(ex, ["pairs"], where) and not 3 <= len(ex["pairs"]) <= 6:
            err(where, "match needs 3–6 pairs")
    elif t == "translate":
        if need(ex, ["en", "answer"], where) and not isinstance(ex["answer"], list):
            err(where, "translate answer must be a list")


def check_word(wd: dict, w: str) -> None:
    need(wd, ["de", "en", "pos"], w)
    if wd.get("pos") not in POS:
        err(w, f"bad pos {wd.get('pos')!r}")
    if "goethe" in wd and wd["goethe"] not in ("A1", "A2", "B1"):
        err(w, f"goethe must be A1/A2/B1, got {wd['goethe']!r}")
    if wd.get("pos") == "noun":
        if wd.get("article") not in ("der", "die", "das"):
            err(w, "noun needs article der/die/das")
        if not wd.get("plural"):
            err(w, "noun needs plural (or '-')")
        elif wd["plural"].split()[0] in ("der", "die", "das"):
            err(w, "plural must not include the article")
        if wd.get("de", "")[:1].islower():
            err(w, "noun must be capitalised")
    if wd.get("pos") == "verb":
        if wd.get("aux") not in ("haben", "sein"):
            err(w, "verb needs aux haben/sein")
        if not wd.get("p2"):
            err(w, "verb needs p2 (Partizip II)")
        if wd.get("sep") and not wd["de"].removeprefix("sich ").startswith(wd["sep"]):
            err(w, f"sep {wd['sep']!r} is not a prefix of {wd['de']!r}")


def umlaut_warnings(where: str, texts: list[str]) -> None:
    """Crude ASCII-umlaut check on German text (ae/oe/ue written for ä/ö/ü)."""
    for m in ASCII_UMLAUT.finditer(" ".join(texts)):
        word = m.group(0)
        if word.lower() in UMLAUT_OK or any(c in word for c in "äöüÄÖÜß"):
            continue
        warnings.append(f"{where}: possible ASCII umlaut in {word!r}")


def check_speak(speak: dict, where: str) -> list[str]:
    if len(speak.get("shadow", [])) < 3:
        err(where, "speak.shadow needs at least 3 sentences")
    for p in speak.get("prompts", []):
        need(p, ["q", "qEn", "model"], f"{where} speak.prompts")
    return [s.get("de", "") for s in speak.get("shadow", [])] + [p.get(k, "") for p in speak.get("prompts", []) for k in ("q", "model")]


def check_place(path: Path, stop: dict) -> None:
    """An Alltag place: words grouped by area (each with a level), phrases, exercises, speaking."""
    where = path.relative_to(ROOT).as_posix()
    try:
        place = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        err(where, f"invalid JSON: {e}")
        return
    need(place, ["id", "icon", "title", "en", "intro", "areas", "phrases", "exercises", "speak"], where)
    if place.get("id") != stop["id"]:
        err(where, f"id {place.get('id')!r} != alltag.json id {stop['id']!r}")
    seen: set[str] = set()
    texts: list[str] = []
    total = 0
    for a, area in enumerate(place.get("areas", [])):
        need(area, ["name", "en", "words"], f"{where} areas[{a}]")
        for i, wd in enumerate(area.get("words", [])):
            w = f"{where} {area.get('name', a)}[{i}] {wd.get('de', '?')}"
            check_word(wd, w)
            if wd.get("level") not in LEVELS:
                err(w, f"level must be one of A1–C1, got {wd.get('level')!r}")
            key = f"{wd.get('article', '')} {wd.get('de', '')}"
            if key in seen:
                err(w, "word appears twice in this place")
            seen.add(key)
            texts += [str(wd.get(k, "")) for k in ("de", "plural", "p2")]
            total += 1
    if not 40 <= total <= 200:
        warnings.append(f"{where}: {total} words (aim for 45–170)")
    for i, ph in enumerate(place.get("phrases", [])):
        w = f"{where} phrases[{i}]"
        need(ph, ["de", "en", "who", "level"], w)
        if ph.get("who") not in ("staff", "you"):
            err(w, "who must be 'staff' or 'you'")
        if ph.get("level") not in LEVELS:
            err(w, f"level must be one of A1–C1, got {ph.get('level')!r}")
        texts.append(ph.get("de", ""))
    exs = place.get("exercises", [])
    if not 8 <= len(exs) <= 16:
        warnings.append(f"{where}: {len(exs)} exercises (aim for 10–14)")
    for i, ex in enumerate(exs):
        check_exercise(ex, f"{where} exercises[{i}]")
    texts += check_speak(place.get("speak", {}), where)
    umlaut_warnings(where, texts)


def check_alltag(strict: bool, only: set[str]) -> None:
    alltag = json.loads((DATA / "alltag.json").read_text(encoding="utf-8"))
    ids: set[str] = set()
    for c in alltag["chapters"]:
        need(c, ["id", "name", "goal", "stops"], f"alltag {c.get('id', '?')}")
        for s in c.get("stops", []):
            need(s, ["id", "icon", "title", "concept"], f"alltag {c['id']}")
            if s["id"] in ids:
                err("alltag.json", f"duplicate id {s['id']}")
            ids.add(s["id"])
            path = DATA / "places" / f"{s['id']}.json"
            if s.get("soon"):
                if path.exists():
                    err("alltag.json", f"{s['id']} has a file but is still marked soon")
                continue
            if only and s["id"] not in only:
                continue
            if not path.exists():
                (errors if strict else warnings).append(f"missing place file {path.relative_to(ROOT).as_posix()}")
                continue
            check_place(path, s)
    for path in (DATA / "places").glob("*.json"):
        if path.stem not in ids:
            err(path.relative_to(ROOT).as_posix(), "place not in alltag.json")


POSSESSIVES = set("mein meine meinen meinem meiner meines dein deine deinen deinem deiner deines "
                  "sein seine seinen seinem seiner seines ihr ihre ihren ihrem ihrer ihres "
                  "unser unsere unseren unserem unserer euer eure euren eurem eurer".split())


def plain(s: str) -> str:
    return " ".join(re.sub(r"[^a-zäöüß ]", "", str(s).lower()).split())


SIMILAR = 0.6  # word-level likeness from which a question counts as a reworded example (the daily quiz reuses exercises)


def similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, plain(a).split(), plain(b).split()).ratio()


def check_not_copied(ex: dict, refs_de: list[str], refs_en: list[str], where: str) -> None:
    """A quiz must use a new sentence, not a Learn example, shadow sentence or model answer with a few words
    changed (the answer is then remembered, not worked out), and a possessive gap must say whose."""
    t, ans = ex.get("type"), ex.get("answer")
    if t == "translate":
        sentences = ans or []
    elif t == "order":
        sentences = [ans] if isinstance(ans, str) else ans or []
    elif t == "gap" and ans:
        sentences = [ex.get("q", "").replace("___", ans[0])]
        if ans[0].lower() in POSSESSIVES and not re.search(r"\([^)]+\)", ex.get("q", "")):
            err(where, f"possessive gap {ans[0]!r} needs a hint such as (my) or (her)")
    elif t == "mc" and isinstance(ans, int) and 0 <= ans < len(ex.get("options", [])):
        sentences = [ex.get("q", "").replace("___", str(ex["options"][ans]))]
    else:
        return
    pairs = [(s, r) for s in sentences[:1] for r in refs_de]
    if t == "translate":
        pairs += [(ex.get("en", ""), r) for r in refs_en]
    for s, r in pairs:
        if similarity(s, r) >= SIMILAR:
            err(where, f"too close to {r!r}; write a new sentence that tests the same rule")
            return


def check_lesson(path: Path, milestone: dict, level: str) -> None:
    where = path.relative_to(ROOT).as_posix()
    try:
        lesson = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        err(where, f"invalid JSON: {e}")
        return
    need(lesson, ["id", "level", "title", "concept", "minutes", "learn", "mindmap", "exercises", "speak"], where)
    if "words" in lesson or "wordlist" in lesson:
        err(where, "lessons are grammar only: words belong in a place (data/places)")
    if lesson.get("id") != milestone["id"]:
        err(where, f"id {lesson.get('id')!r} != roadmap id {milestone['id']!r}")
    if lesson.get("level") != level:
        err(where, f"level {lesson.get('level')!r} != {level!r}")
    for i, sec in enumerate(lesson.get("learn", [])):
        w = f"{where} learn[{i}]"
        need(sec, ["heading", "text"], w)
        tbl = sec.get("table")
        if tbl:
            cols = len(tbl.get("head", []))
            for r in tbl.get("rows", []):
                if len(r) != cols:
                    err(w, f"table row has {len(r)} cells, head has {cols}")
        for ex in sec.get("examples", []):
            need(ex, ["de", "en"], w)
    check_mindmap(lesson.get("mindmap", {}), where)
    exs = lesson.get("exercises", [])
    if not 8 <= len(exs) <= 16:
        warnings.append(f"{where}: {len(exs)} exercises (aim for 10–14)")
    learn_ex = [e for sec in lesson.get("learn", []) for e in sec.get("examples", [])]
    speak = lesson.get("speak", {})
    refs_de = [e.get("de", "") for e in learn_ex + speak.get("shadow", [])] + [p.get("model", "") for p in speak.get("prompts", [])]
    refs_en = [e.get("en", "") for e in learn_ex]
    for i, ex in enumerate(exs):
        check_exercise(ex, f"{where} exercises[{i}]")
        check_not_copied(ex, refs_de, refs_en, f"{where} exercises[{i}]")
    speak_de = check_speak(lesson.get("speak", {}), where)
    umlaut_warnings(where, speak_de)


def check_prepositions() -> None:
    """data/prepositions.json: the Präpositionen-Trainer's groups (case + memory hook) and gap sentences."""
    path = DATA / "prepositions.json"
    where = path.relative_to(ROOT).as_posix()
    if not path.exists():
        return
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        err(where, f"invalid JSON: {e}")
        return
    groups = data.get("groups", {})
    owner: dict[str, str] = {}
    for key in ("akk", "dat", "wechsel", "gen"):
        g = groups.get(key)
        if not g:
            err(where, f"missing group {key!r}")
            continue
        need(g, ["name", "level", "preps", "hook"], f"{where} groups.{key}")
        if g.get("level") not in LEVELS:
            err(f"{where} groups.{key}", f"bad level {g.get('level')!r}")
        for p in g.get("preps", []):
            if p in owner:
                err(f"{where} groups.{key}", f"{p!r} is also in group {owner[p]!r}")
            owner[p] = key
    sentences = data.get("sentences", [])
    if not 60 <= len(sentences) <= 80:
        warnings.append(f"{where}: {len(sentences)} sentences (aim for 60–80)")
    seen: set[str] = set()
    for i, s in enumerate(sentences):
        w = f"{where} sentences[{i}]"
        if not need(s, ["q", "noun", "prep", "options", "answer", "case", "explain", "level"], w):
            continue
        if s["q"].count("___") != 1:
            err(w, "needs exactly one ___")
        if s["q"] in seen:
            err(w, "duplicate sentence")
        seen.add(s["q"])
        if len(s["options"]) != 3 or len(set(s["options"])) != 3:
            err(w, "needs 3 different options")
        if s["answer"] not in s["options"]:
            err(w, f"answer {s['answer']!r} is not in options")
        if s["level"] not in LEVELS:
            err(w, f"bad level {s['level']!r}")
        if s["case"] not in ("akk", "dat", "gen"):
            err(w, f"case must be akk, dat or gen, not {s['case']!r}")
        group = owner.get(s["prep"])
        if group is None:
            err(w, f"prep {s['prep']!r} belongs to no group")
        elif group == "wechsel":
            if s.get("ask") not in ("wo", "wohin"):
                err(w, "Wechsel sentence needs ask: 'wo' or 'wohin'")
            elif s["case"] != ("dat" if s["ask"] == "wo" else "akk"):
                err(w, f"ask {s['ask']!r} needs case {'dat' if s['ask'] == 'wo' else 'akk'!r}, not {s['case']!r}")
        else:
            if "ask" in s:
                err(w, "only Wechsel sentences have 'ask'")
            if s["case"] != group:
                err(w, f"{s['prep']!r} takes {group!r}, but case is {s['case']!r}")
        glevel = groups.get(group, {}).get("level")
        order = ["A1", "A2", "B1", "B2", "C1"]
        if glevel in LEVELS and s["level"] in LEVELS and order.index(s["level"]) < order.index(glevel):
            err(w, f"level {s['level']} is below its group's level {glevel}")


def main(argv: list[str]) -> int:
    strict = "--strict" in argv
    only = {a for a in argv if not a.startswith("--")}
    roadmap = json.loads((DATA / "roadmap.json").read_text(encoding="utf-8"))
    seen: set[str] = set()
    for level in roadmap["levels"]:
        lv = level["id"]
        for m in level.get("milestones", []):
            need(m, ["id", "title", "concept"], f"roadmap {lv}")
            if m["id"] in seen:
                err("roadmap", f"duplicate id {m['id']}")
            seen.add(m["id"])
            if only and m["id"] not in only:
                continue
            path = DATA / "lessons" / lv.lower() / f"{m['id']}.json"
            if not path.exists():
                (errors if strict else warnings).append(f"missing lesson file {path.relative_to(ROOT).as_posix()}")
                continue
            check_lesson(path, m, lv)
    for path in (DATA / "lessons").glob("*/*.json"):
        if path.stem not in seen:
            err(path.relative_to(ROOT).as_posix(), "lesson not in roadmap.json")
    check_alltag(strict, only)
    check_prepositions()
    for w in warnings:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    print(f"{len(errors)} errors, {len(warnings)} warnings")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
