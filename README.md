# Kugelbahn-Anleitungen fürs Tablet

Eine kleine Web-App, mit der Kinder die Hubelino-Bauanleitungen auf dem Tablet selbst durchblättern können.
Sie zeigt alle Anleitungen, die sich mit dem **Hubelino Baukasten maxi (420572)** bauen lassen, nicht nur die zwei,
die dem Kasten beiliegen.

## Was die App kann

- **Menü** mit dem Titelbild jeder Bahn, sortiert von einfach nach schwer (nach Teilezahl).
  Rote Kugeln zeigen die Schwierigkeit: 1 Kugel bis 50 Teile, 2 bis 120 Teile, 3 darüber.
  Der farbige Streifen oben auf der Karte zeigt das Set (gelb Mini, blau Starter, grün Basis, rot Maxi).
- **Lieblinge**: Mit dem Stern (auf der Karte oder in der Anleitung oben rechts) merkt man sich eine Bahn.
  Lieblinge erscheinen zusätzlich ganz oben im Menü.
- **Anleitung**: immer genau eine Seite, bildschirmfüllend. Blättern per Wischen oder mit den großen Pfeilen,
  Haus-Knopf zurück zum Menü. Auf der letzten Seite wird der Pfeil zum gelben Haken („fertig“).
- **Weiterlesen**: Die App merkt sich pro Anleitung die zuletzt angesehene Seite („weiter bei 5“).
  Nach dem Haken auf der letzten Seite beginnt die Anleitung beim nächsten Mal wieder vorn.
- Zwei-Finger-Zoom auf einer Seite funktioniert, schnelles Doppeltippen auf die Knöpfe blättert statt zu zoomen.

Lieblinge und Fortschritt liegen im `localStorage` des Tablet-Browsers, also nur auf diesem Gerät.

## Welche Anleitungen enthalten sind

Die Liste steht in [`build/anleitungen.json`](build/anleitungen.json). Aufgenommen ist alles, dessen Teileliste
(Seite 2 jeder PDF) in den Maxi-Kasten passt:

| Set | Anleitungen |
|---|---|
| Baukasten maxi (420572) | A, B, C, D, E |
| Baukasten basis (420480, 420008) | A, B, C, D, „Kurven“ |
| Starter Set (420145) | A, B, C, D |
| Baukasten mini (420169) | A, B, C, D |

Bewusst **nicht** enthalten:

- 55- und 128-teilige Bahnelemente-Sets (420473, 420381): brauchen über 100 weiße Bausteine und hohe Steine.
- 200-teiliger Baukasten (420183), Jubiläums- (420466) und Mega-Baukasten (420633): große Platten und Spezialteile.
- Alle Kombinationen mit Erweiterungen (Trichter, Weiche, Kugelpumpe, …), weil wir keine haben.
  Kommt eine Erweiterung dazu, die passende Kombi-Anleitung (z. B. `420572_420589-A1`) in `include` eintragen.

Die Basis-Anleitungen zeigen zwei kleine Grundplatten. Mit der großen Maxi-Platte baut man beides auf einer Platte.

## Betrieb im Heimnetz (Docker)

```sh
docker compose up -d --build
```

Danach im Tablet-Browser `http://<IP-des-Servers>:8080` öffnen.

Der Build lädt die Anleitungsliste über die WordPress-API von hubelino.de
(`/wp-json/wp/v2/anleitungen`), lädt die PDFs und rendert jede Seite als JPEG (1920 px, ca. 30 MB insgesamt).
Das dauert 1–2 Minuten. Das fertige Image ist ein schlankes nginx ohne weitere Abhängigkeiten.

Neue oder geänderte Anleitungen übernehmen: `build/anleitungen.json` anpassen und erneut
`docker compose up -d --build`.

## Auf dem Tablet installieren

Android/Chrome: Menü ⋮ → **„Zum Startbildschirm hinzufügen“**. Name, Icons (192 px, 512 px, maskable) und
Farben kommen aus [`site/manifest.webmanifest`](site/manifest.webmanifest).

Einschränkung: Über einfaches `http://` im Heimnetz legt Chrome nur eine **Verknüpfung** an, die in einem
normalen Browser-Tab öffnet. Für eine echte App (eigenes Fenster, Vollbild ohne Adressleiste) und damit der
Bildschirm beim Bauen nicht ausgeht (Wake Lock), verlangt der Browser **HTTPS**. Möglichkeiten:

1. **Chrome-Flag auf dem Tablet** (am einfachsten): `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
   aktivieren, `http://<IP-des-Servers>:8080` eintragen, Chrome neu starten.
2. **Reverse Proxy mit echtem Zertifikat**, z. B. Caddy/Traefik mit eigener Domain und DNS-Challenge,
   oder `tailscale serve`.

Bis dahin: Im Menü auf **„Vollbild“** tippen blendet die Adressleiste aus, und die Bildschirm-Zeitsperre am
Tablet etwas länger stellen.

## Entwicklung ohne Docker

```sh
python3 build/build.py               # braucht poppler-utils (pdfinfo, pdftoppm, pdftotext)
python3 -m http.server -d site 8080
```

`build.py` merkt sich geladene PDFs in `build/cache/` und überspringt bereits gerenderte Seiten,
ein erneuter Lauf ist also schnell.

## Aufbau

```
build/build.py            API abfragen, PDFs laden, Seiten rendern, site/data/index.json schreiben
build/anleitungen.json    welche Anleitungen, Set-Namen, Titel-Ausnahmen
site/                     die App: index.html, app.js, style.css, Manifest, Icons (ohne Framework)
site/data/                generiert (nicht im Repo): <id>/<seite>.jpg, <id>/cover.jpg, index.json
Dockerfile, compose.yaml  Build in zwei Stufen: Python + poppler rendert, nginx liefert aus
```

## Hinweis

Die Anleitungen sind urheberrechtlich geschütztes Material von Hubelino. Deshalb sind sie nicht im Repo,
sondern werden beim Build geladen, und die App ist nur für den privaten Gebrauch im eigenen Netz gedacht.
