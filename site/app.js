'use strict';

const $ = (id) => document.getElementById(id);
const els = {
  menu: $('menu'), grid: $('grid'), viewer: $('viewer'), stage: $('stage'), page: $('page'),
  home: $('home'), prev: $('prev'), next: $('next'), count: $('count'), bar: $('bar'),
  fullscreen: $('fullscreen'), favs: $('favs'), favsSection: $('favs-section'), allTitle: $('all-title'),
  viewerStar: $('viewer-star'), reset: $('reset'), openFilter: $('open-filter'), filter: $('filter'),
  fBox: $('f-box'), fExt: $('f-ext'), fLevel: $('f-level'), filterReset: $('filter-reset'),
  filterDone: $('filter-done'), filterCount: $('filter-count'), empty: $('empty'), emptyReset: $('empty-reset'),
};
const STAR_SVG = els.viewerStar.innerHTML;

let list = [];
let sets = []; // Baukästen und Erweiterungen aus index.json, in Anzeigereihenfolge
let current = null; // { item, page }
let openedFromMenu = false;
let filterOpenedFromMenu = false;

// ---------- Fortschritt (nur Komfort, darf fehlen) ----------
const STORE = 'kugelbahn-progress';
const FAVS = 'kugelbahn-favorites';
const FILTER = 'kugelbahn-filter';
// Gespeichertes unter den alten Schlüsseln übernehmen, damit Lieblinge und Fortschritt erhalten bleiben
try {
  for (const [from, to] of [['hubelino-progress', STORE], ['hubelino-favorites', FAVS]]) {
    const old = localStorage.getItem(from);
    if (old !== null && localStorage.getItem(to) === null) localStorage.setItem(to, old);
    localStorage.removeItem(from);
  }
} catch { /* privater Modus o.ä. */ }
// Seite 1 ist das Titelbild, Seite 2 die Teileliste: erst ab dem ersten Bauschritt gibt es etwas fortzusetzen
const MIN_RESUME_PAGE = 3;
function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(STORE)) || {};
    for (const id in p) if (p[id] < MIN_RESUME_PAGE) delete p[id];
    return p;
  } catch { return {}; }
}
function saveProgress(id, page) {
  // Kurz zurück zur Teileliste blättern soll den gespeicherten Stand nicht verwerfen
  if (page && page < MIN_RESUME_PAGE) return;
  try {
    const p = loadProgress();
    if (page) p[id] = page; else delete p[id];
    localStorage.setItem(STORE, JSON.stringify(p));
  } catch { /* privater Modus o.ä. */ }
}

function loadFavorites() {
  try { return new Set(JSON.parse(localStorage.getItem(FAVS)) || []); } catch { return new Set(); }
}
function toggleFavorite(id) {
  const favs = loadFavorites();
  if (favs.has(id)) favs.delete(id); else favs.add(id);
  try { localStorage.setItem(FAVS, JSON.stringify([...favs])); } catch { /* s.o. */ }
  return favs.has(id);
}
// Filter: gewählte Baukästen/Erweiterungen und Schwierigkeiten. Ohne Eintrag gilt der Standard
// aus anleitungen.json, so wirken spätere Änderungen dort auch nach einem Zurücksetzen.
const LEVELS = [1, 2, 3];
const defaultFilter = () => ({ sets: sets.filter((s) => s.default).map((s) => s.key), levels: [...LEVELS] });
function loadFilter() {
  try {
    const f = JSON.parse(localStorage.getItem(FILTER));
    if (Array.isArray(f?.sets) && Array.isArray(f?.levels)) return f;
  } catch { /* s.o. */ }
  return defaultFilter();
}
function saveFilter(f) {
  try { localStorage.setItem(FILTER, JSON.stringify(f)); } catch { /* s.o. */ }
}
function resetFilter() {
  try { localStorage.removeItem(FILTER); } catch { /* s.o. */ }
}
const sameItems = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const isDefaultFilter = (f) => {
  const d = defaultFilter();
  return sameItems(f.sets, d.sets) && sameItems(f.levels, d.levels);
};
// Eine Anleitung erscheint nur, wenn alles gewählt ist, was man für sie braucht
const matches = (item, f) =>
  item.components.every((c) => f.sets.includes(c)) && f.levels.includes(item.level);

