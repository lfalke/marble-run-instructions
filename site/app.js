'use strict';

const $ = (id) => document.getElementById(id);
const els = {
  menu: $('menu'), grid: $('grid'), viewer: $('viewer'), stage: $('stage'), page: $('page'),
  home: $('home'), prev: $('prev'), next: $('next'), count: $('count'), bar: $('bar'),
  fullscreen: $('fullscreen'), favs: $('favs'), favsSection: $('favs-section'), allTitle: $('all-title'),
  viewerStar: $('viewer-star'), reset: $('reset'), openFilter: $('open-filter'), filter: $('filter'),
  fBox: $('f-box'), fExt: $('f-ext'), fLevel: $('f-level'), filterReset: $('filter-reset'),
  filterDone: $('filter-done'), filterCount: $('filter-count'), empty: $('empty'), emptyReset: $('empty-reset'),
  lang: $('lang'),
};
const STAR_SVG = els.viewerStar.innerHTML;

// ---------- Language (follows the browser unless chosen in the filter) ----------
const TEXT = {
  en: {
    title: 'Marble Run Instructions', heading: 'Marble runs', filter: 'Filter', resetFilter: 'Reset filter',
    fullscreen: 'Fullscreen', favorites: 'Favorites', allRuns: 'All runs', resetAll: 'Reset everything',
    boxes: 'Building boxes', expansions: 'Expansions', difficulty: 'Difficulty', language: 'Language', home: 'Back to the menu',
    prev: 'Previous page', next: 'Next page', finish: 'Done, back to the menu',
    favAdd: 'Add to favorites', favRemove: 'Remove from favorites',
    level: (n) => `Difficulty ${n} of 3`, pages: (n) => `${n} pages`, parts: (n) => `${n} parts`,
    resume: (n) => `continue at ${n}`, filterDone: (n) => `Done, ${n} runs`,
    pageAlt: (title, page, pages) => `${title}, page ${page} of ${pages}`,
    loadError: 'The instructions could not be loaded.',
  },
  de: {
    title: 'Kugelbahn Anleitungen', heading: 'Kugelbahnen', filter: 'Filter', resetFilter: 'Filter zurücksetzen',
    fullscreen: 'Vollbild', favorites: 'Lieblinge', allRuns: 'Alle Bahnen', resetAll: 'Alles zurücksetzen',
    boxes: 'Baukästen', expansions: 'Erweiterungen', difficulty: 'Schwierigkeit', language: 'Sprache', home: 'Zurück zum Menü',
    prev: 'Vorherige Seite', next: 'Nächste Seite', finish: 'Fertig, zurück zum Menü',
    favAdd: 'Als Liebling merken', favRemove: 'Kein Liebling mehr',
    level: (n) => `Schwierigkeit ${n} von 3`, pages: (n) => `${n} Seiten`, parts: (n) => `${n} Teile`,
    resume: (n) => `weiter bei ${n}`, filterDone: (n) => `Fertig, ${n} Bahnen`,
    pageAlt: (title, page, pages) => `${title}, Seite ${page} von ${pages}`,
    loadError: 'Die Anleitungen konnten nicht geladen werden.',
  },
};
const LANG = 'marble-run-lang';
let lang = (navigator.language || '').toLowerCase().startsWith('de') ? 'de' : 'en';
try {
  const chosen = localStorage.getItem(LANG);
  if (TEXT[chosen]) lang = chosen;
} catch { /* private mode or similar */ }
let t = TEXT[lang];
// Set names and titles from index.json come with one entry per language
const tr = (names) => names[lang] ?? names.en;
function applyLanguage() {
  t = TEXT[lang];
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t[el.dataset.t];
  for (const el of document.querySelectorAll('[data-t-label]')) el.setAttribute('aria-label', t[el.dataset.tLabel]);
  for (const btn of els.lang.children) btn.setAttribute('aria-pressed', btn.dataset.lang === lang);
}
applyLanguage();

