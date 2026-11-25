// Captures README and case-study screenshots from a running Ostool.
import puppeteer from 'puppeteer-core';
const U = (process.argv[2] || 'http://localhost:3100').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
const errs = [];
async function shot(name, pin, route, lang, w, h, full = false, pre) {
  const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => errs.push(name + ': ' + e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(name + ': ' + m.text()));
  await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.type('#pin', pin); await p.keyboard.press('Enter'); await p.waitForSelector('.top', { timeout: 15000 }); await sleep(400);
  if (route) { await p.evaluate((r) => (location.hash = '#/' + r), route); await sleep(600); }
  if (pre) { await pre(p); await sleep(500); }
  await p.screenshot({ path: `docs/${name}.png`, fullPage: full }); await ctx.close(); console.log(name);
}
const clickSel = async (p, sel) => { await p.waitForSelector(sel); await p.click(sel); };
await shot('dashboard-en', '1111', 'dashboard', 'en', 1440, 1000, true);
await shot('vehicles-en', '2222', 'vehicles', 'en', 1440, 1000, true);
await shot('service-en', '2222', 'service', 'en', 1440, 1000, false);
await shot('orders-en', '2222', 'orders', 'en', 1440, 1000, true);
await shot('order-en', '3333', 'orders', 'en', 1440, 1100, false, async (p) => { await clickSel(p, '.kan4 section:nth-child(2) .req'); });
await shot('vehicle-en', '2222', 'vehicles', 'en', 1440, 1100, false, async (p) => { await clickSel(p, '.ucard.beh'); });
await shot('parts-en', '3333', 'parts', 'en', 1440, 900, false);
await shot('reports-en', '1111', 'reports', 'en', 1440, 1000, true);
await shot('dashboard-ar', '1111', 'dashboard', 'ar', 1440, 1150, false);
await shot('orders-ar', '2222', 'orders', 'ar', 1440, 900, false);
await shot('driver-ar-mobile', '4444', 'home', 'ar', 390, 1500, false);
await shot('service-ar-mobile', '2222', 'service', 'ar', 390, 900, false);
await b.close(); if (errs.length) { console.log('ERRORS', errs); process.exit(1); }
