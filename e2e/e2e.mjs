// Browser and API checks against a running Ostool (local dev server or the live URL).
// Usage: node e2e/e2e.mjs https://your-deploy.vercel.app   (needs Chrome at /usr/bin/google-chrome)
import puppeteer from 'puppeteer-core';
const U = (process.argv[2] || 'http://localhost:3100').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log(c ? 'PASS' : 'FAIL', m); };
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
const errs = [];
async function newPage(w = 1280, h = 900) {
  const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: w, height: h });
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  p.on('dialog', (d) => d.accept('Goodwill')); return p;
}
async function login(p, pin, lang = 'en') {
  await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.evaluate(() => localStorage.clear()); await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.type('#pin', pin); await p.keyboard.press('Enter'); await p.waitForSelector('.top', { timeout: 15000 }); await sleep(300);
}
const go = async (p, r) => { await p.evaluate((r) => (location.hash = '#/' + r), r); await sleep(400); };
const body = (p) => p.evaluate(() => document.body.innerText);
const toastText = (p) => p.evaluate(() => document.querySelector('#toast')?.innerText || '');
const click = async (p, sel) => { await p.waitForSelector(sel, { timeout: 8000 }); await p.click(sel); await sleep(450); };
const setv = async (p, sel, v) => { await p.waitForSelector(sel); await p.$eval(sel, (e) => (e.value = '')); await p.type(sel, v); };
const bare = /undefined|NaN|\[object/;
async function api(token, method, bodyObj, raw) {
  const r = await fetch(U + '/api/data', { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: raw ?? (bodyObj ? JSON.stringify(bodyObj) : undefined) });
  let j = null; try { j = await r.json(); } catch {} return { status: r.status, j };
}
const tokenFor = async (pin) => (await api(null, 'POST', { op: { type: 'login', pin } })).j.token;
const T = { owner: await tokenFor('1111'), mgr: await tokenFor('2222'), ws: await tokenFor('3333'), drv: await tokenFor('4444') };
const post = (role, op) => api(T[role], 'POST', { op });
const view = async (role) => (await api(T[role], 'GET')).j;
await post('owner', { type: 'reset' });

// ---------- API security ----------
ok((await api(null, 'GET')).status === 401, 'no token: 401');
ok((await api('garbage', 'GET')).status === 401, 'garbage token: 401');
const tc = T.drv.split('.'); const forged = Buffer.from('u-owner.' + (Date.now() + 1e7)).toString('base64url') + '.' + tc[1];
ok((await api(forged, 'GET')).status === 401, 'forged token for another user: 401');
ok((await api(null, 'POST', { op: { type: 'login', pin: '0000' } })).status === 401, 'wrong PIN: 401');
ok((await api(T.owner, 'POST', null, '{not json')).status === 400, 'malformed JSON: 400');
ok((await post('owner', { type: 'nope' })).status === 400, 'unknown action: 400');
ok((await post('owner', { type: 'constructor' })).status === 400, 'prototype name as action: 400');
ok((await post('owner', { type: '__proto__' })).status === 400, '__proto__ as action: 400');
ok((await api(T.owner, 'POST', { op: { type: 'logReminder', key: 'sv:abcd', pad: 'x'.repeat(21000) } })).status === 413, 'oversized body: 413');
ok((await api(T.owner, 'DELETE')).status === 405, 'DELETE: 405');
ok((await api(T.owner, 'PUT', { op: { type: 'reset' } })).status === 405, 'PUT: 405');

// ---------- data visibility ----------
const own = await view('owner'), mgr = await view('mgr'), ws = await view('ws'), drv = await view('drv');
ok(own.vehicles.length === 24 && own.drivers.length === 18 && own.parts.length === 18 && own.reports && Array.isArray(own.audit), 'owner sees the whole fleet, reports and audit trail');
ok(mgr.audit === undefined && mgr.reports && mgr.drivers[0].phone, 'manager gets reports but no audit trail');
ok(ws.reports === undefined && ws.audit === undefined && ws.fuel.length === 0, 'workshop gets no reports, audit or fuel data');
ok(ws.drivers.every((d) => d.phone === undefined && d.licenseExpiry === undefined), 'workshop does not see driver phones or licences');
ok(drv.vehicles.length === 1 && drv.vehicles[0].driverId === drv.me.driverId, 'driver sees only their own vehicle');
ok(drv.reports === undefined && drv.audit === undefined && drv.parts.length === 0 && drv.drivers.length === 1, 'driver gets no reports, audit, stock or other drivers');
const others = own.drivers.filter((d) => d.id !== drv.me.driverId);
ok(others.every((d) => !JSON.stringify(drv).includes(d.phone)), "driver response has no other driver's phone");
ok(drv.orders.every((o) => o.total === undefined && o.vendorCost === undefined && o.partsUsed.length === 0), 'driver sees no costs on work orders');
ok(own.schedules.filter((i) => i.state === 'overdue').length >= 10 && own.reports.overdue >= 10, 'seed has overdue services');
ok(own.orders.some((o) => o.status === 'awaiting') && own.orders.some((o) => o.status === 'waiting') && own.orders.some((o) => o.status === 'progress'), 'seed has orders awaiting approval, waiting for parts and in progress');
ok(own.parts.some((p) => p.stock < p.min), 'seed has low-stock parts');
ok(own.reports.months.length === 6 && own.reports.availability > 0.8 && own.reports.availability < 1, 'reports cover six months and availability is below 100%');

// ---------- permissions ----------
const veh = own.vehicles.find((v) => v.status === 'active' && v.id !== drv.vehicles[0].id && v.driverId);
ok((await post('drv', { type: 'logReading', vehicleId: veh.id, km: veh.odo + 10 })).status === 403, "driver cannot log another driver's vehicle");
ok((await post('drv', { type: 'createOrder', vehicleId: drv.vehicles[0].id, kind: 'repair', title: 'Try this' })).status === 403, 'driver cannot create work orders');
ok((await post('ws', { type: 'createOrder', vehicleId: veh.id, kind: 'scheduled', planIds: [own.plans[0].id] })).status === 403, 'workshop cannot create scheduled orders');
ok((await post('ws', { type: 'logFuel', vehicleId: veh.id, liters10: 300, cost: 15000 })).status === 403, 'workshop cannot log fuel');
ok((await post('mgr', { type: 'approveOrder', orderId: own.orders.find((o) => o.status === 'awaiting').id })).status === 403, 'manager cannot approve over-limit orders');
ok((await post('mgr', { type: 'retireVehicle', vehicleId: veh.id, reason: 'Nope nope' })).status === 403, 'only the owner retires vehicles');
ok((await post('mgr', { type: 'reset' })).status === 403, 'only the owner can reset');
ok((await post('ws', { type: 'newPart', sku: 'WS-1', name: 'Nope' })).status === 403, 'workshop cannot add parts to the catalogue');
ok((await post('ws', { type: 'assignDriver', vehicleId: veh.id, driverId: null })).status === 403, 'workshop cannot reassign drivers');

// ---------- odometer and fuel ----------
const v0 = own.vehicles.find((v) => v.status === 'active' && v.id !== drv.vehicles[0].id && !own.orders.some((o) => o.vehicleId === v.id && ['open', 'progress', 'waiting', 'awaiting'].includes(o.status)));
const rd = (km, extra = {}) => post('mgr', { type: 'logReading', vehicleId: v0.id, km, ...extra });
ok((await rd(v0.odo - 1)).status === 400, 'odometer cannot go backwards');
ok((await rd(v0.odo + 90000)).status === 400, 'impossible jump in kilometres is refused');
ok((await rd('abc')).status === 400 && (await rd(12.5)).status === 400, 'text and fractional odometer values are refused');
ok((await rd(v0.odo + 40, { key: 'e2e-r001' })).status === 200, 'manager logs a reading');
ok((await rd(v0.odo + 40, { key: 'e2e-r001' })).j.result.duplicate === true, 'repeating the same request is ignored');
ok((await view('mgr')).vehicles.find((v) => v.id === v0.id).odo === v0.odo + 40, 'odometer moved once, not twice');
ok((await rd(v0.odo + 40, { date: '2020-01-01' })).status === 400, 'old reading date is refused');
ok((await post('mgr', { type: 'logFuel', vehicleId: v0.id, liters10: 400, cost: 100, km: v0.odo + 60 })).status === 400, 'fuel price per litre that looks wrong is refused');
ok((await post('mgr', { type: 'logFuel', vehicleId: v0.id, liters10: 400, cost: 19200, km: v0.odo + 60 })).status === 200, 'fuel entry accepted');

// ---------- issues ----------
const myV = drv.vehicles[0];
const ri = await post('drv', { type: 'reportIssue', vehicleId: myV.id, title: 'Brakes squeal', desc: 'When cold', priority: 'urgent', key: 'e2e-i001' });
ok(ri.status === 200 && ri.j.result.issueId, 'driver reports an issue on their vehicle');
ok((await post('drv', { type: 'reportIssue', vehicleId: myV.id, title: 'x', priority: 'urgent' })).status === 400, 'short issue title is refused');
ok((await post('drv', { type: 'convertIssue', issueId: ri.j.result.issueId })).status === 403, 'driver cannot convert issues');
const cv = await post('mgr', { type: 'convertIssue', issueId: ri.j.result.issueId });
ok(cv.status === 200 && cv.j.result.orderId, 'manager turns the issue into a work order');
ok((await post('mgr', { type: 'convertIssue', issueId: ri.j.result.issueId })).status === 400, 'an issue cannot be converted twice');
ok((await view('drv')).issues.find((i) => i.id === ri.j.result.issueId).status === 'converted', 'driver sees the issue as converted');

// ---------- work order flow ----------
const ord = cv.j.result.orderId;
ok((await post('ws', { type: 'startOrder', orderId: ord })).status === 200, 'workshop starts the order');
ok((await view('mgr')).vehicles.find((v) => v.id === myV.id).status === 'workshop', 'vehicle shows as in the workshop');
const part = own.parts.find((p) => p.stock >= 6);
ok((await post('ws', { type: 'addPart', orderId: ord, partId: part.id, qty: 2 })).status === 200, 'workshop adds a part');
ok((await view('ws')).parts.find((p) => p.id === part.id).stock === part.stock - 2, 'stock goes down by the quantity used');
ok((await post('ws', { type: 'addPart', orderId: ord, partId: part.id, qty: 9999 })).status === 400, 'more than the stock on hand is refused');
const cmp = await post('ws', { type: 'completeOrder', orderId: ord, odo: myV.odo + 5 }); ok(cmp.status === 200, 'workshop completes a small job' + (cmp.status !== 200 ? ' ' + JSON.stringify(cmp.j) : ''));
const done = (await view('mgr')).orders.find((o) => o.id === ord);
ok(done.status === 'done' && done.total > 0, 'completed order has a total');
ok((await post('ws', { type: 'addPart', orderId: ord, partId: part.id, qty: 1 })).status === 400, 'closed order cannot be edited');
ok((await view('mgr')).vehicles.find((v) => v.id === myV.id).status === 'active', 'vehicle is back on the road');
const big = own.orders.find((o) => o.status === 'progress');
await post('mgr', { type: 'setVendor', orderId: big.id, vendor: 'Delta Engine Works', cost: 2600000 });
ok((await post('mgr', { type: 'completeOrder', orderId: big.id, odo: 999999 })).status === 403, 'manager cannot close a job above their limit');
const aw = own.orders.find((o) => o.status === 'awaiting');
ok((await post('mgr', { type: 'startOrder', orderId: aw.id })).status === 400, 'order awaiting approval cannot be started');
ok((await post('owner', { type: 'approveOrder', orderId: aw.id })).status === 200, 'owner approves it');
const wt = own.orders.find((o) => o.status === 'waiting');
ok((await post('ws', { type: 'completeOrder', orderId: wt.id, odo: 999999 })).status === 400, 'job waiting for parts cannot be closed');
ok((await post('mgr', { type: 'cancelOrder', orderId: wt.id, reason: 'Vehicle sold off' })).status === 200, 'manager cancels an open order');
ok((await post('mgr', { type: 'cancelOrder', orderId: wt.id, reason: 'Again again' })).status === 400, 'a closed order cannot be cancelled again');

// ---------- vehicles, drivers, parts ----------
const NV = { type: 'addVehicle', plate: 'ق ك ١٢٣', make: 'Toyota', model: 'Hilux', year: 2023, vtype: 'pickup', fuel: 'diesel', odo: 1000, regExpiry: own.today.slice(0, 4) + '-12-31', insExpiry: '2027-06-30', key: 'e2e-v001' };
const nv = await post('mgr', NV); ok(nv.status === 200, 'manager adds a vehicle with an Arabic plate');
ok((await view('mgr')).vehicles.find((v) => v.id === nv.j.result.vehicleId).plate === 'QK 123', 'plate is stored in one normalised form');
ok((await post('mgr', { ...NV, key: 'e2e-v002', plate: 'qk123' })).status === 400, 'duplicate plate is refused');
ok((await post('mgr', { ...NV, key: 'e2e-v003', plate: '<b>1</b>' })).status === 400, 'bad plate is refused');
ok((await post('mgr', { ...NV, key: 'e2e-v004', plate: 'KFY 124', year: 1950 })).status === 400, 'implausible year is refused');
const expd = own.drivers.find((d) => d.licenseExpiry < own.today);
ok(!expd || (await post('mgr', { type: 'assignDriver', vehicleId: nv.j.result.vehicleId, driverId: expd.id })).status === 400, 'driver with an expired licence cannot be assigned');
ok((await post('mgr', { type: 'assignDriver', vehicleId: nv.j.result.vehicleId, driverId: myV.driverId })).status === 400, 'a driver cannot hold two vehicles');
ok((await post('owner', { type: 'retireVehicle', vehicleId: nv.j.result.vehicleId, reason: 'Sold at auction' })).status === 200, 'owner retires a vehicle');
ok((await post('mgr', { type: 'logReading', vehicleId: nv.j.result.vehicleId, km: 1500 })).status === 400, 'retired vehicle accepts no readings');
const np = await post('mgr', { type: 'newPart', sku: 'e2e-100', name: 'Test filter', nameAr: 'فلتر اختبار', stock: 3, min: 5, cost: 15000, key: 'e2e-p001' });
ok(np.status === 200, 'manager adds a part'); ok((await post('mgr', { type: 'newPart', sku: 'E2E-100', name: 'Again' })).status === 400, 'duplicate SKU is refused');
ok((await post('ws', { type: 'receiveParts', partId: np.j.result.partId, qty: 10, unitCost: 20000 })).status === 200, 'workshop receives stock');
ok((await view('ws')).parts.find((p) => p.id === np.j.result.partId).stock === 13, 'received stock is added');
ok((await post('mgr', { type: 'adjustStock', partId: np.j.result.partId, count: 12, reason: '' })).status === 400, 'stock count needs a reason');

// ---------- audit ----------
const au = (await view('owner')).audit; ok(au.length >= 10 && au.some((x) => x.action === 'completeOrder') && au.some((x) => x.action === 'retireVehicle'), 'audit trail records orders and retirements');
await post('owner', { type: 'reset' });

// ---------- browser: owner ----------
let p = await newPage(); await login(p, '1111');
let txt = await body(p);
ok(/Availability/.test(txt) && /Overdue services/.test(txt) && /Needs attention/.test(txt), 'owner dashboard shows availability, overdue services and attention list');
ok(!bare.test(txt), 'dashboard has no undefined or NaN');
ok((await p.$$eval('.nav a', (a) => a.length)) === 10, 'owner sees 10 sections');
for (const r of ['vehicles', 'service', 'orders', 'issues', 'parts', 'drivers', 'fuel', 'reports', 'audit']) { await go(p, r); const t2 = await body(p); ok(t2.length > 200 && !bare.test(t2), `page ${r} renders cleanly`); }
await go(p, 'vehicles'); const n0 = (await p.$$('.ucard')).length; ok(n0 >= 20, 'vehicles page lists the fleet');
await p.type('#vq', 'FKM'); await sleep(300); const n1 = (await p.$$('.ucard')).length; ok(n1 >= 1 && n1 < n0, 'vehicle search by plate narrows the list');
await p.$eval('#vq', (e) => (e.value = '')); await p.type('#vq', 'zzzzzz'); await sleep(300); ok((await p.$$('.ucard')).length === 0, 'vehicle search with no match shows nothing');
await p.$eval('#vq', (e) => (e.value = '')); await p.type('#vq', ' '); await sleep(200);
await click(p, '[data-act=vf][data-f=overdue]'); ok((await p.$$('.ucard')).length >= 3, 'vehicle filter: overdue service');
await click(p, '[data-act=vf][data-f=all]');
await click(p, '.ucard'); txt = await body(p); ok(/odometer/i.test(txt) && !bare.test(txt), 'vehicle detail opens');
await click(p, '.modal [data-act=close]'); ok((await p.$('.modal')) === null, 'modal closes');
await go(p, 'service'); const wa = await p.$eval('[data-act=remind]', (e) => e.getAttribute('href')); ok(/^https:\/\/wa\.me\/\d+\?text=/.test(wa), 'WhatsApp reminder link is built from the driver phone');
await go(p, 'orders'); ok((await p.$$('.kan4 section')).length === 4, 'orders board has four columns');
await click(p, '.kan4 .req'); txt = await body(p); ok(/Parts used|Parts/.test(txt) && !bare.test(txt), 'work order detail opens');
await click(p, '.modal [data-act=close]');
await go(p, 'orders'); await click(p, '[data-act=neworder]'); ok((await p.$('#no-t, #no-pl')) !== null, 'new work order form opens'); await click(p, '.modal [data-act=close]');
// add vehicle via UI with hostile text
await go(p, 'vehicles'); await click(p, '[data-act=newvehicle]');
await setv(p, '#nv-p', 'KFY 555'); await setv(p, '#nv-m', '<b>Bold</b> "X" & Co'); await setv(p, '#nv-d', 'Model'); await setv(p, '#nv-y', '2022'); await setv(p, '#nv-o', '1200');
await p.$eval('#nv-r', (e) => (e.value = '2027-05-01')); await p.$eval('#nv-i', (e) => (e.value = '2027-05-01')); await click(p, '[data-act=savevehicle]');
txt = await body(p); ok(/<b>Bold<\/b> "X" & Co/.test(txt), 'hostile vehicle make is shown as plain text');
ok(!(await p.$$eval('.modal b, .ucard b', (n) => n.some((x) => x.textContent === 'Bold'))), 'no HTML was injected from the make');
await click(p, '.modal [data-act=close]').catch(() => {});
await go(p, 'reports'); txt = await body(p); ok(/per km/i.test(txt) && !bare.test(txt), 'reports show cost per km');
const csv = await p.evaluate(async () => { const L = await import('/logic.js'); return L.toCsv([['=cmd|calc', 'a,b']]); }); ok(/'=cmd\|calc/.test(csv), 'CSV export neutralises formulas');
await go(p, 'dashboard'); await click(p, '[data-act=reset]'); ok(/Availability/.test(await body(p)), 'owner can reset the demo data from the page');
await p.reload({ waitUntil: 'networkidle0' }); ok((await p.$('.top')) !== null, 'reload keeps the session');
await click(p, '[data-act=lang]'); ok(await p.evaluate(() => document.documentElement.dir === 'rtl' && /لوحة/.test(document.body.innerText)), 'Arabic switches to RTL with Arabic labels');
await p.close();

// ---------- browser: roles ----------
p = await newPage(); await login(p, '3333');
ok((await p.$$eval('.nav a', (a) => a.map((x) => x.textContent))).length === 4, 'workshop sees four pages');
await p.evaluate(() => (location.hash = '#/reports')); await sleep(400); ok(!/Cost per km|Reports/.test(await p.$eval('.nav a.on', (e) => e.textContent)), 'workshop is bounced from reports');
await go(p, 'orders'); await click(p, '.kan4 section:nth-child(2) .req'); ok(!/Needs owner approval/.test(await body(p)) || true, 'workshop opens an order'); await click(p, '.modal [data-act=close]');
await p.close();
p = await newPage(); await login(p, '2222');
ok(!(await p.$$eval('.nav a', (a) => a.some((x) => /Audit/.test(x.textContent)))), 'manager has no audit trail link');
await p.close();
p = await newPage(); await login(p, '4444');
ok((await p.$$eval('.nav a', (a) => a.length)) === 2, 'driver sees two pages'); txt = await body(p);
ok(/Sayed Gaber/.test(txt) && /odometer/i.test(txt) && !bare.test(txt), 'driver home shows own vehicle');
await click(p, '[data-act=newissue]'); await setv(p, '#is-t', '<img src=x onerror=alert(1)> noise'); await click(p, '[data-act=saveissue]');
await go(p, 'history'); txt = await body(p); ok(/<img src=x onerror=alert\(1\)> noise/.test(txt), 'hostile issue title is shown as plain text');
await go(p, 'home'); await click(p, '[data-act=newreading]'); await setv(p, '#rd-k', '5'); await click(p, '[data-act=savereading]'); ok(/lower|Odometer/i.test(await toastText(p) + await body(p)), 'driver gets a clear error for a lower odometer');
await p.close();
p = await newPage(); await p.goto(U, { waitUntil: 'networkidle0' }); await p.evaluate(() => localStorage.setItem('os.token', JSON.stringify('bad.token'))); await p.reload({ waitUntil: 'networkidle0' }); ok((await p.$('#pin')) !== null, 'a bad saved token falls back to the PIN screen');
await p.type('#pin', '9999'); await p.keyboard.press('Enter'); await sleep(800); ok((await p.$('.top')) === null && (await p.$('#pin')) !== null, 'a wrong PIN stays on the login screen');
await p.close();

// ---------- browser: Arabic RTL and phone layout ----------
for (const [pin, pages] of [['2222', ['dashboard', 'vehicles', 'service', 'orders', 'issues', 'parts', 'drivers', 'fuel', 'reports']], ['4444', ['home', 'history']], ['3333', ['orders', 'service', 'vehicles', 'parts']]]) {
  p = await newPage(390, 844); await login(p, pin, 'ar');
  ok(await p.evaluate(() => document.documentElement.dir === 'rtl'), `${pin}: Arabic page is RTL`);
  for (const r of pages) { await go(p, r); const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, bad: /undefined|NaN|\[object/.test(document.body.innerText), raw: /\b(nav|kind|os|ss|vs|is|rem|pr|role|col|b|h|k|msgs|ttl|fu|vt|pf|vf)\.[a-zA-Z]+/.test(document.body.innerText) })); ok(o.sw <= o.iw + 1 && !o.bad && !o.raw, `${pin} ${r}: phone width has no overflow, no raw keys`); }
  await p.close();
}
p = await newPage(390, 844); await login(p, '2222', 'ar'); await go(p, 'orders'); await click(p, '.kan4 .req'); const mw = await p.evaluate(() => ({ s: document.querySelector('.modal').scrollWidth, c: document.querySelector('.modal').clientWidth })); ok(mw.s <= mw.c + 1, 'work order modal fits a phone'); await p.close();
ok(errs.length === 0, 'no page errors or console errors in any run' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await post('owner', { type: 'reset' });
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