function setStar(btn, on) {
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', on);
  btn.setAttribute('aria-label', on ? 'Kein Liebling mehr' : 'Als Liebling merken');
}

const src = (item, page) => `data/${item.id}/${page}.jpg?v=${item.rev}`;
const ballsHTML = (level) => `
  <span class="balls" data-level="${level}" aria-label="Schwierigkeit ${level} von 3">
    ${[1, 2, 3].map((n) => `<i class="${n <= level ? 'on' : ''}"></i>`).join('')}
  </span>`;

// Baukasten: Farbe + Kurzname, Erweiterung: Icon (die Kinder können noch kaum lesen)
function setBadge(set, className) {
  const el = document.createElement('span');
  el.className = `${className} ${className}-${set.kind}`;
  if (set.kind === 'ext') {
    el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${set.icon}</svg>`;
    el.setAttribute('aria-label', set.name);
    el.title = set.name;
  } else {
    el.style.setProperty('--c', set.color);
    el.textContent = set.name;
  }
  return el;
}

// ---------- Menü ----------
function renderMenu() {
  const progress = loadProgress();
  const favs = loadFavorites();
  const card = (item) => {
    const li = document.createElement('li');
    li.className = 'card-wrap';
    const btn = document.createElement('button');
    btn.className = 'card';
    btn.type = 'button';
    const resume = progress[item.id];
    btn.innerHTML = `
      <img src="${src(item, 'cover')}" alt="" loading="lazy">
      <div class="card-body">
        <span class="card-title"></span>
        ${ballsHTML(item.level)}
      </div>
      <div class="card-tags"></div>
      <div class="card-meta">
        <span>${item.pages} Seiten${item.parts ? ` · ${item.parts} Teile` : ''}</span>
        ${resume ? `<span class="resume">weiter bei ${resume}</span>` : ''}
      </div>`;
    btn.querySelector('.card-title').textContent = item.title;
    btn.querySelector('.card-tags').append(
      ...item.components.map((key) => setBadge(sets.find((s) => s.key === key), 'tag')));
    btn.addEventListener('click', () => {
      openedFromMenu = true;
      location.hash = `#/${item.id}/${resume || 1}`;
    });
    const star = document.createElement('button');
    star.className = 'star star-card';
    star.type = 'button';
    star.innerHTML = STAR_SVG;
    setStar(star, favs.has(item.id));
    star.addEventListener('click', () => {
      toggleFavorite(item.id);
      renderMenu();
    });
    li.append(btn, star);
    return li;
  };
  // Lieblinge zusätzlich oben und unabhängig vom Filter, damit kein gesternter Liebling verschwindet
  const favItems = list.filter((item) => favs.has(item.id));
  els.favsSection.hidden = els.allTitle.hidden = favItems.length === 0;
  els.favs.replaceChildren(...favItems.map(card));
  const filter = loadFilter();
  const shown = list.filter((item) => matches(item, filter));
  els.grid.replaceChildren(...shown.map(card));
  els.empty.hidden = shown.length > 0;
  const changed = !isDefaultFilter(filter);
  els.openFilter.classList.toggle('active', changed);
  els.reset.hidden = !changed;
  if (!els.filter.hidden) renderFilter(filter, shown.length);
}

