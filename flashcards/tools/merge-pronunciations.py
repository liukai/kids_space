#!/usr/bin/env python3
"""Merge IPA + respelling into words-embed.js (American-style approximations for learners)."""

import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
EMBED = ROOT / "words-embed.js"

BANNER = (
    "// Flashcard word list (source of truth). Edit this file, or run this script "
    "to refresh IPA/respelling from its built-in map.\n"
    "//   python3 flashcards/tools/merge-pronunciations.py\n"
)


def _read_embed_array(path: pathlib.Path) -> list:
    text = path.read_text(encoding="utf-8")
    marker = "window.__FLASHCARD_WORDS__ = "
    i = text.find(marker)
    if i == -1:
        raise ValueError(f"{path}: missing {marker!r}")
    raw = text[i + len(marker) :].strip()
    return json.loads(raw)


def _write_embed_array(path: pathlib.Path, data: list) -> None:
    body = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    path.write_text(BANNER + "window.__FLASHCARD_WORDS__ = " + body, encoding="utf-8")

# IPA without brackets in data — UI adds slashes. Respelling: simple syllable caps style.
PRON = {
    "cat": ("/kæt/", "KAT"),
    "dog": ("/dɔːɡ/", "DAWG"),
    "sun": ("/sʌn/", "SUN"),
    "bed": ("/bɛd/", "BED"),
    "pen": ("/pɛn/", "PEN"),
    "cup": ("/kʌp/", "KUP"),
    "map": ("/mæp/", "MAP"),
    "hat": ("/hæt/", "HAT"),
    "pig": ("/pɪɡ/", "PIG"),
    "box": ("/bɑːks/", "BAHKS"),
    "bat": ("/bæt/", "BAT"),
    "car": ("/kɑːr/", "KAR"),
    "bus": ("/bʌs/", "BUS"),
    "red": ("/rɛd/", "RED"),
    "run": ("/rʌn/", "RUN"),
    "sit": ("/sɪt/", "SIT"),
    "top": ("/tɑːp/", "TAHP"),
    "hot": ("/hɑːt/", "HAHT"),
    "big": ("/bɪɡ/", "BIG"),
    "bag": ("/bæɡ/", "BAG"),
    "leg": ("/lɛɡ/", "LEG"),
    "man": ("/mæn/", "MAN"),
    "fan": ("/fæn/", "FAN"),
    "pan": ("/pæn/", "PAN"),
    "cap": ("/kæp/", "KAP"),
    "net": ("/nɛt/", "NET"),
    "jet": ("/dʒɛt/", "JET"),
    "log": ("/lɔːɡ/", "LAWG"),
    "fox": ("/fɑːks/", "FAHKS"),
    "frog": ("/frɔːɡ/", "FRAHG"),
    "flag": ("/flæɡ/", "FLAG"),
    "plug": ("/plʌɡ/", "PLUG"),
    "drum": ("/drʌm/", "DRUM"),
    "clock": ("/klɑːk/", "KLAHK"),
    "truck": ("/trʌk/", "TRUK"),
    "plant": ("/plænt/", "PLANT"),
    "brush": ("/brʌʃ/", "BRUSH"),
    "bread": ("/brɛd/", "BRED"),
    "train": ("/treɪn/", "TRAYN"),
    "ship": ("/ʃɪp/", "SHIP"),
    "chip": ("/tʃɪp/", "CHIP"),
    "fish": ("/fɪʃ/", "FISH"),
    "shoe": ("/ʃuː/", "SHOO"),
    "chair": ("/tʃer/", "CHAIR"),
    "the": ("/ðə/", "thuh"),
    "and": ("/ænd/", "AND"),
    "you": ("/juː/", "YOO"),
    "is": ("/ɪz/", "IZ"),
    "it": ("/ɪt/", "IT"),
    "in": ("/ɪn/", "IN"),
    "on": ("/ɑːn/", "ON"),
    "to": ("/tuː/", "TOO"),
    "we": ("/wiː/", "WEE"),
    "go": ("/ɡoʊ/", "GOH"),
    "me": ("/miː/", "MEE"),
    "they": ("/ðeɪ/", "THAY"),
    "have": ("/hæv/", "HAV"),
    "said": ("/sɛd/", "SED"),
    "from": ("/frʌm/", "FRUM"),
    "what": ("/wʌt/", "WUT"),
    "when": ("/wɛn/", "WEN"),
    "where": ("/wer/", "WAIR"),
    "why": ("/waɪ/", "WY"),
    "how": ("/haʊ/", "HOW"),
    "because": ("/bɪˈkɔːz/", "bih-KAWZ"),
    "before": ("/bɪˈfɔːr/", "bee-FOR"),
    "after": ("/ˈæftər/", "AF-ter"),
    "again": ("/əˈɡɛn/", "uh-GEN"),
    "every": ("/ˈɛvri/", "EV-ree"),
    "could": ("/kʊd/", "KOOD"),
    "should": ("/ʃʊd/", "SHOOD"),
    "would": ("/wʊd/", "WOOD"),
    "beautiful": ("/ˈbjuːtɪfəl/", "BYOO-tih-full"),
    "important": ("/ɪmˈpɔːrtnt/", "im-POR-tnt"),
    "different": ("/ˈdɪfrənt/", "DIFF-runt"),
    "information": ("/ˌɪnfərˈmeɪʃən/", "in-fer-MAY-shun"),
    "environment": ("/ɪnˈvaɪrənmənt/", "in-VY-run-ment"),
    "experience": ("/ɪkˈspɪriəns/", "ik-SPEER-ee-uns"),
    "education": ("/ˌɛdʒuˈkeɪʃən/", "ed-joo-KAY-shun"),
    "development": ("/dɪˈvɛləpmənt/", "dih-VEL-up-munt"),
    "apple": ("/ˈæpəl/", "AP-ul"),
    "banana": ("/bəˈnænə/", "buh-NAN-uh"),
    "ball": ("/bɔːl/", "BAWL"),
    "tree": ("/triː/", "TREE"),
    "bird": ("/bɜːrd/", "BURD"),
    "water": ("/ˈwɔːtər/", "WAW-ter"),
    "milk": ("/mɪlk/", "MILK"),
    "book": ("/bʊk/", "BOOK"),
    "door": ("/dɔːr/", "DOR"),
    "house": ("/haʊs/", "HOWSS"),
    "school": ("/skuːl/", "SKOOL"),
    "teacher": ("/ˈtiːtʃər/", "TEE-chur"),
    "friend": ("/frɛnd/", "FREND"),
    "family": ("/ˈfæməli/", "FAM-uh-lee"),
    "play": ("/pleɪ/", "PLAY"),
    "eat": ("/iːt/", "EET"),
    "sleep": ("/sliːp/", "SLEEP"),
    "jump": ("/dʒʌmp/", "JUMP"),
    "walk": ("/wɔːk/", "WAWK"),
    "read": ("/riːd/", "REED"),
    "write": ("/raɪt/", "RYTE"),
    "draw": ("/drɔː/", "DRAW"),
}


def main() -> None:
    data = _read_embed_array(EMBED)
    for row in data:
        w = row.get("word", "")
        if w in PRON:
            ipa, resp = PRON[w]
            row["ipa"] = ipa
            row["respelling"] = resp
        else:
            row.setdefault("ipa", "")
            row.setdefault("respelling", "")
    _write_embed_array(EMBED, data)
    print("Updated", EMBED, "—", len(data), "rows")


if __name__ == "__main__":
    main()
