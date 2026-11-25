// Ostool business rules. Pure functions shared by the browser and the API. Money is integer piasters (100 = 1 EGP). Distance is whole km.
export const TZ = 'Africa/Cairo';
export const ROLES = { owner: 'owner', manager: 'manager', workshop: 'workshop', driver: 'driver' };
export const DEMO_USERS = [
  { pin: '1111', label: 'Owner (Mr. Tarek)', labelAr: 'المالك (أ. طارق)' },
  { pin: '2222', label: 'Fleet manager (Eng. Mona)', labelAr: 'مديرة الأسطول (م. منى)' },
  { pin: '3333', label: 'Workshop (Ashraf)', labelAr: 'الورشة (أشرف)' },
  { pin: '4444', label: 'Driver portal (Sayed Gaber)', labelAr: 'بوابة السائق (سيد جابر)' },
];
export const KINDS = ['scheduled', 'repair', 'inspection', 'accident'];
export const PRIORITIES = ['low', 'normal', 'urgent'];
export const VTYPES = ['sedan', 'van', 'pickup', 'truck', 'bus'];
export const FUELS = ['petrol', 'diesel'];
export const DEFAULTS = { managerLimit: 2000000, workshopLimit: 500000, laborRate: 30000, maxKmPerDay: 1500, soonKm: 1000, soonDays: 30, docDays: 30, licenseDays: 45, backdateDays: 7, maxOpenOrders: 3 };

export class UserError extends Error {}
export class PermError extends Error {}

// ---------- dates (Cairo calendar days as 'YYYY-MM-DD') ----------
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
export const dayKey = (ts) => fmt.format(ts);
const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const toKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (k, n) => toKey(parse(k) + n * 864e5);
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
export function addMonths(k, n) {
  const [y, m, d] = k.split('-').map(Number); const t = y * 12 + (m - 1) + n; const yy = Math.floor(t / 12), mm = ((t % 12) + 12) % 12;
  const dim = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return `${yy}-${String(mm + 1).padStart(2, '0')}-${String(Math.min(d, dim)).padStart(2, '0')}`;
}
export const monthOf = (k) => k.slice(0, 7);
export const dayTs = (k) => parse(k) + 9 * 3600e3;
const isKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && toKey(parse(k)) === k;

// ---------- plates ----------
export const PLATE_LETTERS = { A: 'أ', B: 'ب', G: 'ج', D: 'د', R: 'ر', S: 'س', T: 'ط', N: 'ن', M: 'م', L: 'ل', H: 'هـ', K: 'ك', Q: 'ق', F: 'ف', Y: 'ي', W: 'و' };
const AR2LAT = Object.fromEntries(Object.entries(PLATE_LETTERS).map(([k, v]) => [v, k]));
const AR_DIG = '٠١٢٣٤٥٦٧٨٩';
export function normPlate(input) {
  let x = String(input ?? '').replace(/[٠-٩]/g, (d) => AR_DIG.indexOf(d)).replace(/[\s\-_.]/g, '').replace(/ـ/g, '');
  let out = '';
  for (const ch of x) out += AR2LAT[ch] || (ch === 'ه' ? 'H' : ch.toUpperCase());
  const m = /^([A-Z]{1,3})(\d{1,4})$/.exec(out);
  if (!m || [...m[1]].some((c) => !PLATE_LETTERS[c])) throw new UserError('Plate must be 1 to 3 letters and up to 4 digits');
  return `${m[1]} ${m[2]}`;
}
export const plateAr = (p) => { const [l, d] = String(p).split(' '); return [...l].map((c) => PLATE_LETTERS[c] || c).join(' ') + ' ' + String(d).replace(/\d/g, (x) => AR_DIG[x]); };

// ---------- validation ----------
const str = (v, min, max, label) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min || s.length > max) throw new UserError(`${label} must be ${min === max ? min : `${min} to ${max}`} characters`);
  return s;
};
const intIn = (v, min, max, label) => {
  if (!Number.isInteger(v) || v < min || v > max) throw new UserError(`${label} must be a whole number from ${min} to ${max}`);
  return v;
};
const oneOf = (v, list, msg) => { if (!list.includes(v)) throw new UserError(msg); return v; };
const need = (user, roles) => { if (!roles.includes(user.role)) throw new PermError('You do not have permission to do this'); };
const settings = (s) => ({ ...DEFAULTS, ...(s.settings || {}) });
const nextId = (s, p) => `${p}${++s.counters[p]}`;
const audit = (s, user, now, action, detail) => { s.audit.unshift({ ts: now, userId: user.id, name: user.name, action, detail: String(detail).slice(0, 200) }); if (s.audit.length > 300) s.audit.length = 300; };
const n0 = (n) => Math.round(n).toLocaleString('en-US');
const once = (s, op, fn) => {
  if (op.key !== undefined && (typeof op.key !== 'string' || op.key.length < 4 || op.key.length > 40)) throw new UserError('Bad request');
  if (op.key && s.keys.includes(op.key)) return { duplicate: true };
  const r = fn(); if (op.key) { s.keys.push(op.key); if (s.keys.length > 300) s.keys.shift(); } return r;
};

// ---------- lookups ----------
const getV = (s, id) => { const v = s.vehicles.find((x) => x.id === id); if (!v) throw new UserError('Vehicle not found'); return v; };
const getO = (s, id) => { const o = s.orders.find((x) => x.id === id); if (!o) throw new UserError('Work order not found'); return o; };
const getP = (s, id) => { const p = s.parts.find((x) => x.id === id); if (!p) throw new UserError('Part not found'); return p; };
const getD = (s, id) => { const d = s.drivers.find((x) => x.id === id); if (!d) throw new UserError('Driver not found'); return d; };
const ownOnly = (user, v) => { if (user.role === 'driver' && v.driverId !== user.driverId) throw new PermError('You do not have permission to do this'); };
export const isOpenStatus = (st) => st === 'awaiting' || st === 'open' || st === 'progress' || st === 'waiting';

// ---------- costs ----------
export const partsCost = (o) => o.partsUsed.reduce((a, l) => a + l.qty * l.unitCost, 0);
export const laborCost = (o) => Math.round((o.hours10 * o.rate) / 10);
export const orderTotal = (o) => partsCost(o) + laborCost(o) + (o.vendorCost || 0);

// ---------- odometer ----------
function recordKm(s, v, km, date, user, now) {
  const st = settings(s), today = dayKey(now);
  intIn(km, 0, 2000000, 'Odometer');
  date = date || today;
  if (!isKey(date) || date > today || diffDays(date, today) > st.backdateDays) throw new UserError(`Date must be today or up to ${st.backdateDays} days back`);
  if (date < v.odoDate) throw new UserError('Date is before the last reading');
  if (km < v.odo) throw new UserError(`Odometer cannot be lower than the last reading (${v.odo} km)`);
  if (km === v.odo) { if (date > v.odoDate) v.odoDate = date; return false; }
  const days = Math.max(1, diffDays(v.odoDate, date));
  if (km - v.odo > days * st.maxKmPerDay) throw new UserError(`More than ${st.maxKmPerDay} km a day since the last reading`);
  s.readings.push({ id: nextId(s, 'r'), vehicleId: v.id, km, date, by: user.name });
  if (s.readings.length > 4000) s.readings.shift();
  v.odo = km; v.odoDate = date; return true;
}
export function kmPerDay(readings, today) {
  const from = addDays(today, -90); const r = readings.filter((x) => x.date >= from).sort((a, b) => a.date.localeCompare(b.date) || a.km - b.km);
  if (r.length < 2) return 0; const a = r[0], b = r[r.length - 1];
  return Math.max(0, (b.km - a.km) / Math.max(1, diffDays(a.date, b.date)));
}
function kmBetween(readings, from, to) {
  const r = readings.filter((x) => x.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.km - b.km);
  if (!r.length) return 0; const end = r[r.length - 1].km;
  const before = r.filter((x) => x.date < from); const start = before.length ? before[before.length - 1].km : r[0].km;
  return Math.max(0, end - start);
}

