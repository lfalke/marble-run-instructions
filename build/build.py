#!/usr/bin/env python3
"""Downloads the Hubelino instructions, renders every PDF page as a JPEG and writes index.json.

Needs poppler-utils (pdfinfo, pdftoppm, pdftotext). Running it again is cheap:
PDFs already downloaded and pages already rendered are skipped.
"""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

API = "https://www.hubelino.de/wp-json/wp/v2/anleitungen?_fields=acf&per_page=100"
PAGE_PX = 1920  # longer page edge; about tablet resolution, keeps the image small
THUMB_PX = 640
MIN_PARTS = 10  # fewer found: the parts list is just an image, parts cannot be counted
LANGS = ("en", "de")  # first one is the fallback
UA = {"User-Agent": "marble-run-instructions/1.0 (private use; +https://github.com/lfalke/marble-run-instructions)"}


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def pdf_url(acf):
    # The field is sometimes a string, sometimes an ACF file object
    v = acf.get("anleitung_normal")
    return v["url"] if isinstance(v, dict) else v


def run(*cmd):
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def page_info(pdf):
    out = run("pdfinfo", str(pdf))
    pages = int(re.search(r"^Pages:\s+(\d+)", out, re.M).group(1))
    w, h = map(float, re.search(r"^Page size:\s+([\d.]+) x ([\d.]+)", out, re.M).groups())
    return pages, w, h


def count_parts(pdf, pages):
    # Page 2 is usually the parts list ("x20", "x44", ...)
    text = run("pdftotext", "-f", "2", "-l", "2", str(pdf), "-")
    n = sum(int(m) for m in re.findall(r"\bx(\d+)\b", text))
    if not n:
        # Older instructions only show parts per step ("10x")
        text = run("pdftotext", "-f", "1", "-l", str(pages), str(pdf), "-")
        n = sum(int(m) for m in re.findall(r"\b(\d+)x\b", text))
    return n if n >= MIN_PARTS else None


def difficulty(parts):
    # Like a traffic light: 1 green ball up to 50 parts, 2 yellow up to 120, 3 red above
    return 1 if parts <= 50 else 2 if parts <= 120 else 3


def render(pdf, page, dest, px):
    if dest.exists():
        return
    stem = dest.with_suffix("")
    run("pdftoppm", "-jpeg", "-jpegopt", "quality=82", "-scale-to", str(px),
        "-f", str(page), "-l", str(page), "-singlefile", str(pdf), str(stem))


def parse_name(name, number_to_key):
    """'420572_420589-A1' -> (['big', 'twister'], 'A'). Unknown numbers stay as they are."""
    m = re.match(r"^(.*?)[-_]([A-Z])\d*$", name)
    if not m:
        raise ValueError(f"{name}: name not recognized")
    numbers = []
    for n in re.findall(r"\d+", m.group(1)):
        # Shortened numbers as in '420572_-497_-503' take the beginning of the first one
        numbers.append(numbers[0][: 6 - len(n)] + n if numbers and len(n) < 6 else n)
    keys = []
    for n in numbers:
        key = number_to_key.get(n, n)
        if key not in keys:
            keys.append(key)
    return keys, m.group(2)


def main():
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=here.parent / "site" / "data")
    ap.add_argument("--cache", type=Path, default=here / "cache")
    ap.add_argument("--config", type=Path, default=here / "instructions.json")
    args = ap.parse_args()

    cfg = json.loads(args.config.read_text())
    sets = cfg["sets"]
    number_to_key = {n: key for key, s in sets.items() for n in s["numbers"]}
    order = {key: i for i, key in enumerate(sets)}

    def set_name(key, lang):
        return sets[key]["name"][lang] if key in sets else key

    entries = {}
    for e in json.loads(fetch(API)):
        acf = e["acf"]
        # pi is a separate system with different parts
        if acf.get("set", "").strip() == "pi" or acf["name_deutsch"] in cfg["exclude"]:
            continue
        entries[acf["name_deutsch"]] = acf

    args.cache.mkdir(parents=True, exist_ok=True)
    args.out.mkdir(parents=True, exist_ok=True)
    result = []
    for name, acf in sorted(entries.items()):
        components, letter = parse_name(name, number_to_key)
        components = cfg["components"].get(name, components)
        unknown = [c for c in components if c not in sets]
        if unknown:
            print(f"WARN {name}: unknown set number {', '.join(unknown)}, please add it to sets "
                  f"({acf.get('kurzbeschreibung_englisch', '').strip()})", file=sys.stderr)
        components.sort(key=lambda c: order.get(c, len(order)))
        url = pdf_url(acf)
        pdf = args.cache / Path(url).name
        if not pdf.exists():
            print(f"downloading {url}")
            pdf.write_bytes(fetch(url))

        pages, w, h = page_info(pdf)
        # Cache buster for the browser (images are served as immutable); changes with the
        # PDF source or resolution and then also triggers a re-render here
        rev = hashlib.sha1(f"{url}|{PAGE_PX}|{THUMB_PX}".encode()).hexdigest()[:8]
        out = args.out / name
        stamp = out / ".rev"
        if out.exists() and (not stamp.exists() or stamp.read_text() != rev):
            shutil.rmtree(out)
        out.mkdir(exist_ok=True)
        print(f"rendering {name} ({pages} pages)")
        for p in range(1, pages + 1):
            render(pdf, p, out / f"{p}.jpg", PAGE_PX)
        render(pdf, 1, out / "cover.jpg", THUMB_PX)
        stamp.write_text(rev)

        parts = count_parts(pdf, pages)
        level = cfg["levels"].get(name) or (parts and difficulty(parts))
        if not level:
            print(f"WARN {name}: parts cannot be counted, please add the difficulty to levels", file=sys.stderr)
            level = 2
        title = cfg["titles"].get(name) or {
            lang: " + ".join(set_name(c, lang) for c in components) + f" {letter}" for lang in LANGS}
        result.append({
            "id": name,
            "title": title,
            "components": components,
            "pages": pages,
            "parts": parts,
            "level": level,
            "landscape": w > h,
            "rev": rev,
        })

    # Without a part count: at the end of their difficulty level
    result.sort(key=lambda r: (r["parts"] or {1: 50, 2: 120, 3: 999}[r["level"]], r["id"]))
    used = {c for r in result for c in r["components"]}
    # Only sets that have instructions; unknown numbers at the end (gray, no icon)
    meta = [{"key": key, **{k: v for k, v in s.items() if k != "numbers"}} for key, s in sets.items() if key in used]
    meta += [{"key": c, "name": {lang: c for lang in LANGS}, "kind": "box", "color": "#adb5bd"}
             for c in sorted(used - set(sets))]
    index = {"sets": meta, "items": result}
    (args.out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1))
    print(f"{len(result)} instructions -> {args.out / 'index.json'}")


if __name__ == "__main__":
    main()
