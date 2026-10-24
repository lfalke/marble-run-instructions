# kugelbahn-anleitungen

Eine kleine Web-App, mit der Kinder die Hubelino-Bauanleitungen auf dem Tablet selbst durchblättern können.
Sie zeigt alle Hubelino-Anleitungen. Beim Start sind das nur die, die sich mit dem
**Hubelino Baukasten maxi (420572)** bauen lassen, nicht nur die zwei, die dem Kasten beiliegen.
Über den Filter kommen weitere Baukästen und Erweiterungen dazu.

Privates Bastelprojekt, kein offizielles Projekt von Hubelino und nicht mit Hubelino verbunden.

## Was die App kann

- **Menü** mit dem Titelbild jeder Bahn, sortiert von einfach nach schwer (nach Teilezahl).
  Kugeln in Ampelfarben zeigen die Schwierigkeit: 1 grüne bis 50 Teile, 2 gelbe bis 120 Teile, 3 rote darüber.
- **Filter** (Knopf oben rechts): große Kacheln für Baukästen, Erweiterungen und Schwierigkeit.
  Eine Anleitung erscheint, wenn *alle* Teile gewählt sind, die sie braucht: „Maxi“ + „Trichter“ zeigt die
  Maxi-Bahnen und die Maxi-Trichter-Kombi, aber nicht „Basis + Trichter“. Der Filter wird gespeichert;
  weicht er vom Standard ab, wird der Filter-Knopf gelb und daneben erscheint ein Knopf zum Zurücksetzen.
- **Labels** auf jeder Karte: Baukästen in ihrer Farbe mit Kurznamen, Erweiterungen als Symbol.
- **Lieblinge**: Mit dem Stern (auf der Karte oder in der Anleitung oben rechts) merkt man sich eine Bahn.
  Lieblinge erscheinen zusätzlich ganz oben im Menü, unabhängig vom Filter.
- **Anleitung**: immer genau eine Seite, bildschirmfüllend. Blättern per Wischen oder mit den großen Pfeilen,
  Haus-Knopf zurück zum Menü. Auf der letzten Seite wird der Pfeil zum gelben Haken („fertig“).
- **Weiterlesen**: Die App merkt sich pro Anleitung die zuletzt angesehene Seite („weiter bei 5“).
  Nach dem Haken auf der letzten Seite beginnt die Anleitung beim nächsten Mal wieder vorn.
- Zwei-Finger-Zoom auf einer Seite funktioniert, schnelles Doppeltippen auf die Knöpfe blättert statt zu zoomen.

Lieblinge, Fortschritt und Filter liegen im `localStorage` des Tablet-Browsers, also nur auf diesem Gerät.

## Welche Anleitungen enthalten sind

Alle aus der Hubelino-API außer der Linie „Kugelbahn pi“ (440…), die ein eigenes System mit anderen Teilen ist.
Neue Anleitungen kommen beim nächsten Build automatisch dazu.

In [`build/anleitungen.json`](build/anleitungen.json) stehen die Baukästen und Erweiterungen (`sets`)
mit ihren Artikelnummern, Kurznamen, Farben und Symbolen. Aus den Nummern im Anleitungsnamen
(z. B. `420572_420589-A1`) ergibt sich, was eine Anleitung braucht. Taucht eine unbekannte Nummer auf,
warnt der Build und die Anleitung bekommt ein graues Label mit der Nummer, bis sie in `sets` eingetragen ist.
Einzelne Anleitungen lassen sich über `exclude` ausblenden.

Standardmäßig gewählt (`"default": true`) sind Maxi, Basis, Starter und Mini. Ihre Teilelisten
(Seite 2 jeder PDF) wurden gegen den Maxi-Kasten geprüft, das ergibt diese Startauswahl:

| Set | Anleitungen |
|---|---|
| Baukasten maxi (420572) | A, B, C, D, E |
| Baukasten basis (420480, 420008) | A, B, C, D, „Kurven“ |
| Starter Set (420145) | A, B, C, D |
| Baukasten mini (420169) | A, B, C, D |

Nicht mit dem Maxi-Kasten baubar sind z. B. die Bahnelemente-Sets (420473, 420381, brauchen über 100 weiße
Bausteine und hohe Steine), der 200-teilige, Jubiläums- und Mega-Baukasten (große Platten und Spezialteile)
und alle Kombinationen mit Erweiterungen.

Die Basis-Anleitungen zeigen zwei kleine Grundplatten. Mit der großen Maxi-Platte baut man beides auf einer Platte.

## Betrieb im Heimnetz (Docker)

```sh
docker compose up -d --build
```

Der Container lauscht auf Port 8420. Für die Installation auf dem Tablet braucht es HTTPS (siehe unten),
also einen Reverse Proxy mit Zertifikat davor, z. B. Caddy oder Traefik.

Port 8420 darf nicht aus dem Internet erreichbar sein: Docker veröffentlicht ihn auf allen Netzwerkschnittstellen
und an ufw/firewalld vorbei. Läuft der Reverse Proxy auf demselben Rechner, in `compose.yaml`
`"127.0.0.1:8420:80"` eintragen.

Der Build lädt die Anleitungsliste über die WordPress-API von hubelino.de
(`/wp-json/wp/v2/anleitungen`), lädt die PDFs und rendert jede Seite als JPEG (1920 px an der langen Seite, etwa Tablet-Auflösung).
Das dauert beim ersten Mal einige Minuten; die PDFs bleiben im BuildKit-Cache, spätere Builds laden sie nicht neu. Das fertige Image ist ein schlankes nginx ohne weitere Abhängigkeiten.

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
python3 -m http.server -d site 8420
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
