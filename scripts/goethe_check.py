"""Check Alltag place words against the official Goethe-Institut word lists (A1, A2, B1).

The PDFs are copyrighted, so they are NOT in the repo. Download them from goethe.de
(Prüfungstraining A1/A2/B1 pages) into references/goethe/ (gitignored), then run:

    python scripts/goethe_check.py            # report A1–B1 place words that are on no Goethe list
    python scripts/goethe_check.py --badges   # also write "goethe": "A1"/"A2"/"B1" (and that level) into
                                              # place words and data/dictionary/core.json (feeds the flashcard deck)

A word counts as "on the list" when it appears as a whole word anywhere in that level's
PDF text (headword or example). Lists are cumulative: a word gets the lowest level whose list has it.
Needs pdftotext (Git for Windows ships it). Skips quietly when the PDFs are missing (e.g. in CI).
"""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "references" / "goethe"
PDFS = {
    "A1": "A1_SD1_Wortliste_02.pdf",
    "A2": "Goethe-Zertifikat_A2_Wortliste.pdf",
    "B1": "Goethe-Zertifikat_B1_Wortliste.pdf",
}
ORDER = ["A1", "A2", "B1", "B2", "C1"]
SKIP = {"sich", "etwas", "jemand", "jemanden", "jemandem", "jdn", "jdm", "etw"}
TOKEN = re.compile(r"[A-Za-zÄÖÜäöüß]+")


def vocab(level: str) -> set[str]:
    pdf = REF / PDFS[level]
    text = subprocess.run(["pdftotext", "-enc", "UTF-8", "-layout", str(pdf), "-"],
                          capture_output=True, check=True).stdout.decode("utf-8", "replace")
    # join words hyphenated across line breaks ("Fahr-\nkarte")
    text = re.sub(r"(\w)-\n\s*(\w)", r"\1\2", text)
    return {t.lower() for t in TOKEN.findall(text)}


def parts(word: dict) -> list[str]:
    """The tokens that must be on the list: the headword, or every content word of a phrase."""
    de = re.sub(r"\(.*?\)", "", word["de"])
    toks = [t.lower() for t in TOKEN.findall(de) if t.lower() not in SKIP]
    if word.get("pos") in ("phrase",):
        return toks
    return toks[:1] if word.get("pos") != "verb" else [t for t in toks][:1]


def goethe_level(word: dict, lists: dict[str, set[str]]) -> str | None:
    toks = parts(word)
    if not toks:
        return None
    for lv in ("A1", "A2", "B1"):
        # cumulative: a level's list includes everything below it
        known = set().union(*(lists[l] for l in ORDER[: ORDER.index(lv) + 1]))
        if all(t in known for t in toks):
            return lv
    return None


def main(argv: list[str]) -> int:
    if not all((REF / f).exists() for f in PDFS.values()) or not shutil.which("pdftotext"):
        print("Goethe PDFs or pdftotext not found; skipping (see the docstring).")
        return 0
    lists = {lv: vocab(lv) for lv in PDFS}
    write = "--badges" in argv
    check_places(lists, write)
    if write:
        tag_core(lists)
    return 0


FLAT_OBJ = re.compile(r'\{\n\s+((?:"(?:[^"\\]|\\.)*": (?:"(?:[^"\\]|\\.)*"|-?\d+|true|false|null),?\n\s*)+)\}')


def dump_place(place: dict) -> str:
    """Pretty JSON with every flat object (word, phrase, sentence) on one line, so diffs stay readable."""
    text = json.dumps(place, ensure_ascii=False, indent=2)
    return FLAT_OBJ.sub(lambda m: "{ " + re.sub(r",?\n\s*", lambda c: ", " if c.group(0).startswith(",") else "", m.group(1)).rstrip(", ") + " }", text) + "\n"


def check_places(lists: dict[str, set[str]], write: bool) -> None:
    """Alltag places: a word on a Goethe list gets that level (and the badge); A1–B1 words on no list are reported."""
    misses = tagged = 0
    for path in sorted((ROOT / "data" / "places").glob("*.json")):
        place = json.loads(path.read_text(encoding="utf-8"))
        off = []
        for area in place["areas"]:
            for w in area["words"]:
                g = goethe_level(w, lists)
                if g:
                    tagged += 1
                    if write:
                        w["goethe"] = g
                        w["level"] = g
                else:
                    w.pop("goethe", None) if write else None
                    if w.get("level") in ("A1", "A2", "B1"):
                        off.append(f"{w['de']} ({w['level']})")
        misses += len(off)
        if off:
            print(f"{path.stem}: {len(off)} A1–B1 words not on any Goethe list: " + ", ".join(off))
        if write:
            path.write_bytes(dump_place(place).encode("utf-8"))
    print(f"places: {tagged} words on a Goethe list, {misses} A1–B1 words not on any list.")


def tag_core(lists: dict[str, set[str]]) -> None:
    """Give each translator dictionary word its lowest Goethe level (no field if on no list)."""
    path = ROOT / "data" / "dictionary" / "core.json"
    core = json.loads(path.read_text(encoding="utf-8"))
    counts: dict[str, int] = {}
    for e in core:
        # tidy glosses: stray CRs and repeated meanings ("luck; happiness; luck")
        e["en"] = "; ".join(dict.fromkeys(m.strip() for m in e["en"].replace(chr(13), "").split(";") if m.strip()))
        g = goethe_level(e, lists)
        if g:
            e["goethe"] = g
        else:
            e.pop("goethe", None)
        counts[g or "none"] = counts.get(g or "none", 0) + 1
    body = ",\n".join(json.dumps(e, ensure_ascii=False, separators=(",", ":")) for e in core)
    path.write_bytes(f"[\n{body}\n]\n".encode("utf-8"))
    print("core.json Goethe levels:", counts)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