// ---------- service schedule ----------
export function scheduleItems(s, today, rates, onlyVehicle) {
  const out = []; const st = settings(s);
  for (const sc of s.schedules) {
    if (onlyVehicle && sc.vehicleId !== onlyVehicle) continue;
    const v = s.vehicles.find((x) => x.id === sc.vehicleId); const pl = s.plans.find((x) => x.id === sc.planId);
    if (!v || !pl || v.status === 'retired') continue;
    const nextKm = sc.lastKm + pl.km, nextDate = addMonths(sc.lastDate, pl.months);
    const kmLeft = nextKm - v.odo, daysLeft = diffDays(today, nextDate);
    const rate = rates?.[v.id] || 0;
    let due = nextDate;
    if (rate > 0.5 && kmLeft > 0) { const est = addDays(today, Math.ceil(kmLeft / rate)); if (est < due) due = est; }
    if (kmLeft <= 0) due = today < nextDate ? today : nextDate;
    const state = kmLeft < 0 || daysLeft < 0 ? 'overdue' : kmLeft <= st.soonKm || daysLeft <= st.soonDays || diffDays(today, due) <= 14 ? 'soon' : 'ok';
    const open = s.orders.find((o) => o.vehicleId === v.id && o.kind === 'scheduled' && isOpenStatus(o.status) && o.planIds.includes(sc.id));
    out.push({ id: sc.id, vehicleId: v.id, planId: sc.planId, lastKm: sc.lastKm, lastDate: sc.lastDate, nextKm, nextDate, kmLeft, daysLeft, due, state, orderId: open ? open.id : null });
  }
  return out;
}
export function reminders(s, today, items) {
  const st = settings(s); const out = []; const logs = {};
  for (const r of s.reminderLog) logs[r.key] = r.date > (logs[r.key] || '') ? r.date : logs[r.key];
  const push = (o) => out.push({ ...o, sent: logs[o.key] || null });
  for (const it of items) if (it.state !== 'ok' && !it.orderId) { const v = s.vehicles.find((x) => x.id === it.vehicleId); push({ key: `svc:${it.id}`, type: 'service', severity: it.state, vehicleId: it.vehicleId, driverId: v.driverId, refId: it.id, planId: it.planId, due: it.due, kmLeft: it.kmLeft }); }
  for (const v of s.vehicles) {
    if (v.status === 'retired') continue;
    for (const [f, type] of [['regExpiry', 'reg'], ['insExpiry', 'ins']]) {
      const left = diffDays(today, v[f]); if (left <= st.docDays) push({ key: `${type}:${v.id}`, type, severity: left < 0 ? 'overdue' : 'soon', vehicleId: v.id, driverId: v.driverId, due: v[f], daysLeft: left });
    }
  }
  for (const d of s.drivers) {
    const left = diffDays(today, d.licenseExpiry);
    if (left <= st.licenseDays) { const v = s.vehicles.find((x) => x.driverId === d.id && x.status !== 'retired'); push({ key: `lic:${d.id}`, type: 'license', severity: left < 0 ? 'overdue' : 'soon', vehicleId: v ? v.id : null, driverId: d.id, due: d.licenseExpiry, daysLeft: left }); }
  }
  for (const p of s.parts) if (p.stock < p.min) push({ key: `stk:${p.id}`, type: 'stock', severity: p.stock === 0 ? 'overdue' : 'soon', partId: p.id, vehicleId: null, driverId: null, due: null });
  const rank = { overdue: 0, soon: 1 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || String(a.due || '9').localeCompare(String(b.due || '9')));
}

export function normalize(s) {
  if (s.audit.length > 300) s.audit.length = 300;
  if (s.reminderLog.length > 400) s.reminderLog.splice(0, s.reminderLog.length - 400);
}
function refreshVehicle(s, vid) {
  const v = s.vehicles.find((x) => x.id === vid); if (!v || v.status === 'retired') return;
  v.status = s.orders.some((o) => o.vehicleId === vid && (o.status === 'progress' || o.status === 'waiting')) ? 'workshop' : 'active';
}

// ---------- operations ----------
function createOrderCore(s, user, now, f) {
  const st = settings(s), today = dayKey(now);
  const v = getV(s, f.vehicleId);
  if (v.status === 'retired') throw new UserError('This vehicle is retired');
  const kind = oneOf(f.kind, KINDS, 'Choose a type');
  const priority = oneOf(f.priority || 'normal', PRIORITIES, 'Choose a priority');
  if (user.role === 'workshop' && !['repair', 'inspection'].includes(kind)) throw new PermError('You do not have permission to do this');
  const planIds = Array.isArray(f.planIds) ? [...new Set(f.planIds)] : [];
  if (planIds.length > 5) throw new UserError('At most 5 services per order');
  let title = typeof f.title === 'string' ? f.title.trim() : '';
  if (kind === 'scheduled') {
    if (!planIds.length) throw new UserError('Choose at least one service');
    const names = [];
    for (const id of planIds) {
      const sc = s.schedules.find((x) => x.id === id && x.vehicleId === v.id); if (!sc) throw new UserError('Service not found for this vehicle');
      if (s.orders.some((o) => o.vehicleId === v.id && o.kind === 'scheduled' && isOpenStatus(o.status) && o.planIds.includes(id))) throw new UserError('A work order already covers this service');
      names.push(s.plans.find((p) => p.id === sc.planId).name);
    }
    if (!title) title = names.join(' + ').slice(0, 80);
  } else if (planIds.length) throw new UserError('Only scheduled orders carry services');
  title = str(title, 3, 80, 'Title');
  const desc = f.desc === undefined || f.desc === '' ? '' : str(f.desc, 0, 400, 'Description');
  const estimate = f.estimate ? intIn(f.estimate, 1, 10000000, 'Estimate') : 0;
  let planned = null;
  if (f.planned) { if (!isKey(f.planned) || f.planned < today || diffDays(today, f.planned) > 60) throw new UserError('Planned date must be within the next 60 days'); planned = f.planned; }
  if (s.orders.filter((o) => o.vehicleId === v.id && isOpenStatus(o.status)).length >= st.maxOpenOrders) throw new UserError(`This vehicle already has ${st.maxOpenOrders} open work orders`);
  const id = nextId(s, 'w');
  const o = { id, no: 'WO-' + String(s.counters.w).padStart(5, '0'), vehicleId: v.id, kind, title, desc, priority, status: estimate > st.managerLimit && user.role !== 'owner' ? 'awaiting' : 'open', openedAt: today, openedBy: user.name, planIds, estimate, planned, startedAt: null, completedAt: null, techId: null, tech: null, partsUsed: [], hours10: 0, rate: st.laborRate, vendor: '', vendorCost: 0, odo: null, note: '', downDays: 0, total: 0, issueId: f.issueId || null, waitReason: '' };
  s.orders.push(o);
  audit(s, user, now, 'createOrder', `${o.no} ${v.plate} ${title}`);
  return o;
}
function editable(o) {
  if (o.status === 'awaiting') throw new UserError('Waiting for owner approval');
  if (o.status === 'open') throw new UserError('Start the job first');
  if (o.status !== 'progress' && o.status !== 'waiting') throw new UserError('This work order is closed');
}

