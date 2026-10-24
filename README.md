# marble-run-instructions

A small web app that lets kids browse the Hubelino building instructions on a tablet by themselves.
It shows all Hubelino instructions. At startup these are only the ones that can be built with the
**Hubelino Big Building Box (Baukasten maxi, 420572)**, not just the two that come with the box.
More building boxes and expansions can be added with the filter.
Hubelino bricks are compatible with LEGO® DUPLO® bricks, so the runs can be extended with DUPLO.

A private hobby project, not an official Hubelino project and not affiliated with Hubelino or the LEGO Group.

## What the app does

- **Language**: German if the browser is set to German, English otherwise. There is no switch in the app.
- **Menu** with the cover of each run, sorted from easy to hard (by part count).
  Balls in traffic-light colors show the difficulty: 1 green up to 50 parts, 2 yellow up to 120 parts, 3 red above.
- **Filter** (button at the top right): large tiles for building boxes, expansions and difficulty.
  An instruction appears when *all* parts it needs are selected: "Big" + "Twister" shows the
  Big runs and the Big + Twister combination, but not "Basic + Twister". The filter is saved;
  if it differs from the default, the filter button turns yellow and a reset button appears next to it.
- **Labels** on each card: building boxes in their color with a short name, expansions as an icon.
- **Favorites**: The star (on the card or at the top right of an instruction) marks a run.
  Favorites also appear at the very top of the menu, regardless of the filter.
- **Instruction**: always exactly one page, filling the screen. Turn pages by swiping or with the large arrows,
  the house button goes back to the menu. On the last page the arrow becomes a yellow check mark ("done").
- **Resume**: The app remembers the last page viewed for each instruction ("continue at 5").
  After the check mark on the last page, the instruction starts from the beginning next time.
- Two-finger zoom works on a page, and a quick double tap on the buttons turns the page instead of zooming.

Favorites, progress and filter are kept in the tablet browser's `localStorage`, so only on that device.

## Which instructions are included

All from the Hubelino API except the "Kugelbahn pi" line (440…), which is a separate system with different parts.
New instructions are added automatically with the next build.

[`build/instructions.json`](build/instructions.json) lists the building boxes and expansions (`sets`)
with their article numbers, short names (English and German), colors and icons. The English names follow
the ones Hubelino itself uses. The numbers in an instruction's name (e.g. `420572_420589-A1`) tell what
it needs. If an unknown number shows up, the build warns and the instruction gets a gray label with the
number until it is added to `sets`. Single instructions can be hidden with `exclude`.

Selected by default (`"default": true`) are Big, Basic, Starter and Mini. Their parts lists
(page 2 of each PDF) were checked against the Big Building Box, which gives this initial selection:

| Set | Instructions |
|---|---|
| Big Building Box / Baukasten maxi (420572) | A, B, C, D, E |
| Basic Building Box / Baukasten basis (420480, 420008) | A, B, C, D, "Curves" |
| Starter Set (420145) | A, B, C, D |
| Mini Building Box / Baukasten mini (420169) | A, B, C, D |

Not buildable with the Big Building Box are, for example, the run elements sets (420473, 420381, they need
over 100 white building blocks and tall blocks), the 200-piece, Anniversary and Mega building boxes (large
base plates and special parts) and all combinations with expansions.

The Basic instructions show two small base plates. With the large Big Building Box plate, both fit on one plate.

## Running in the home network (Docker)

```sh
docker compose up -d --build
```

The container listens on port 8420. Installing the app on the tablet needs HTTPS (see below),
so a reverse proxy with a certificate in front of it, e.g. Caddy or Traefik.

Port 8420 must not be reachable from the internet: Docker publishes it on all network interfaces
and bypasses ufw/firewalld. If the reverse proxy runs on the same machine, put
`"127.0.0.1:8420:80"` in `compose.yaml`.

The build fetches the list of instructions from the WordPress API of hubelino.de
(`/wp-json/wp/v2/anleitungen`), downloads the PDFs and renders every page as a JPEG (1920 px on the long
side, about tablet resolution). The first time this takes a few minutes; the PDFs stay in the BuildKit cache,
so later builds do not download them again. The finished image is a lean nginx without further dependencies.

To pick up new or changed instructions: adjust `build/instructions.json` and run
`docker compose up -d --build` again.

**Updating from the old name `kugelbahn-anleitungen`:** the compose service and container are now called
`marble-run`. The old `kugelbahn` container would keep running and block port 8420, so remove it on the first update:

```sh
docker compose up -d --build --remove-orphans
```

Favorites and progress are taken over from the old storage keys. A changed filter is reset once,
because the sets have new keys.

## Installing on the tablet

Android/Chrome: open the HTTPS address, menu ⋮ → **"Add to Home screen"** or "Install app".
Name, icons (192 px, 512 px, maskable) and colors come from
[`site/manifest.webmanifest`](site/manifest.webmanifest). The app then starts fullscreen in landscape.

HTTPS is required for this: over plain `http://` Chrome only creates a shortcut that opens as a browser tab,
and the screen would turn off while building (the app keeps it on with a Wake Lock, which only exists over HTTPS).

## Development without Docker

```sh
python3 build/build.py               # needs poppler-utils (pdfinfo, pdftoppm, pdftotext)
python3 -m http.server -d site 8420
```

`build.py` keeps downloaded PDFs in `build/cache/` and skips pages that are already rendered,
so running it again is fast.

## Structure

```
build/build.py             query the API, download PDFs, render pages, write site/data/index.json
build/instructions.json    which instructions, set names, title exceptions
site/                      the app: index.html, app.js, style.css, manifest, icons (no framework)
site/data/                 generated (not in the repo): <id>/<page>.jpg, <id>/cover.jpg, index.json
Dockerfile, compose.yaml   two-stage build: Python + poppler renders, nginx serves
```

## Note

The instructions are copyrighted material of Hubelino. That is why they are not in the repo
but downloaded during the build, and the app is meant for private use in your own network only.
The finished Docker image contains the rendered pages and should therefore not be published
(no registry, no publicly reachable server).

## License

The code is under the [MIT License](LICENSE). It only applies to the code in this repo,
not to Hubelino's instructions, images and trademarks.
LEGO® and DUPLO® are trademarks of the LEGO Group, which does not sponsor, authorize or endorse this project.
