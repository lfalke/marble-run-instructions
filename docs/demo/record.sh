#!/bin/sh
# Records docs/demo.webp: the app with blurred covers and pages, played through in Google Chrome.
# Needs node, ffmpeg, python3, Google Chrome and the rendered pages in site/data (build/build.py).
set -eu
cd "$(dirname "$0")"
root=$(cd ../.. && pwd)
port=${PORT:-8429}

if [ ! -f "$root/site/data/index.json" ]; then
  echo "site/data is missing, run python3 build/build.py first" >&2
  exit 1
fi
[ -d node_modules ] || npm ci --silent

tmp=$(mktemp -d)
server=
trap '[ -n "$server" ] && kill "$server"; rm -rf "$tmp"' EXIT

# Copy of the site with inject.html in index.html, everything else linked
mkdir "$tmp/site"
for f in "$root"/site/*; do
  [ "$(basename "$f")" = index.html ] || ln -s "$f" "$tmp/site/"
done
awk '/<\/head>/ { while ((getline line < "inject.html") > 0) print line } { print }' \
  "$root/site/index.html" > "$tmp/site/index.html"

python3 -m http.server -d "$tmp/site" "$port" >/dev/null 2>&1 &
server=$!
node record.js "http://localhost:$port/" "$tmp/frames"

# Animated WebP instead of GIF: full color for the blurred images, and a fraction of the size
ffmpeg -v error -y -f concat -safe 0 -i "$tmp/frames/list.txt" \
  -vf "fps=15,scale=960:-1:flags=lanczos" -c:v libwebp_anim -quality 82 -compression_level 6 -loop 0 \
  "$root/docs/demo.webp"
echo "wrote docs/demo.webp ($(du -k "$root/docs/demo.webp" | cut -f1) KB)"