const OPS = {
  logReading(s, op, { user, now }) {
    need(user, ['owner', 'manager', 'workshop', 'driver']);
    const v = getV(s, op.vehicleId); ownOnly(user, v);
    if (v.status === 'retired') throw new UserError('This vehicle is retired');
    return once(s, op, () => { if (!recordKm(s, v, op.km, op.date, user, now)) throw new UserError('Odometer has not changed since the last reading'); audit(s, user, now, 'logReading', `${v.plate} ${v.odo} km`); return { odo: v.odo }; });
  },
  logFuel(s, op, { user, now }) {
    need(user, ['owner', 'manager', 'driver']);
    const v = getV(s, op.vehicleId); ownOnly(user, v);
    if (v.status === 'retired') throw new UserError('This vehicle is retired');
    return once(s, op, () => {
      const liters10 = intIn(op.liters10, 30, 3000, 'Litres'), cost = intIn(op.cost, 100, 3000000, 'Cost');
      const ppl = cost / 100 / (liters10 / 10); if (ppl < 3 || ppl > 100) throw new UserError('Price per litre looks wrong');
      const today = dayKey(now); const date = op.date || today;
      recordKm(s, v, op.km, date, user, now);
      s.fuel.push({ id: nextId(s, 'f'), vehicleId: v.id, date, liters10, cost, km: v.odo, by: user.name });
      if (s.fuel.length > 3000) s.fuel.shift();
      audit(s, user, now, 'logFuel', `${v.plate} ${liters10 / 10} L`); return {};
    });
  },
  reportIssue(s, op, { user, now }) {
    need(user, ['owner', 'manager', 'workshop', 'driver']);
    const v = getV(s, op.vehicleId); ownOnly(user, v);
    if (v.status === 'retired') throw new UserError('This vehicle is retired');
    return once(s, op, () => {
      const title = str(op.title, 3, 80, 'Title'), desc = op.desc ? str(op.desc, 0, 400, 'Description') : '', priority = oneOf(op.priority, PRIORITIES, 'Choose a priority');
      if (user.role === 'driver' && s.issues.filter((i) => i.driverId === user.driverId && i.status === 'new').length >= 5) throw new UserError('You already have 5 open issues');
      const i = { id: nextId(s, 'i'), vehicleId: v.id, driverId: user.role === 'driver' ? user.driverId : null, by: user.name, byAr: user.nameAr || user.name, title, desc, priority, status: 'new', date: dayKey(now), orderId: null };
      s.issues.push(i); audit(s, user, now, 'reportIssue', `${v.plate} ${title}`); return { issueId: i.id };
    });
  },
  convertIssue(s, op, { user, now }) {
    need(user, ['owner', 'manager']);
    const i = s.issues.find((x) => x.id === op.issueId); if (!i) throw new UserError('Issue not found');
    if (i.status !== 'new') throw new UserError('This issue is already handled');
    const o = createOrderCore(s, user, now, { vehicleId: i.vehicleId, kind: 'repair', title: i.title, desc: i.desc, priority: i.priority, estimate: op.estimate, issueId: i.id });
    i.status = 'converted'; i.orderId = o.id; return { orderId: o.id };
  },
  dismissIssue(s, op, { user, now }) {
    need(user, ['owner', 'manager']);
    const i = s.issues.find((x) => x.id === op.issueId); if (!i) throw new UserError('Issue not found');
    if (i.status !== 'new') throw new UserError('This issue is already handled');
    const reason = str(op.reason, 3, 80, 'Reason'); i.status = 'dismissed'; i.reason = reason; audit(s, user, now, 'dismissIssue', `${i.title}: ${reason}`); return {};
  },
  createOrder(s, op, { user, now }) {
    need(user, ['owner', 'manager', 'workshop']);
    return once(s, op, () => { const o = createOrderCore(s, user, now, op); return { orderId: o.id }; });
  },
  approveOrder(s, op, { user, now }) {
    need(user, ['owner']); const o = getO(s, op.orderId);
    if (o.status !== 'awaiting') throw new UserError('This order does not need approval'); o.status = 'open'; o.approvedBy = user.name; audit(s, user, now, 'approveOrder', o.no); return {};
  },
  startOrder(s, op, { user, now }) {
    need(user, ['owner', 'manager', 'workshop']); const o = getO(s, op.orderId);
    if (o.status === 'awaiting') throw new UserError('Waiting for owner approval');
    if (o.status !== 'open') throw new UserError('Only an open order can be started');
    const v = getV(s, o.vehicleId); if (v.status === 'retired') throw new UserError('This vehicle is retired');
    const tech = user.role === 'workshop' ? user : s.users.find((u) => u.role === 'workshop');
    o.status = 'progress'; o.startedAt = dayKey(now); o.techId = tech ? tech.id : null; o.tech = tech ? { name: tech.name, nameAr: tech.nameAr } : null;
    refreshVehicle(s, v.id); audit(s, user, now, 'startOrder', o.no); return {};
  },
  addPart(s, op, { user, now }) {
    need(user, ['owner', 'manager', 'workshop']); const o = getO(s, op.orderId); editable(o);
    const p = getP(s, op.partId), qty = intIn(op.qty, 1, 200, 'Quantity');
    if (p.stock < qty) throw new UserError(`Not enough stock: ${p.stock} in stock`);
    const line = o.partsUsed.find((l) => l.partId === p.id);
    if (!line && o.partsUsed.length >= 15) throw new UserError('At most 15 part lines');
    p.stock -= qty; if (line) line.qty += qty; else o.partsUsed.push({ partId: p.id, qty, unitCost: p.cost });
    audit(s, user, now, 'addPart', `${o.no} ${p.sku} x${qty}`); return {};
  },
  removePart(s, op, { user, now }) {
    need(user, ['owner', 'manager', 'workshop']); const o = getO(s, op.orderId); editable(o);
    const i = o.partsUsed.findIndex((l) => l.partId === op.partId); if (i < 0) throw new UserError('Part line not found');
    const [l] = o.partsUsed.splice(i, 1); getP(s, l.partId).stock += l.qty; audit(s, user, now, 'removePart', `${o.no} ${l.partId}`); return {};
  },
  setLabor(s, op, { user, now }) {
    need(user, ['owner', 'manager', 'workshop']); const o = getO(s, op.orderId); editable(o);
    o.hours10 = intIn(op.hours10, 0, 800, 'Hours'); audit(s, user, now, 'setLabor', `${o.no} ${o.hours10 / 10} h`); return {};
  },
  setVendor(s, op, { user, now }) {
    need(user, ['owner', 'manager', 'workshop']); const o = getO(s, op.orderId); editable(o);
    const vendor = op.vendor ? str(op.vendor, 2, 60, 'Vendor') : '', cost = op.cost ? intIn(op.cost, 1, 5000000, 'Cost') : 0;
    if (!!vendor !== !!cost) throw new UserError('Enter both the vendor and the cost, or leave both empty');
    o.vendor = vendor; o.vendorCost = cost; audit(s, user, now, 'setVendor', `${o.no} ${vendor}`); return {};
  },
  setWaiting(s, op, { user, now }) {
    need(user, ['owner', 'manager', 'workshop']); const o = getO(s, op.orderId);
    if (o.status !== 'progress' && o.status !== 'waiting') throw new UserError('Only a job in progress can wait for parts');
    if (op.on) { o.waitReason = str(op.reason, 3, 80, 'Reason'); o.status = 'waiting'; } else { o.waitReason = ''; o.status = 'progress'; }
    refreshVehicle(s, o.vehicleId); audit(s, user, now, 'setWaiting', `${o.no} ${op.on ? 'waiting' : 'resumed'}`); return {};
  },
  completeOrder(s, op, { user, now }) {
    need(user, ['owner', 'manager', 'workshop']); const o = getO(s, op.orderId); const st = settings(s);
    if (o.status === 'waiting') throw new UserError('Parts are still missing. Resume the job first');
    editable(o);
    const v = getV(s, o.vehicleId);
    if (!o.hours10 && !o.partsUsed.length && !o.vendorCost) throw new UserError('Record the labour, parts or outside work first');
    const total = orderTotal(o);
    const limit = user.role === 'workshop' ? st.workshopLimit : user.role === 'manager' ? st.managerLimit : Infinity;
    if (total > limit) throw new PermError(`Jobs above ${n0(limit / 100)} EGP need ${user.role === 'workshop' ? 'a manager' : 'the owner'}`);
    const note = op.note ? str(op.note, 0, 300, 'Note') : '';
    const today = dayKey(now);
    recordKm(s, v, op.odo, today, user, now);
    o.odo = v.odo; o.note = note; o.total = total; o.status = 'done'; o.completedAt = today;
    o.downDays = Math.max(1, diffDays(o.startedAt || o.openedAt, today) + 1);
    for (const id of o.planIds) { const sc = s.schedules.find((x) => x.id === id); if (sc) { sc.lastKm = v.odo; sc.lastDate = today; } }
    refreshVehicle(s, v.id); audit(s, user, now, 'completeOrder', `${o.no} ${v.plate} ${n0(total / 100)} EGP`); return { total };
  },
  cancelOrder(s, op, { user, now }) {
    need(user, ['owner', 'manager']); const o = getO(s, op.orderId);
    if (!isOpenStatus(o.status)) throw new UserError('This work order is closed');
    const reason = str(op.reason, 3, 80, 'Reason');
    for (const l of o.partsUsed) getP(s, l.partId).stock += l.qty;
    o.partsUsed = []; o.status = 'cancelled'; o.note = reason; o.completedAt = dayKey(now);
    refreshVehicle(s, o.vehicleId); if (o.issueId) { const i = s.issues.find((x) => x.id === o.issueId); if (i) { i.status = 'dismissed'; i.reason = reason; } }
    audit(s, user, now, 'cancelOrder', `${o.no}: ${reason}`); return {};
  },
  receiveParts(s, op, { user, now }) {
    need(user, ['owner', 'manager', 'workshop']); const p = getP(s, op.partId);
    return once(s, op, () => {
      const qty = intIn(op.qty, 1, 1000, 'Quantity'), unit = intIn(op.unitCost, 1, 10000000, 'Unit cost');
      p.cost = Math.round((p.stock * p.cost + qty * unit) / (p.stock + qty)); p.stock += qty;
      audit(s, user, now, 'receiveParts', `${p.sku} +${qty}`); return {};
    });
  },
  newPart(s, op, { user, now }) {
    need(user, ['owner', 'manager']);
    return once(s, op, () => {
      const sku = str(typeof op.sku === 'string' ? op.sku.toUpperCase() : '', 3, 14, 'SKU'); if (!/^[A-Z0-9-]+$/.test(sku)) throw new UserError('SKU can use letters, digits and dashes');
      if (s.parts.some((p) => p.sku === sku)) throw new UserError('This SKU already exists');
      const p = { id: nextId(s, 'p'), sku, name: str(op.name, 2, 50, 'Name'), nameAr: str(op.nameAr || op.name, 2, 50, 'Arabic name'), unit: 'pc', stock: intIn(op.stock ?? 0, 0, 100000, 'Stock'), min: intIn(op.min ?? 0, 0, 100000, 'Minimum'), cost: intIn(op.cost, 1, 10000000, 'Cost'), supplier: op.supplier ? str(op.supplier, 2, 50, 'Supplier') : '' };
      s.parts.push(p); audit(s, user, now, 'newPart', sku); return { partId: p.id };
    });
  },
  adjustStock(s, op, { user, now }) {
    need(user, ['owner', 'manager']); const p = getP(s, op.partId);
    const count = intIn(op.count, 0, 100000, 'Count'), reason = str(op.reason, 3, 80, 'Reason');
    audit(s, user, now, 'adjustStock', `${p.sku} ${p.stock} to ${count}: ${reason}`); p.stock = count; return {};
  },
  assignDriver(s, op, { user, now }) {
    need(user, ['owner', 'manager']); const v = getV(s, op.vehicleId);
    if (v.status === 'retired') throw new UserError('This vehicle is retired');
    if (!op.driverId) { v.driverId = null; audit(s, user, now, 'assignDriver', `${v.plate} unassigned`); return {}; }
    const d = getD(s, op.driverId);
    if (d.licenseExpiry < dayKey(now)) throw new UserError('This driver\'s licence has expired');
    if (s.vehicles.some((x) => x.driverId === d.id && x.id !== v.id && x.status !== 'retired')) throw new UserError('This driver already has a vehicle');
    v.driverId = d.id; audit(s, user, now, 'assignDriver', `${v.plate} to ${d.name}`); return {};
  },
  addVehicle(s, op, { user, now }) {
    need(user, ['owner', 'manager']);
    return once(s, op, () => {
      const today = dayKey(now), plate = normPlate(op.plate);
      if (s.vehicles.some((v) => v.plate === plate)) throw new UserError('A vehicle with this plate already exists');
      const make = str(op.make, 2, 30, 'Make'), model = str(op.model, 1, 30, 'Model');
      const year = intIn(op.year, 1990, Number(today.slice(0, 4)) + 1, 'Year'), odo = intIn(op.odo, 0, 2000000, 'Odometer');
      const type = oneOf(op.vtype, VTYPES, 'Choose a vehicle type'), fuel = oneOf(op.fuel, FUELS, 'Choose a fuel');
      for (const f of ['regExpiry', 'insExpiry']) if (!isKey(op[f]) || op[f] < addDays(today, -400) || op[f] > addDays(today, 800)) throw new UserError('Choose a valid expiry date');
      const v = { id: nextId(s, 'v'), plate, make, model, year, type, fuel, vin: '', odo, odoDate: today, status: 'active', driverId: null, regExpiry: op.regExpiry, insExpiry: op.insExpiry, since: today };
      s.vehicles.push(v);
      for (const pl of s.plans) s.schedules.push({ id: nextId(s, 'sc'), vehicleId: v.id, planId: pl.id, lastKm: odo, lastDate: today });
      audit(s, user, now, 'addVehicle', `${plate} ${make} ${model}`); return { vehicleId: v.id };
    });
  },
  updateDocs(s, op, { user, now }) {
    need(user, ['owner', 'manager']); const v = getV(s, op.vehicleId); const today = dayKey(now);
    if (v.status === 'retired') throw new UserError('This vehicle is retired');
    if (!op.regExpiry && !op.insExpiry) throw new UserError('Choose a valid expiry date');
    for (const f of ['regExpiry', 'insExpiry']) if (op[f]) {
      if (!isKey(op[f]) || op[f] < today || op[f] > addDays(today, 800)) throw new UserError('Choose a valid expiry date');
      v[f] = op[f];
    }
    audit(s, user, now, 'updateDocs', `${v.plate} renewed`); return {};
  },
  retireVehicle(s, op, { user, now }) {
    need(user, ['owner']); const v = getV(s, op.vehicleId);
    if (v.status === 'retired') throw new UserError('This vehicle is retired');
    if (s.orders.some((o) => o.vehicleId === v.id && isOpenStatus(o.status))) throw new UserError('Close the open work orders first');
    const reason = str(op.reason, 3, 80, 'Reason'); v.status = 'retired'; v.driverId = null; v.retiredAt = dayKey(now); v.retireReason = reason;
    for (const i of s.issues) if (i.vehicleId === v.id && i.status === 'new') { i.status = 'dismissed'; i.reason = reason; }
    audit(s, user, now, 'retireVehicle', `${v.plate}: ${reason}`); return {};
  },
  setPlan(s, op, { user, now }) {
    need(user, ['owner']); const p = s.plans.find((x) => x.id === op.planId); if (!p) throw new UserError('Service not found');
    p.km = intIn(op.km, 1000, 200000, 'Distance'); p.months = intIn(op.months, 1, 60, 'Months'); audit(s, user, now, 'setPlan', `${p.name} ${p.km} km / ${p.months} mo`); return {};
  },
  logReminder(s, op, { user, now }) {
    need(user, ['owner', 'manager']);
    const key = typeof op.key === 'string' && /^[a-z]{2,4}:[a-z0-9]{1,12}$/.test(op.key) ? op.key : null; if (!key) throw new UserError('Bad request');
    s.reminderLog.push({ key, date: dayKey(now), by: user.name }); return {};
  },
};

