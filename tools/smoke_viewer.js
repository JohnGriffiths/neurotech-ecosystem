#!/usr/bin/env node
/* Headless check of the built viewer. Needs Playwright with Chromium.

     python tools/ntgraph.py build && python -m http.server -d dist 8765 &
     node tools/smoke_viewer.js http://localhost:8765 [screenshot.png]

   Loads the page, confirms the 3D view came up, selects a node, switches to 2D, and exits non-zero on any
   page error. The Chromium flags enable software WebGL, without which the viewer falls back to 2D. */
const { chromium } = require("playwright");

(async () => {
  const [url = "http://localhost:8765", shot] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("requestfailed", (r) => errors.push(`request failed: ${r.url()}`));

  await page.goto(url);
  await page.waitForTimeout(6000);
  const mode3d = await page.evaluate(() => document.body.dataset.mode);
  const stats = await page.textContent("#stats");

  await page.fill("#search", "eeg-expy");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  const selected = await page.textContent("#detail h2");
  if (shot) await page.screenshot({ path: shot });

  await page.click('#dims button[data-v="2d"]');
  await page.waitForTimeout(2500);
  const mode2d = await page.evaluate(() => document.body.dataset.mode);
  await browser.close();

  console.log({ mode3d, mode2d, selected, stats, errors });
  const ok = mode3d === "3d" && mode2d === "2d" && selected === "EEG-ExPy" && errors.length === 0;
  process.exit(ok ? 0 : 1);
})();
