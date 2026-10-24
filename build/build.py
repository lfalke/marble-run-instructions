#!/usr/bin/env python3
"""Laedt die Hubelino-Anleitungen, rendert jede PDF-Seite als JPEG und schreibt index.json.

Benoetigt poppler-utils (pdfinfo, pdftoppm, pdftotext). Erneutes Ausfuehren ist billig:
bereits geladene PDFs und gerenderte Seiten werden uebersprungen.
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
PAGE_PX = 1920  # laengere Seitenkante; etwa Tablet-Aufloesung, haelt das Image klein
THUMB_PX = 640
MIN_PARTS = 10  # weniger gefunden: Teileliste ist nur ein Bild, Teile nicht zaehlbar
UA = {"User-Agent": "kugelbahn-anleitungen/1.0 (private use; +https://github.com/lfalke/kugelbahn-anleitungen)"}


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def pdf_url(acf):
    # Das Feld ist mal ein String, mal ein ACF-Dateiobjekt
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
    # Seite 2 ist normalerweise die Teileliste ("x20", "x44", ...)
    text = run("pdftotext", "-f", "2", "-l", "2", str(pdf), "-")
    n = sum(int(m) for m in re.findall(r"\bx(\d+)\b", text))
    if not n:
        # Aeltere Anleitungen zeigen nur Teile pro Schritt ("10x")
        text = run("pdftotext", "-f", "1", "-l", str(pages), str(pdf), "-")
        n = sum(int(m) for m in re.findall(r"\b(\d+)x\b", text))
    return n if n >= MIN_PARTS else None


def difficulty(parts):
    # Wie eine Ampel: 1 gruene Kugel bis 50 Teile, 2 gelbe bis 120, 3 rote darueber
    return 1 if parts <= 50 else 2 if parts <= 120 else 3


def render(pdf, page, dest, px):
    if dest.exists():
        return
    stem = dest.with_suffix("")
    run("pdftoppm", "-jpeg", "-jpegopt", "quality=82", "-scale-to", str(px),
        "-f", str(page), "-l", str(page), "-singlefile", str(pdf), str(stem))


def parse_name(name, number_to_key):
    """'420572_420589-A1' -> (['maxi', 'trichter'], 'A'). Unbekannte Nummern bleiben als Nummer stehen."""
    m = re.match(r"^(.*?)[-_]([A-Z])\d*$", name)
    if not m:
        raise ValueError(f"{name}: Name nicht erkannt")
    numbers = []
    for n in re.findall(r"\d+", m.group(1)):
        # Abgekuerzte Nummern wie in '420572_-497_-503' uebernehmen den Anfang der ersten
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
    ap.add_argument("--config", type=Path, default=here / "anleitungen.json")
    args = ap.parse_args()

    cfg = json.loads(args.config.read_text())
    sets = cfg["sets"]
    number_to_key = {n: key for key, s in sets.items() for n in s["numbers"]}
    order = {key: i for i, key in enumerate(sets)}
    entries = {}
    for e in json.loads(fetch(API)):
        acf = e["acf"]
        # pi ist ein eigenes System mit anderen Teilen
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
            print(f"WARN {name}: unbekannte Set-Nummer {', '.join(unknown)}, bitte in sets eintragen "
                  f"({acf.get('kurzbeschreibung_deutsch', '')})", file=sys.stderr)
        components.sort(key=lambda c: order.get(c, len(order)))
        url = pdf_url(acf)
        pdf = args.cache / Path(url).name
        if not pdf.exists():
            print(f"lade {url}")
            pdf.write_bytes(fetch(url))

        pages, w, h = page_info(pdf)
        # Cache-Buster fuer den Browser (Bilder werden als immutable ausgeliefert); aendert sich
        # mit PDF-Quelle oder Aufloesung und loest dann auch hier ein Neurendern aus
        rev = hashlib.sha1(f"{url}|{PAGE_PX}|{THUMB_PX}".encode()).hexdigest()[:8]
        out = args.out / name
        stamp = out / ".rev"
        if out.exists() and (not stamp.exists() or stamp.read_text() != rev):
            shutil.rmtree(out)
        out.mkdir(exist_ok=True)
        print(f"rendere {name} ({pages} Seiten)")
        for p in range(1, pages + 1):
            render(pdf, p, out / f"{p}.jpg", PAGE_PX)
        render(pdf, 1, out / "cover.jpg", THUMB_PX)
        stamp.write_text(rev)

        parts = count_parts(pdf, pages)
        level = cfg["levels"].get(name) or (parts and difficulty(parts))
        if not level:
            print(f"WARN {name}: Teile nicht zaehlbar, bitte Schwierigkeit in levels eintragen", file=sys.stderr)
            level = 2
        label = " + ".join(sets[c]["name"] if c in sets else c for c in components)
        result.append({
            "id": name,
            "title": cfg.get("titles", {}).get(name, f"{label} {letter}"),
            "components": components,
            "pages": pages,
            "parts": parts,
            "level": level,
            "landscape": w > h,
            "rev": rev,
        })

    # Ohne Teilezahl ans Ende ihrer Schwierigkeitsstufe
    result.sort(key=lambda r: (r["parts"] or {1: 50, 2: 120, 3: 999}[r["level"]], r["id"]))
    used = {c for r in result for c in r["components"]}
    # Nur Sets, zu denen es Anleitungen gibt; unbekannte Nummern ans Ende (grau, ohne Icon)
    meta = [{"key": key, **{k: v for k, v in s.items() if k != "numbers"}} for key, s in sets.items() if key in used]
    meta += [{"key": c, "name": c, "kind": "box", "color": "#adb5bd"} for c in sorted(used - set(sets))]
    index = {"sets": meta, "items": result}
    (args.out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1))
    print(f"{len(result)} Anleitungen -> {args.out / 'index.json'}")


if __name__ == "__main__":
    main()