export function applyOp(s, op, ctx) {
  const fn = op && typeof op === 'object' ? OPS[op.type] : null;
  if (!fn || !Object.prototype.hasOwnProperty.call(OPS, op.type)) throw new UserError('Unknown action');
  return fn(s, op, ctx);
}

// ---------- reports ----------
export function reports(s, now, items, rates) {
  const today = dayKey(now); const st = settings(s);
  const months = []; for (let i = 5; i >= 0; i--) months.push(monthOf(addMonths(today.slice(0, 7) + '-01', -i)));
  const done = s.orders.filter((o) => o.status === 'done');
  const maint = Object.fromEntries(months.map((m) => [m, 0])), fuelC = Object.fromEntries(months.map((m) => [m, 0]));
  for (const o of done) { const m = monthOf(o.completedAt); if (m in maint) maint[m] += o.total; }
  for (const f of s.fuel) { const m = monthOf(f.date); if (m in fuelC) fuelC[m] += f.cost; }
  const from = addDays(today, -180);
  const byV = {}; for (const r of s.readings) (byV[r.vehicleId] ||= []).push(r);
  const vehicles = s.vehicles.filter((v) => v.status !== 'retired').map((v) => {
    const mo = done.filter((o) => o.vehicleId === v.id && o.completedAt >= from);
    const maintC = mo.reduce((a, o) => a + o.total, 0), fuelCost = s.fuel.filter((f) => f.vehicleId === v.id && f.date >= from).reduce((a, f) => a + f.cost, 0);
    const km = kmBetween(byV[v.id] || [], from, today);
    return { vehicleId: v.id, maint: maintC, fuel: fuelCost, km, perKm: km > 0 ? Math.round((maintC + fuelCost) / km) : 0, down: mo.reduce((a, o) => a + o.downDays, 0), jobs: mo.length, unplanned: mo.filter((o) => o.kind !== 'scheduled' && o.kind !== 'inspection').length };
  }).sort((a, b) => b.maint + b.fuel - (a.maint + a.fuel));
  const active = s.vehicles.filter((v) => v.status !== 'retired');
  const recent = done.filter((o) => o.completedAt >= from);
  const planned = recent.filter((o) => o.kind === 'scheduled' || o.kind === 'inspection').length;
  const byPart = {}; for (const o of recent) for (const l of o.partsUsed) byPart[l.partId] = (byPart[l.partId] || 0) + l.qty * l.unitCost;
  const topParts = Object.entries(byPart).map(([partId, cost]) => ({ partId, cost })).sort((a, b) => b.cost - a.cost).slice(0, 6);
  const kinds = {}; for (const o of recent) kinds[o.kind] = (kinds[o.kind] || 0) + o.total;
  const month = today.slice(0, 7);
  const overdue = items.filter((i) => i.state === 'overdue').length;
  return {
    months, maint: months.map((m) => maint[m]), fuel: months.map((m) => fuelC[m]), vehicles, topParts, kinds,
    availability: active.length ? active.filter((v) => v.status === 'active').length / active.length : 1,
    compliance: items.length ? 1 - overdue / items.length : 1, overdue, preventive: recent.length ? planned / recent.length : 0,
    maintMonth: maint[month] || 0, avgJob: recent.length ? Math.round(recent.reduce((a, o) => a + o.total, 0) / recent.length) : 0,
    totalMaint: vehicles.reduce((a, x) => a + x.maint, 0), totalFuel: vehicles.reduce((a, x) => a + x.fuel, 0), totalKm: vehicles.reduce((a, x) => a + x.km, 0),
    downDays: vehicles.reduce((a, x) => a + x.down, 0), limits: { manager: st.managerLimit, workshop: st.workshopLimit },
  };
}

