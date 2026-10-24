# kugelbahn-anleitungen

Eine kleine Web-App, mit der Kinder die Hubelino-Bauanleitungen auf dem Tablet selbst durchblättern können.
Sie zeigt alle Anleitungen, die sich mit dem **Hubelino Baukasten maxi (420572)** bauen lassen, nicht nur die zwei,
die dem Kasten beiliegen.

Privates Bastelprojekt, kein offizielles Projekt von Hubelino und nicht mit Hubelino verbunden.

## Was die App kann

- **Menü** mit dem Titelbild jeder Bahn, sortiert von einfach nach schwer (nach Teilezahl).
  Kugeln in Ampelfarben zeigen die Schwierigkeit: 1 grüne bis 50 Teile, 2 gelbe bis 120 Teile, 3 rote darüber.
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
- Alle Kombinationen mit Erweiterungen (Trichter, Weiche, Kugelpumpe, …), weil sie Teile außerhalb des Maxi-Kastens brauchen.
  Kommt eine Erweiterung dazu, die passende Kombi-Anleitung (z. B. `420572_420589-A1`) in `include` eintragen.

Die Basis-Anleitungen zeigen zwei kleine Grundplatten. Mit der großen Maxi-Platte baut man beides auf einer Platte.

## Betrieb im Heimnetz (Docker)

```sh
docker compose up -d --build
```

Der Container lauscht auf Port 8080. Für die Installation auf dem Tablet braucht es HTTPS (siehe unten),
also einen Reverse Proxy mit Zertifikat davor, z. B. Caddy oder Traefik.

Der Build lädt die Anleitungsliste über die WordPress-API von hubelino.de
(`/wp-json/wp/v2/anleitungen`), lädt die PDFs und rendert jede Seite als JPEG (2560 px, ca. 50 MB insgesamt).
Das dauert 1–2 Minuten. Das fertige Image ist ein schlankes nginx ohne weitere Abhängigkeiten.

Neue oder geänderte Anleitungen übernehmen: `build/anleitungen.json` anpassen und erneut
`docker compose up -d --build`.

## Auf dem Tablet installieren

Android/Chrome: die HTTPS-Adresse öffnen, Menü ⋮ → **„Zum Startbildschirm hinzufügen“** bzw. „App installieren“.
Name, Icons (192 px, 512 px, maskable) und Farben kommen aus
[`site/manifest.webmanifest`](site/manifest.webmanifest). Die App startet dann im Vollbild im Querformat.

HTTPS ist dafür nötig: Über einfaches `http://` legt Chrome nur eine Verknüpfung an, die als Browser-Tab öffnet,
und der Bildschirm würde beim Bauen ausgehen (die App hält ihn per Wake Lock an, das gibt es nur über HTTPS).

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
Das fertige Docker-Image enthält die gerenderten Seiten und sollte deshalb nicht veröffentlicht werden
(keine Registry, kein öffentlich erreichbarer Server).

## Lizenz

Der Code steht unter der [MIT-Lizenz](LICENSE). Sie gilt nur für den Code in diesem Repo,
nicht für die Anleitungen, Bilder und Marken von Hubelino.