let list = [];
let sets = []; // building boxes and expansions from index.json, in display order
let current = null; // { item, page }
let openedFromMenu = false;
let filterOpenedFromMenu = false;

// ---------- Progress (only a convenience, may be missing) ----------
const STORE = 'marble-run-progress';
const FAVS = 'marble-run-favorites';
const FILTER = 'marble-run-filter';
// Take over what was stored under the old keys, so favorites and progress are kept
try {
  for (const [from, to] of [
    ['hubelino-progress', STORE], ['hubelino-favorites', FAVS],
    ['kugelbahn-progress', STORE], ['kugelbahn-favorites', FAVS], ['kugelbahn-filter', FILTER],
  ]) {
    const old = localStorage.getItem(from);
    if (old !== null && localStorage.getItem(to) === null) localStorage.setItem(to, old);
    localStorage.removeItem(from);
  }
} catch { /* private mode or similar */ }
// Page 1 is the cover, page 2 the parts list: only from the first building step on is there something to continue
const MIN_RESUME_PAGE = 3;
function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(STORE)) || {};
    for (const id in p) if (p[id] < MIN_RESUME_PAGE) delete p[id];
    return p;
  } catch { return {}; }
}
function saveProgress(id, page) {
  // Briefly going back to the parts list should not discard the saved page
  if (page && page < MIN_RESUME_PAGE) return;
  try {
    const p = loadProgress();
    if (page) p[id] = page; else delete p[id];
    localStorage.setItem(STORE, JSON.stringify(p));
  } catch { /* private mode or similar */ }
}

function loadFavorites() {
  try { return new Set(JSON.parse(localStorage.getItem(FAVS)) || []); } catch { return new Set(); }
}
function toggleFavorite(id) {
  const favs = loadFavorites();
  if (favs.has(id)) favs.delete(id); else favs.add(id);
  try { localStorage.setItem(FAVS, JSON.stringify([...favs])); } catch { /* see above */ }
  return favs.has(id);
}
// Filter: selected building boxes/expansions and difficulties. Without an entry the default from
// instructions.json applies, so later changes there also take effect after a reset.
const LEVELS = [1, 2, 3];
const defaultFilter = () => ({ sets: sets.filter((s) => s.default).map((s) => s.key), levels: [...LEVELS] });
function loadFilter() {
  try {
    const f = JSON.parse(localStorage.getItem(FILTER));
    // A set that no longer exists (e.g. renamed) would hide its instructions for good: start over
    if (Array.isArray(f?.sets) && Array.isArray(f?.levels)
      && f.sets.every((key) => sets.some((s) => s.key === key))) return f;
  } catch { /* see above */ }
  return defaultFilter();
}
function saveFilter(f) {
  try { localStorage.setItem(FILTER, JSON.stringify(f)); } catch { /* see above */ }
}
function resetFilter() {
  try { localStorage.removeItem(FILTER); } catch { /* see above */ }
}
const sameItems = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const isDefaultFilter = (f) => {
  const d = defaultFilter();
  return sameItems(f.sets, d.sets) && sameItems(f.levels, d.levels);
};
// An instruction only appears when everything it needs is selected
const matches = (item, f) =>
  item.components.every((c) => f.sets.includes(c)) && f.levels.includes(item.level);

function setStar(btn, on) {
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', on);
  btn.setAttribute('aria-label', on ? t.favRemove : t.favAdd);
}

const src = (item, page) => `data/${item.id}/${page}.jpg?v=${item.rev}`;
const ballsHTML = (level) => `
  <span class="balls" data-level="${level}" aria-label="${t.level(level)}">
    ${[1, 2, 3].map((n) => `<i class="${n <= level ? 'on' : ''}"></i>`).join('')}
  </span>`;