export function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export const toCsv = (rows) => '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

// ---------- what each user may see ----------
const stripCost = (o) => { const { rate, vendorCost, total, estimate, ...r } = o; return { ...r, partsUsed: [] }; };
export function view(s, user, now) {
  const today = dayKey(now), st = settings(s);
  const byV = {}; for (const r of s.readings) (byV[r.vehicleId] ||= []).push(r);
  const rates = {}; for (const v of s.vehicles) rates[v.id] = kmPerDay(byV[v.id] || [], today);
  const items = scheduleItems(s, today, rates);
  const isDriver = user.role === 'driver', staffAll = user.role === 'owner' || user.role === 'manager';
  const mine = (v) => !isDriver || v.driverId === user.driverId;
  const vehicles = s.vehicles.filter(mine).map((v) => ({ ...v, kmPerDay: Math.round(rates[v.id]), readings: (byV[v.id] || []).slice(-8).reverse() }));
  const vids = new Set(vehicles.map((v) => v.id));
  const rem = reminders(s, today, items).filter((r) => !isDriver || (r.type !== 'stock' && (r.driverId === user.driverId || vids.has(r.vehicleId))));
  const v = {
    today, me: { id: user.id, name: user.name, nameAr: user.nameAr, role: user.role, driverId: user.driverId || null }, company: s.company, resetAt: s.resetAt,
    settings: { managerLimit: st.managerLimit, workshopLimit: st.workshopLimit, laborRate: st.laborRate, maxKmPerDay: st.maxKmPerDay },
    plans: s.plans, vehicles, schedules: items.filter((i) => vids.has(i.vehicleId)),
    orders: s.orders.filter((o) => vids.has(o.vehicleId)).map((o) => (isDriver ? stripCost(o) : { ...o, total: o.status === 'done' ? o.total : orderTotal(o) })),
    issues: s.issues.filter((i) => !isDriver || i.driverId === user.driverId || vids.has(i.vehicleId)),
    fuel: user.role === 'workshop' ? [] : s.fuel.filter((f) => vids.has(f.vehicleId) && f.date >= addDays(today, -120)),
    drivers: isDriver ? s.drivers.filter((d) => d.id === user.driverId) : s.drivers.map((d) => (staffAll ? d : { id: d.id, name: d.name, nameAr: d.nameAr })),
    parts: isDriver ? [] : s.parts, reminders: rem,
  };
  if (staffAll) v.reports = reports(s, now, items, rates);
  if (user.role === 'owner') v.audit = s.audit;
  if (staffAll) v.reminderLog = s.reminderLog.slice(-40);
  return v;
}

