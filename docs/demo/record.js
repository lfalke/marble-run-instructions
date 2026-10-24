'use strict';
// Plays through the app in Google Chrome and saves the screen as JPEG frames plus an ffmpeg concat list.
// Usage: node record.js <url> <frame dir>   (record.sh sets everything up)
const { chromium } = require('playwright-core');
const fs = require('fs');

const [url, out] = process.argv.slice(2);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: 'en-US' });
  // The server may still be starting
  for (let i = 0; ; i++) {
    try { await page.goto(url); break; } catch (e) { if (i === 20) throw e; await wait(250); }
  }
  await page.waitForSelector('#grid .card img');
  await page.waitForFunction(() => [...document.images]
    .filter((i) => i.getBoundingClientRect().top < innerHeight).every((i) => i.complete));
  await wait(500);

  // Chrome only sends a frame when the screen changes, so each frame keeps its timestamp
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = `${out}/${String(frames.length).padStart(5, '0')}.jpg`;
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, t: metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1280, maxHeight: 800 });

  // Show the marker shortly before and after each press, so every tap is clearly visible
  const tap = async (loc) => {
    const b = await loc.boundingBox();
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.evaluate(([x, y]) => tapMarker.show(x, y), [x, y]);
    await wait(350);
    await page.mouse.down();
    await wait(200);
    await page.mouse.up();
    await wait(450);
    await page.evaluate(() => tapMarker.hide());
  };
  const swipeLeft = async () => {
    await page.mouse.move(900, 420);
    await page.evaluate(() => tapMarker.show(900, 420));
    await wait(300);
    await page.mouse.down();
    await page.mouse.move(380, 400, { steps: 18 });
    await page.mouse.up();
    await wait(300);
    await page.evaluate(() => tapMarker.hide());
  };

  await wait(1300);
  await tap(page.locator('#grid .star-card').first());      // favorite
  await wait(1100);
  await tap(page.locator('#open-filter'));
  await wait(700);
  await tap(page.locator('#f-ext button').first());          // Twister
  await wait(700);
  await tap(page.locator('#lang [data-lang="de"]'));          // language there and back
  await wait(1200);
  await tap(page.locator('#lang [data-lang="en"]'));
  await wait(700);
  await tap(page.locator('#filter-done'));
  await wait(1100);
  await tap(page.locator('#favs .card').first());            // open the favorite
  await wait(800);
  await swipeLeft();
  await wait(700);
  await swipeLeft();
  await wait(800);
  await tap(page.locator('#home'));                          // shows "continue at 3"
  await wait(2000);

  await cdp.send('Page.stopScreencast');
  await wait(300);
  const lines = [];
  frames.forEach((f, i) => {
    const next = frames[i + 1] ? frames[i + 1].t : f.t + 0.5;
    lines.push(`file '${f.file}'`, `duration ${(next - f.t).toFixed(3)}`);
  });
  lines.push(`file '${frames[frames.length - 1].file}'`);
  fs.writeFileSync(`${out}/list.txt`, lines.join('\n') + '\n');
  console.log(`${frames.length} frames, ${(frames[frames.length - 1].t - frames[0].t).toFixed(1)} s`);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