// Building box: color + short name, expansion: icon (the kids can hardly read yet)
function setBadge(set, className) {
  const el = document.createElement('span');
  el.className = `${className} ${className}-${set.kind}`;
  if (set.kind === 'ext') {
    el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${set.icon}</svg>`;
    el.setAttribute('aria-label', tr(set.name));
    el.title = tr(set.name);
  } else {
    el.style.setProperty('--c', set.color);
    el.textContent = tr(set.name);
  }
  return el;
}

// ---------- Menu ----------
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
        <span>${t.pages(item.pages)}${item.parts ? ` · ${t.parts(item.parts)}` : ''}</span>
        ${resume ? `<span class="resume">${t.resume(resume)}</span>` : ''}
      </div>`;
    btn.querySelector('.card-title').textContent = tr(item.title);
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
  // Favorites additionally at the top and regardless of the filter, so no starred favorite disappears
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
    if (s.kind === 'ext') content.append(Object.assign(document.createElement('span'), { textContent: tr(s.name) }));
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
  els.filterDone.setAttribute('aria-label', t.filterDone(count));
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
for (const btn of els.lang.children) {
  btn.addEventListener('click', () => {
    lang = btn.dataset.lang;
    try { localStorage.setItem(LANG, lang); } catch { /* see above */ }
    applyLanguage();
    renderMenu();
  });
}
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
    img.alt = t.pageAlt(tr(item.title), page, item.pages);
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
  els.next.setAttribute('aria-label', last ? t.finish : t.next);
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
    saveProgress(item.id, 0); // finished building, start from the beginning next time
    goHome();
    return;
  }
  if (target < 1) return;
  location.replace(`#/${item.id}/${target}`);
}

// ---------- Swiping ----------
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
  // Swiping past the last page does not finish the instruction, only the button does
  if (far && dx < 0 && current.page < current.item.pages) step(1);
  else if (far && dx > 0 && current.page > 1) step(-1);
  else {
    els.page.classList.add('anim');
    els.page.style.transform = '';
  }
};
els.stage.addEventListener('pointerup', endSwipe);
els.stage.addEventListener('pointercancel', endSwipe);
// While pinch-zoomed the browser may pan freely
window.visualViewport?.addEventListener('resize', () => {
  els.stage.style.touchAction = zoomed() ? 'auto' : '';
});

// Buttons already react on pointerup: after a swipe Chrome otherwise occasionally
// swallows the first click. click stays for the keyboard.
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
  // Prevents the delayed click that could otherwise land on the menu card under the finger
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

// ---------- Keep the screen on (only available over HTTPS/localhost) ----------
// Promise of the pending request, so quick taps do not request several locks
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock) {
      wakeLock = navigator.wakeLock.request('screen');
      (await wakeLock).addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await (await wakeLock).release();
    }
  } catch { wakeLock = null; /* not available */ }
}
// Without a touch the screen may turn off after 10 minutes, in case the tablet is forgotten
const AWAKE_MS = 10 * 60 * 1000;
let idleTimer = null;
function stayAwake() {
  clearTimeout(idleTimer);
  if (els.viewer.hidden) {
    keepAwake(false);
    return;
  }
  keepAwake(true);
  idleTimer = setTimeout(() => keepAwake(false), AWAKE_MS);
}
document.addEventListener('pointerdown', stayAwake, { passive: true });
document.addEventListener('keydown', stayAwake);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') stayAwake();
});

// ---------- Fullscreen ----------
const root = document.documentElement;
// As an installed app it already runs fullscreen (manifest). Only check at startup: a tab in
// fullscreen also reports display-mode: fullscreen, there the button is needed to leave it.
const installed = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
if (!root.requestFullscreen || installed) els.fullscreen.hidden = true;
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
    stayAwake();
    renderMenu();
    return;
  }
  const page = Math.min(Math.max(1, +m[2]), item.pages);
  const dir = lastRoute && lastRoute.id === item.id ? Math.sign(page - lastRoute.page) : 0;
  lastRoute = { id: item.id, page };
  els.menu.hidden = true;
  els.filter.hidden = true;
  els.viewer.hidden = false;
  stayAwake();
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
    els.grid.textContent = t.loadError;
  });