// ---------- Filter ----------
function renderFilter(filter, count) {
  const tile = (content, on, toggle) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tile';
    btn.setAttribute('aria-pressed', on);
    btn.append(content);
    btn.addEventListener('click', () => {
      toggle();
      saveFilter(filter);
      renderMenu();
    });
    return btn;
  };
  const toggleIn = (arr, x) => {
    const i = arr.indexOf(x);
    if (i >= 0) arr.splice(i, 1); else arr.push(x);
  };
  const setTiles = (kind) => sets.filter((s) => s.kind === kind).map((s) => {
    const content = document.createDocumentFragment();
    content.append(setBadge(s, 'tile-badge'));
    if (s.kind === 'ext') content.append(Object.assign(document.createElement('span'), { textContent: s.name }));
    return tile(content, filter.sets.includes(s.key), () => toggleIn(filter.sets, s.key));
  });
  els.fBox.replaceChildren(...setTiles('box'));
  els.fExt.replaceChildren(...setTiles('ext'));
  els.fLevel.replaceChildren(...LEVELS.map((level) => {
    const content = document.createElement('span');
    content.innerHTML = ballsHTML(level);
    return tile(content, filter.levels.includes(level), () => toggleIn(filter.levels, level));
  }));
  els.filterCount.textContent = count;
  els.filterDone.setAttribute('aria-label', `Fertig, ${count} Bahnen`);
}

function closeFilter() {
  if (filterOpenedFromMenu) history.back();
  else location.replace('#/');
}
els.openFilter.addEventListener('click', () => {
  filterOpenedFromMenu = true;
  location.hash = '#/filter';
});
els.filterDone.addEventListener('click', closeFilter);
els.filter.addEventListener('click', (e) => { if (e.target === els.filter) closeFilter(); });
for (const btn of [els.reset, els.filterReset, els.emptyReset]) {
  btn.addEventListener('click', () => {
    resetFilter();
    renderMenu();
  });
}

function goHome() {
  if (openedFromMenu) history.back();
  else location.replace('#/');
}

// ---------- Viewer ----------
function preload(item, page) {
  for (const p of [page + 1, page - 1, page + 2]) {
    if (p >= 1 && p <= item.pages) new Image().src = src(item, p);
  }
}

function showPage(item, page, dir = 0) {
  current = { item, page };
  const img = els.page;
  const swap = () => {
    img.src = src(item, page);
    img.alt = `${item.title}, Seite ${page} von ${item.pages}`;
  };

  if (dir && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    img.classList.add('anim');
    img.style.transform = `translateX(${-dir * 40}%)`;
    img.style.opacity = '0';
    setTimeout(() => {
      img.classList.remove('anim');
      img.style.transform = `translateX(${dir * 40}%)`;
      swap();
      const settle = () => {
        img.classList.add('anim');
        img.style.transform = '';
        img.style.opacity = '';
      };
      if (img.complete) requestAnimationFrame(() => requestAnimationFrame(settle));
      else img.addEventListener('load', settle, { once: true });
    }, 160);
  } else {
    img.classList.remove('anim');
    img.style.transform = '';
    img.style.opacity = '';
    swap();
  }

  const last = page === item.pages;
  els.prev.disabled = page === 1;
  els.next.classList.toggle('done', last);
  els.next.setAttribute('aria-label', last ? 'Fertig, zurück zum Menü' : 'Nächste Seite');
  els.count.textContent = `${page} / ${item.pages}`;
  setStar(els.viewerStar, loadFavorites().has(item.id));
  els.bar.style.width = `${(page / item.pages) * 100}%`;
  saveProgress(item.id, page);
  preload(item, page);
}

function step(dir) {
  if (!current) return;
  const { item, page } = current;
  const target = page + dir;
  if (target > item.pages) {
    saveProgress(item.id, 0); // fertig gebaut, nächstes Mal wieder von vorn
    goHome();
    return;
  }
  if (target < 1) return;
  location.replace(`#/${item.id}/${target}`);
}

// ---------- Wischen ----------
let swipe = null;
const zoomed = () => (window.visualViewport ? visualViewport.scale > 1.05 : false);

