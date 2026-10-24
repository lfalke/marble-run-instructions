#!/usr/bin/env python3
"""Laedt die Hubelino-Anleitungen, rendert jede PDF-Seite als JPEG und schreibt index.json.

Benoetigt poppler-utils (pdfinfo, pdftoppm, pdftotext). Erneutes Ausfuehren ist billig:
bereits geladene PDFs und gerenderte Seiten werden uebersprungen.
"""
import argparse
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

API = "https://www.hubelino.de/wp-json/wp/v2/anleitungen?_fields=acf&per_page=100"
PAGE_PX = 1920  # laengere Seitenkante; reicht fuer Tablet-Displays
THUMB_PX = 640
UA = {"User-Agent": "hubelino-tablet/1.0 (private use)"}


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
    if n:
        return n
    # Aeltere Anleitungen zeigen nur Teile pro Schritt ("10x")
    text = run("pdftotext", "-f", "1", "-l", str(pages), str(pdf), "-")
    return sum(int(m) for m in re.findall(r"\b(\d+)x\b", text))


def render(pdf, page, dest, px):
    if dest.exists():
        return
    stem = dest.with_suffix("")
    run("pdftoppm", "-jpeg", "-jpegopt", "quality=82", "-scale-to", str(px),
        "-f", str(page), "-l", str(page), "-singlefile", str(pdf), str(stem))


def main():
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=here.parent / "site" / "data")
    ap.add_argument("--cache", type=Path, default=here / "cache")
    ap.add_argument("--config", type=Path, default=here / "anleitungen.json")
    args = ap.parse_args()

    cfg = json.loads(args.config.read_text())
    entries = {e["acf"]["name_deutsch"]: e["acf"] for e in json.loads(fetch(API))}

    args.cache.mkdir(parents=True, exist_ok=True)
    args.out.mkdir(parents=True, exist_ok=True)
    result = []
    for name in cfg["include"]:
        acf = entries.get(name)
        if not acf:
            print(f"WARN {name}: nicht mehr in der API", file=sys.stderr)
            continue
        url = pdf_url(acf)
        pdf = args.cache / Path(url).name
        if not pdf.exists():
            print(f"lade {url}")
            pdf.write_bytes(fetch(url))

        pages, w, h = page_info(pdf)
        out = args.out / name
        out.mkdir(exist_ok=True)
        print(f"rendere {name} ({pages} Seiten)")
        for p in range(1, pages + 1):
            render(pdf, p, out / f"{p}.jpg", PAGE_PX)
        render(pdf, 1, out / "cover.jpg", THUMB_PX)

        group = cfg["groups"].get(name[:6], "")
        result.append({
            "id": name,
            "title": cfg.get("titles", {}).get(name, f"{group} {name.split('-')[-1][0]}"),
            "group": group,
            "pages": pages,
            "parts": count_parts(pdf, pages),
            "landscape": w > h,
        })

    result.sort(key=lambda r: (r["parts"], r["id"]))
    (args.out / "index.json").write_text(json.dumps(result, ensure_ascii=False, indent=1))
    print(f"{len(result)} Anleitungen -> {args.out / 'index.json'}")


if __name__ == "__main__":
    main()