// ---------- seed ----------
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const PARTS = [
  ['OIL-15W40', 'Engine oil 15W-40 (litre)', 'زيت محرك 15W-40 (لتر)', 12000, 60, 'Delta Lubricants'], ['OIL-5W30', 'Engine oil 5W-30 (litre)', 'زيت محرك 5W-30 (لتر)', 16000, 40, 'Delta Lubricants'],
  ['FLT-OIL', 'Oil filter', 'فلتر زيت', 18000, 15, 'Cairo Auto Parts'], ['FLT-AIR', 'Air filter', 'فلتر هواء', 25000, 10, 'Cairo Auto Parts'], ['FLT-CAB', 'Cabin filter', 'فلتر تكييف', 20000, 8, 'Cairo Auto Parts'],
  ['FLT-FUEL', 'Fuel filter', 'فلتر وقود', 35000, 8, 'Cairo Auto Parts'], ['BRK-PAD', 'Brake pads, front set', 'تيل فرامل أمامي طقم', 90000, 6, 'Nile Brakes'], ['BRK-DSC', 'Brake discs, pair', 'طنابير/أقراص فرامل زوج', 220000, 3, 'Nile Brakes'],
  ['TYR-PAX', 'Tyre, passenger', 'إطار ركوب', 160000, 8, 'Alex Tyres'], ['TYR-LTR', 'Tyre, light truck', 'إطار نقل خفيف', 320000, 8, 'Alex Tyres'], ['BAT-70', 'Battery 70Ah', 'بطارية 70 أمبير', 280000, 3, 'Power Cell'],
  ['TMB-KIT', 'Timing belt kit', 'طقم سير كاملة', 450000, 2, 'Cairo Auto Parts'], ['CLT-KIT', 'Clutch kit', 'طقم دبرياج', 850000, 1, 'Giza Transmission'], ['SHK-ABS', 'Shock absorber', 'مساعد', 120000, 4, 'Giza Transmission'],
  ['WPR-SET', 'Wiper blades, pair', 'مساحات زوج', 15000, 6, 'Cairo Auto Parts'], ['CLT-LTR', 'Coolant (litre)', 'مياه ردياتير (لتر)', 6000, 20, 'Delta Lubricants'], ['BLB-HL', 'Headlamp bulb', 'لمبة كشاف', 9000, 8, 'Cairo Auto Parts'], ['BLT-DRV', 'Drive belt', 'سير مروحة', 40000, 4, 'Cairo Auto Parts'],
];
const PLANS = [['Oil and filter change', 'تغيير الزيت والفلتر', 10000, 6], ['Tyre rotation and balance', 'تقليب وترصيص الإطارات', 15000, 6], ['Brake inspection', 'فحص الفرامل', 20000, 12], ['Annual safety inspection', 'الفحص السنوي للسلامة', 25000, 12], ['Timing belt', 'سير الكام', 90000, 60]];
// make, model, year, type, fuel, km/day, odometer 270 days ago
const FLEET = [
  ['Toyota', 'Hilux', 2021, 'pickup', 'diesel', 150, 84000], ['Toyota', 'Hilux', 2022, 'pickup', 'diesel', 140, 61000], ['Isuzu', 'D-Max', 2020, 'pickup', 'diesel', 130, 112000], ['Mitsubishi', 'L200', 2019, 'pickup', 'diesel', 120, 138000],
  ['Isuzu', 'NPR', 2020, 'truck', 'diesel', 210, 176000], ['Isuzu', 'NPR', 2021, 'truck', 'diesel', 220, 142000], ['Mitsubishi', 'Canter', 2018, 'truck', 'diesel', 190, 241000], ['Hino', '300', 2019, 'truck', 'diesel', 200, 205000], ['Hino', '500', 2017, 'truck', 'diesel', 240, 318000],
  ['Hyundai', 'H1', 2020, 'van', 'diesel', 110, 97000], ['Hyundai', 'H1', 2021, 'van', 'diesel', 105, 76000], ['Toyota', 'Hiace', 2019, 'van', 'diesel', 125, 164000], ['Toyota', 'Hiace', 2022, 'van', 'diesel', 130, 52000],
  ['Renault', 'Kangoo', 2021, 'van', 'petrol', 85, 58000], ['Renault', 'Kangoo', 2022, 'van', 'petrol', 90, 41000], ['Peugeot', 'Partner', 2020, 'van', 'petrol', 80, 79000], ['Toyota', 'Coaster', 2018, 'bus', 'diesel', 95, 189000],
  ['Toyota', 'Corolla', 2021, 'sedan', 'petrol', 60, 48000], ['Hyundai', 'Accent', 2020, 'sedan', 'petrol', 65, 71000], ['Hyundai', 'Accent', 2022, 'sedan', 'petrol', 55, 32000], ['Chevrolet', 'Optra', 2016, 'sedan', 'petrol', 50, 156000], ['Kia', 'Cerato', 2021, 'sedan', 'petrol', 58, 50000], ['Nissan', 'Sunny', 2019, 'sedan', 'petrol', 62, 94000], ['Isuzu', 'NPR', 2016, 'truck', 'diesel', 0, 402000],
];
const DRIVERS = [['Sayed Gaber', 'سيد جابر'], ['Mahmoud Adel', 'محمود عادل'], ['Hany Fawzy', 'هاني فوزي'], ['Ibrahim Salah', 'إبراهيم صلاح'], ['Yasser Morsy', 'ياسر مرسي'], ['Ayman Zaki', 'أيمن زكي'], ['Khaled Nabil', 'خالد نبيل'], ['Osama Reda', 'أسامة رضا'], ['Mostafa Hegazy', 'مصطفى حجازي'], ['Tamer Ashour', 'تامر عاشور'], ['Essam Fathy', 'عصام فتحي'], ['Waleed Samir', 'وليد سمير'], ['Gamal Hosny', 'جمال حسني'], ['Reda Mansour', 'رضا منصور'], ['Hossam Barakat', 'حسام بركات'], ['Nasser Labib', 'ناصر لبيب'], ['Sherif Anwar', 'شريف أنور'], ['Magdy Younis', 'مجدي يونس']];
const REPAIRS = [
  { t: 'Brake pads replacement', a: 'تغيير تيل الفرامل', kind: 'repair', parts: [['BRK-PAD', 1]], h: 20 }, { t: 'Battery replacement', a: 'تغيير البطارية', kind: 'repair', parts: [['BAT-70', 1]], h: 5 },
  { t: 'Tyre replacement (2)', a: 'تغيير إطارين', kind: 'repair', parts: [['TYR', 2]], h: 10 }, { t: 'Drive belt replacement', a: 'تغيير سير المروحة', kind: 'repair', parts: [['BLT-DRV', 1]], h: 8 },
  { t: 'Shock absorbers (pair)', a: 'تغيير المساعدين', kind: 'repair', parts: [['SHK-ABS', 2]], h: 25 }, { t: 'Clutch replacement', a: 'تغيير الدبرياج', kind: 'repair', parts: [['CLT-KIT', 1]], h: 70, big: true },
  { t: 'AC repair', a: 'إصلاح التكييف', kind: 'repair', parts: [], h: 20, vendor: ['Cool Air Workshop', 150000, 400000] }, { t: 'Body repair after a minor accident', a: 'إصلاح هيكل بعد حادث بسيط', kind: 'accident', parts: [['BLB-HL', 1]], h: 0, vendor: ['Heliopolis Body Shop', 300000, 900000] },
  { t: 'Headlamp replacement', a: 'تغيير الكشافات', kind: 'repair', parts: [['BLB-HL', 2]], h: 5 }, { t: 'Coolant leak repair', a: 'إصلاح تسريب مياه الردياتير', kind: 'repair', parts: [['CLT-LTR', 6]], h: 15 },
];