els.stage.addEventListener('pointerdown', (e) => {
  if (!e.isPrimary || zoomed()) { swipe = null; return; }
  swipe = { x: e.clientX, y: e.clientY, dx: 0, id: e.pointerId };
});
els.stage.addEventListener('pointermove', (e) => {
  if (!swipe || e.pointerId !== swipe.id) return;
  swipe.dx = e.clientX - swipe.x;
  if (Math.abs(swipe.dx) > Math.abs(e.clientY - swipe.y)) {
    els.page.classList.remove('anim');
    els.page.style.transform = `translateX(${swipe.dx}px)`;
  }
});
const endSwipe = (e) => {
  if (!swipe || e.pointerId !== swipe.id) return;
  const { dx } = swipe;
  swipe = null;
  const far = e.type === 'pointerup' && Math.abs(dx) > Math.min(120, window.innerWidth * 0.12);
  // Über die letzte Seite hinaus wischen beendet die Anleitung nicht, das geht nur per Knopf
  if (far && dx < 0 && current.page < current.item.pages) step(1);
  else if (far && dx > 0 && current.page > 1) step(-1);
  else {
    els.page.classList.add('anim');
    els.page.style.transform = '';
  }
};
els.stage.addEventListener('pointerup', endSwipe);
els.stage.addEventListener('pointercancel', endSwipe);
// Bei Pinch-Zoom darf der Browser frei verschieben
window.visualViewport?.addEventListener('resize', () => {
  els.stage.style.touchAction = zoomed() ? 'auto' : '';
});

// Knöpfe reagieren schon auf pointerup: Nach einer Wischgeste verschluckt Chrome sonst
// gelegentlich den ersten click. click bleibt für die Tastatur.
function onTap(el, fn) {
  let down = false;
  el.addEventListener('pointerdown', () => { down = true; });
  el.addEventListener('pointerleave', () => { down = false; });
  el.addEventListener('pointerup', (e) => {
    if (!down) return;
    down = false;
    e.preventDefault();
    fn();
  });
  // Verhindert den nachgelagerten click, der sonst auf der Menü-Kachel unter dem Finger landen kann
  el.addEventListener('touchend', (e) => e.preventDefault());
  el.addEventListener('click', (e) => { if (e.detail === 0) fn(); });
}
onTap(els.prev, () => step(-1));
onTap(els.next, () => step(1));
onTap(els.home, goHome);
onTap(els.viewerStar, () => {
  if (current) setStar(els.viewerStar, toggleFavorite(current.item.id));
});
document.addEventListener('keydown', (e) => {
  if (!els.filter.hidden && e.key === 'Escape') closeFilter();
  if (els.viewer.hidden) return;
  if (e.key === 'ArrowRight') step(1);
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'Escape') goHome();
});

// ---------- Bildschirm anlassen (nur über HTTPS/localhost verfügbar) ----------
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
    }
  } catch { /* nicht verfügbar */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !els.viewer.hidden) keepAwake(true);
});

// ---------- Vollbild ----------
const root = document.documentElement;
if (!root.requestFullscreen) els.fullscreen.hidden = true;
els.fullscreen.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else root.requestFullscreen().catch(() => {});
});

// ---------- Routing ----------
let lastRoute = null;
function route() {
  const m = location.hash.match(/^#\/([\w-]+)\/(\d+)$/);
  const item = m && list.find((i) => i.id === m[1]);
  if (!item) {
    current = null;
    lastRoute = null;
    openedFromMenu = false;
    els.viewer.hidden = true;
    els.menu.hidden = false;
    els.filter.hidden = location.hash !== '#/filter';
    if (els.filter.hidden) filterOpenedFromMenu = false;
    keepAwake(false);
    renderMenu();
    return;
  }
  const page = Math.min(Math.max(1, +m[2]), item.pages);
  const dir = lastRoute && lastRoute.id === item.id ? Math.sign(page - lastRoute.page) : 0;
  lastRoute = { id: item.id, page };
  els.menu.hidden = true;
  els.filter.hidden = true;
  els.viewer.hidden = false;
  keepAwake(true);
  showPage(item, page, dir);
}

fetch('data/index.json')
  .then((r) => r.json())
  .then((data) => {
    list = data.items;
    sets = data.sets;
    window.addEventListener('hashchange', route);
    route();
  })
  .catch(() => {
    els.menu.hidden = false;
    els.grid.textContent = 'Die Anleitungen konnten nicht geladen werden.';
  });