export function seed(now = Date.now()) {
  const R = rng(20261125); const today = dayKey(now);
  const s = {
    resetAt: now, counters: { v: 0, d: 0, sc: 0, r: 0, f: 0, p: 0, w: 0, i: 0 }, keys: [], audit: [], reminderLog: [], settings: { ...DEFAULTS },
    company: { name: 'Delta Transport Services', nameAr: 'دلتا لخدمات النقل' },
    users: [
      { id: 'u-owner', name: 'Tarek Fouad', nameAr: 'طارق فؤاد', role: 'owner', pin: '1111' }, { id: 'u-mgr', name: 'Mona Salem', nameAr: 'منى سالم', role: 'manager', pin: '2222' },
      { id: 'u-ws', name: 'Ashraf Mahdy', nameAr: 'أشرف مهدي', role: 'workshop', pin: '3333' }, { id: 'u-drv', name: 'Sayed Gaber', nameAr: 'سيد جابر', role: 'driver', pin: '4444', driverId: 'd1' },
    ],
    plans: PLANS.map((p, i) => ({ id: 'pl' + (i + 1), name: p[0], nameAr: p[1], km: p[2], months: p[3] })),
    vehicles: [], drivers: [], schedules: [], readings: [], fuel: [], parts: [], orders: [], issues: [],
  };
  const owner = { id: 'u-owner', name: 'Tarek Fouad', nameAr: 'طارق فؤاد', role: 'owner' }, mgr = { id: 'u-mgr', name: 'Mona Salem', nameAr: 'منى سالم', role: 'manager' };
  const start = addDays(today, -270), startTs = dayTs(start);
  for (const p of PARTS) s.parts.push({ id: nextId(s, 'p'), sku: p[0], name: p[1], nameAr: p[2], unit: 'pc', stock: p[4] * 3, min: p[4], cost: p[3], supplier: p[5] });
  const P = (sku) => s.parts.find((p) => p.sku === sku);
  DRIVERS.forEach((d, i) => s.drivers.push({ id: nextId(s, 'd'), name: d[0], nameAr: d[1], phone: '+2010' + String(20000000 + Math.floor(R() * 79999999)), licenseExpiry: addDays(today, 90 + Math.floor(R() * 900)) }));
  const letters = Object.keys(PLATE_LETTERS); const usedPlates = new Set();
  FLEET.forEach((f, i) => {
    let plate; do { plate = [0, 1, 2].map(() => letters[Math.floor(R() * letters.length)]).join('') + ' ' + (1000 + Math.floor(R() * 8999)); } while (usedPlates.has(plate)); usedPlates.add(plate);
    const retired = i === FLEET.length - 1;
    const v = { id: nextId(s, 'v'), plate, make: f[0], model: f[1], year: f[2], type: f[3], fuel: f[4], vin: '', odo: f[6], odoDate: start, status: retired ? 'retired' : 'active', driverId: !retired && i < s.drivers.length ? s.drivers[i].id : null, regExpiry: addDays(today, 40 + Math.floor(R() * 300)), insExpiry: addDays(today, 40 + Math.floor(R() * 300)), since: addDays(today, -400 - Math.floor(R() * 900)), kpd: f[5] };
    if (retired) { v.retiredAt = addDays(today, -120); v.retireReason = 'Sold after the engine overhaul quote'; }
    s.vehicles.push(v);
    for (const pl of s.plans) s.schedules.push({ id: nextId(s, 'sc'), vehicleId: v.id, planId: pl.id, lastKm: Math.max(0, v.odo - Math.floor(R() * pl.km * 0.9)), lastDate: addDays(start, -Math.floor(R() * pl.months * 30 * 0.8)) });
  });
  // The retired truck stops at 402,000 km and had its last services before the window.
  const lateSet = new Set(['v3', 'v7', 'v9', 'v12', 'v16', 'v21', 'v22']);
  const pending = [];
  const stockFor = (sku, qty, now2) => { const p = P(sku); if (p.stock < qty) applyOp(s, { type: 'receiveParts', partId: p.id, qty: Math.max(qty * 4, p.min * 3), unitCost: Math.round(p.cost * (0.97 + R() * 0.08)) }, { user: owner, now: now2 }); return p; };
  const oilSku = (v) => (v.fuel === 'diesel' ? 'OIL-15W40' : 'OIL-5W30'); const oilL = { sedan: 4, van: 6, pickup: 7, truck: 10, bus: 12 };
  const partsFor = (v, plan) => {
    if (plan.id === 'pl1') return [[oilSku(v), oilL[v.type]], ['FLT-OIL', 1]];
    if (plan.id === 'pl3') return R() < 0.4 ? [['BRK-PAD', 1]] : [];
    if (plan.id === 'pl4') return [['FLT-AIR', 1], ['FLT-CAB', 1], ['WPR-SET', 1], ...(v.fuel === 'diesel' ? [['FLT-FUEL', 1]] : [])];
    if (plan.id === 'pl5') return [['TMB-KIT', 1]];
    return [];
  };
  const hoursFor = { pl1: 10, pl2: 10, pl3: 15, pl4: 25, pl5: 50 };
  const finish = (job, d, nowTs) => {
    const ctx = { user: owner, now: nowTs }; const v = s.vehicles.find((x) => x.id === job.vid);
    for (const [sku0, q] of job.parts) { const sku = sku0 === 'TYR' ? (v.type === 'sedan' ? 'TYR-PAX' : 'TYR-LTR') : sku0; const p = stockFor(sku, q, nowTs); applyOp(s, { type: 'addPart', orderId: job.oid, partId: p.id, qty: q }, ctx); }
    if (job.h) applyOp(s, { type: 'setLabor', orderId: job.oid, hours10: job.h }, ctx);
    if (job.vendor) applyOp(s, { type: 'setVendor', orderId: job.oid, vendor: job.vendor[0], cost: job.vendor[1] + Math.floor(R() * (job.vendor[2] - job.vendor[1])) }, ctx);
    applyOp(s, { type: 'completeOrder', orderId: job.oid, odo: v.odo + Math.floor(R() * 4) }, ctx);
  };
  for (let d = 0; d < 270; d++) {
    const day = addDays(start, d), nowTs = startTs + d * 864e5; const ctx = { user: owner, now: nowTs }; const dow = new Date(parse(day)).getUTCDay();
    for (const job of pending.filter((j) => j.finish === day)) { finish(job, day, nowTs); pending.splice(pending.indexOf(job), 1); }
    for (const v of s.vehicles) {
      if (v.status === 'retired' || v.kpd === 0) continue;
      if (v.status === 'active' && dow !== 5) { const km = Math.round(v.kpd * (0.55 + R() * 0.9)); if (km > 0) v.odo += km; } else if (v.status === 'active') v.odo += Math.round(v.kpd * 0.2 * R());
      if ((d + Number(v.id.slice(1))) % 3 === 0 && v.odo > (v.lastRead || 0)) { s.readings.push({ id: nextId(s, 'r'), vehicleId: v.id, km: v.odo, date: day, by: 'Driver' }); v.odoDate = day; v.lastRead = v.odo; }
      if ((d + Number(v.id.slice(1)) * 2) % 9 === 0) { const prevFuel = s.fuel.filter((f) => f.vehicleId === v.id); const lastKm = prevFuel.length ? prevFuel[prevFuel.length - 1].km : v.odo - 600; const lit = Math.max(8, Math.round(((v.odo - lastKm) * (v.type === 'sedan' ? 7.5 : v.type === 'truck' || v.type === 'bus' ? 17 : 11)) / 100 + 6)); const ppl = v.fuel === 'diesel' ? 13.75 : 17.25; s.fuel.push({ id: nextId(s, 'f'), vehicleId: v.id, date: day, liters10: lit * 10, cost: Math.round(lit * ppl * 100), km: v.odo, by: 'Driver' }); }
      if (v.status !== 'active' || s.orders.some((o) => o.vehicleId === v.id && isOpenStatus(o.status)) || pending.some((j) => j.vid === v.id)) continue;
      const items = scheduleItems(s, day, null, v.id).filter((i) => i.state !== 'ok');
      const due = items.filter((i) => i.state === 'overdue' || i.kmLeft < 600);
      const suppress = lateSet.has(v.id) && d > 270 - 60;
      if (due.length && !suppress && R() < 0.3) {
        const planIds = [...new Set([...due.map((i) => i.id), ...(due.some((i) => i.planId === 'pl1') ? items.filter((i) => i.planId === 'pl2' && i.kmLeft < 3000).map((i) => i.id) : [])])];
        const oid = applyOp(s, { type: 'createOrder', vehicleId: v.id, kind: 'scheduled', planIds }, ctx).orderId;
        const parts = [], pl = planIds.map((id) => s.schedules.find((x) => x.id === id).planId);
        let h = 0; for (const pid of pl) { const plan = s.plans.find((p) => p.id === pid); parts.push(...partsFor(v, plan)); h += hoursFor[pid]; }
        applyOp(s, { type: 'startOrder', orderId: oid }, ctx);
        pending.push({ oid, vid: v.id, parts: mergeParts(parts), h, finish: addDays(day, 1 + Math.floor(R() * 2)) });
      } else if (R() < 0.0042) {
        const rp = REPAIRS[Math.floor(R() * REPAIRS.length)]; if (rp.big && v.type === 'sedan') continue;
        const withIssue = R() < 0.5 && v.driverId; let issueId;
        const oid = (() => {
          if (withIssue) { const drv = s.drivers.find((x) => x.id === v.driverId); const iu = { id: 'u-d', name: drv.name, nameAr: drv.nameAr, role: 'driver', driverId: drv.id }; const iid = applyOp(s, { type: 'reportIssue', vehicleId: v.id, title: rp.t, desc: '', priority: R() < 0.3 ? 'urgent' : 'normal' }, { user: iu, now: nowTs }).issueId; issueId = iid; return applyOp(s, { type: 'convertIssue', issueId: iid }, { user: mgr, now: nowTs }).orderId; }
          return applyOp(s, { type: 'createOrder', vehicleId: v.id, kind: rp.kind, title: rp.t, priority: R() < 0.25 ? 'urgent' : 'normal' }, ctx).orderId;
        })();
        applyOp(s, { type: 'startOrder', orderId: oid }, ctx);
        pending.push({ oid, vid: v.id, parts: rp.parts, h: rp.h, vendor: rp.vendor, finish: addDays(day, 1 + Math.floor(R() * (rp.big ? 5 : 3))) });
      }
    }
  }
  // Anything still pending at the end is finished now so the history is consistent, then the live scenario is laid on top.
  for (const job of pending.splice(0)) { const o = s.orders.find((x) => x.id === job.oid); if (o && o.status === 'progress') finish(job, today, now); }
  for (const v of s.vehicles) { v.odoDate = v.odoDate > today ? today : v.odoDate; delete v.kpd; delete v.lastRead; }
  // ---- live scenario ----
  const T = (n) => addDays(today, n); const ctxNow = (n) => now - n * 864e5;
  const byPlate = (i) => s.vehicles[i - 1];
  s.audit = []; s.reminderLog = [];
  // overdue / due-soon services are produced by the odometer and the plans; add specific documents and licences
  byPlate(2).regExpiry = T(12); byPlate(5).insExpiry = T(21); byPlate(8).regExpiry = T(-6); byPlate(11).insExpiry = T(27); byPlate(17).regExpiry = T(18);
  s.drivers[3].licenseExpiry = T(30); s.drivers[8].licenseExpiry = T(-3);
  // a job in progress, a job waiting for parts, one awaiting approval, one planned
  const ctxM = (n) => ({ user: mgr, now: ctxNow(n) }), ctxO = (n) => ({ user: owner, now: ctxNow(n) }), ws = { id: 'u-ws', name: 'Ashraf Mahdy', nameAr: 'أشرف مهدي', role: 'workshop' }, ctxW = (n) => ({ user: ws, now: ctxNow(n) });
  const w1 = applyOp(s, { type: 'createOrder', vehicleId: 'v6', kind: 'repair', title: 'Gearbox noise and slipping clutch', desc: 'Driver reports a noise on shifting under load.', priority: 'urgent', estimate: 1400000 }, ctxM(2)).orderId;
  applyOp(s, { type: 'startOrder', orderId: w1 }, ctxW(2)); stockFor('CLT-KIT', 1, ctxNow(1)); applyOp(s, { type: 'addPart', orderId: w1, partId: P('CLT-KIT').id, qty: 1 }, ctxW(1)); applyOp(s, { type: 'setLabor', orderId: w1, hours10: 40 }, ctxW(1));
  const w2 = applyOp(s, { type: 'createOrder', vehicleId: 'v14', kind: 'repair', title: 'Alternator and battery light', priority: 'normal' }, ctxM(3)).orderId;
  applyOp(s, { type: 'startOrder', orderId: w2 }, ctxW(3)); applyOp(s, { type: 'setLabor', orderId: w2, hours10: 15 }, ctxW(2)); applyOp(s, { type: 'setWaiting', orderId: w2, on: true, reason: 'Waiting for the alternator from the supplier' }, ctxW(2));
  applyOp(s, { type: 'createOrder', vehicleId: 'v9', kind: 'repair', title: 'Engine overhaul (excessive smoke)', desc: 'Compression test shows two weak cylinders.', priority: 'urgent', estimate: 4500000 }, ctxM(1));
  const sc3 = s.schedules.find((x) => x.vehicleId === 'v11' && x.planId === 'pl3').id;
  applyOp(s, { type: 'createOrder', vehicleId: 'v11', kind: 'scheduled', planIds: [sc3], planned: T(3) }, ctxM(0));
  // issues from drivers
  const drv = (i) => { const d = s.drivers[i]; return { id: 'u-d', name: d.name, nameAr: d.nameAr, role: 'driver', driverId: d.id }; };
  applyOp(s, { type: 'reportIssue', vehicleId: 'v1', title: 'Vibration at high speed', desc: 'Starts above 90 km/h. Steering wheel shakes.', priority: 'normal' }, { user: { ...drv(0), id: 'u-drv' }, now: ctxNow(1) });
  applyOp(s, { type: 'reportIssue', vehicleId: 'v3', title: 'Brake pedal feels soft', desc: '', priority: 'urgent' }, { user: drv(2), now: ctxNow(0) });
  applyOp(s, { type: 'reportIssue', vehicleId: 'v13', title: 'Rear door lock does not close', desc: 'Sliding door only.', priority: 'low' }, { user: drv(12), now: ctxNow(0) });
  // stock levels
  P('OIL-15W40').stock = 22; P('BRK-PAD').stock = 2; P('FLT-OIL').stock = Math.max(P('FLT-OIL').stock, 16); P('BLB-HL').stock = 0;
  s.audit = []; s.reminderLog = []; s.keys = [];
  return s;
}
function mergeParts(list) { const m = {}; for (const [k, q] of list) m[k] = (m[k] || 0) + q; return Object.entries(m); }
