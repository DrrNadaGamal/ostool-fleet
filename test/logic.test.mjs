import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../public/logic.js';

const NOW = Date.UTC(2026, 10, 25, 9, 0);
const S = () => L.seed(NOW);
const U = (s, role) => s.users.find((u) => u.role === role);
const op = (s, role, o, now = NOW) => L.applyOp(s, o, { user: U(s, role), now });
const bad = (fn, cls, re) => assert.throws(fn, (e) => e instanceof cls && (!re || re.test(e.message)));
const openOrder = (s, st) => s.orders.find((o) => o.status === st);

test('dates: Cairo day key, month math, diff', () => {
  assert.equal(L.dayKey(Date.UTC(2026, 10, 25, 22, 30)), '2026-11-26');
  assert.equal(L.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(L.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(L.diffDays('2026-11-01', '2026-11-25'), 24);
  assert.equal(L.monthOf('2026-11-25'), '2026-11');
});
test('plates: normalised from Latin and Arabic input', () => {
  assert.equal(L.normPlate('kfy 1234'), 'KFY 1234');
  assert.equal(L.normPlate('س ق ١٢٣'), 'SQ 123');
  assert.equal(L.normPlate('ر-٥٦٧٨'), 'R 5678');
  bad(() => L.normPlate('ZZZ 1'), L.UserError);
  bad(() => L.normPlate('KFYS 12'), L.UserError);
  bad(() => L.normPlate(''), L.UserError);
  assert.match(L.plateAr('KFY 7212'), /ك/);
});
test('csv: escapes quotes, commas, formula starts', () => {
  assert.equal(L.csvCell('a,b'), '"a,b"');
  assert.equal(L.csvCell('say "hi"'), '"say ""hi"""');
  assert.ok(!/^[=+\-@]/.test(L.csvCell('=cmd()')));
  assert.ok(L.toCsv([['a', 'b'], [1, 2]]).startsWith('\ufeff'));
});
test('seed: deterministic and consistent', () => {
  const a = S(), b = S();
  assert.deepEqual(a.vehicles, b.vehicles); assert.deepEqual(a.orders.length, b.orders.length);
  assert.equal(a.vehicles.length, 24); assert.equal(a.drivers.length, 18); assert.ok(a.orders.length > 150);
  assert.ok(a.parts.every((p) => p.stock >= 0));
  assert.ok(new Set(a.vehicles.map((v) => v.plate)).size === 24);
  assert.ok(a.vehicles.filter((v) => v.driverId).every((v, i, arr) => arr.filter((x) => x.driverId === v.driverId).length === 1));
  for (const o of a.orders.filter((x) => x.status === 'done')) assert.equal(o.total, L.orderTotal(o));
});
test('seed: live scenario exists for the demo', () => {
  const s = S(), v = L.view(s, U(s, 'owner'), NOW);
  assert.ok(v.schedules.filter((i) => i.state === 'overdue').length >= 10);
  assert.ok(v.schedules.some((i) => i.state === 'soon'));
  for (const st of ['awaiting', 'progress', 'waiting', 'open']) assert.ok(openOrder(s, st), st);
  assert.ok(s.issues.filter((i) => i.status === 'new').length >= 3);
  assert.ok(s.parts.some((p) => p.stock < p.min));
});
test('odometer: cannot go backwards, no impossible jumps, same value rejected', () => {
  const s = S(), v = s.vehicles.find((x) => x.status === 'active' && x.driverId);
  const odo = v.odo;
  bad(() => op(s, 'manager', { type: 'logReading', vehicleId: v.id, km: v.odo - 1 }), L.UserError);
  bad(() => op(s, 'manager', { type: 'logReading', vehicleId: v.id, km: v.odo }), L.UserError, /not changed/);
  bad(() => op(s, 'manager', { type: 'logReading', vehicleId: v.id, km: v.odo + 90000 }), L.UserError);
  op(s, 'manager', { type: 'logReading', vehicleId: v.id, km: odo + 50 });
  assert.equal(s.vehicles.find((x) => x.id === v.id).odo, odo + 50);
});
test('idempotency key stops double submits', () => {
  const s = S(), v = s.vehicles.find((x) => x.status === 'active');
  const odo0 = v.odo; const o = { type: 'logReading', vehicleId: v.id, km: v.odo + 10, key: 'key-1' };
  op(s, 'manager', o); const n = s.readings.length, odo = v.odo; op(s, 'manager', o);
  assert.equal(s.readings.length, n); assert.equal(s.vehicles.find((x) => x.id === v.id).odo, odo0 + 10);
});
test('fuel: validates litres, cost and price per litre', () => {
  const s = S(), v = s.vehicles.find((x) => x.status === 'active');
  bad(() => op(s, 'manager', { type: 'logFuel', vehicleId: v.id, liters10: 0, cost: 10000, km: v.odo + 5 }), L.UserError);
  bad(() => op(s, 'manager', { type: 'logFuel', vehicleId: v.id, liters10: 100, cost: 100, km: v.odo + 5 }), L.UserError, /Price per litre/);
  const n = s.fuel.length; op(s, 'manager', { type: 'logFuel', vehicleId: v.id, liters10: 400, cost: 20000, km: v.odo + 5 });
  assert.equal(s.fuel.length, n + 1);
});
test('work order: full flow open, start, parts, labour, complete resets the schedule', () => {
  const s = S(), it = L.scheduleItems(s, L.dayKey(NOW), {}).find((i) => i.state === 'overdue' && !s.orders.some((o) => o.vehicleId === i.vehicleId && L.isOpenStatus(o.status)));
  assert.ok(it);
  const r = op(s, 'manager', { type: 'createOrder', vehicleId: it.vehicleId, kind: 'scheduled', planIds: [it.id], priority: 'normal' });
  const id = r.orderId; assert.equal(s.orders.find((o) => o.id === id).status, 'open');
  op(s, 'workshop', { type: 'startOrder', orderId: id });
  assert.equal(s.vehicles.find((v) => v.id === it.vehicleId).status, 'workshop');
  const p = s.parts.find((x) => x.stock > 5); const before = p.stock;
  op(s, 'workshop', { type: 'addPart', orderId: id, partId: p.id, qty: 2 }); assert.equal(p.stock, before - 2);
  op(s, 'workshop', { type: 'setLabor', orderId: id, hours10: 10 });
  const v = s.vehicles.find((x) => x.id === it.vehicleId);
  op(s, 'workshop', { type: 'completeOrder', orderId: id, odo: v.odo + 20 });
  const o = s.orders.find((x) => x.id === id);
  assert.equal(o.status, 'done'); assert.equal(o.total, L.orderTotal(o));
  assert.equal(s.vehicles.find((x) => x.id === v.id).status, 'active');
  const after = L.scheduleItems(s, L.dayKey(NOW), {}).find((i) => i.id === it.id);
  assert.notEqual(after.state, 'overdue');
});
test('work order: a service already covered cannot be ordered twice', () => {
  const s = S(), o = s.orders.find((x) => x.kind === 'scheduled' && L.isOpenStatus(x.status));
  if (!o) return;
  bad(() => op(s, 'manager', { type: 'createOrder', vehicleId: o.vehicleId, kind: 'scheduled', planIds: [o.planIds[0]], priority: 'normal' }), L.UserError, /already/);
});
test('stock: removing a part and cancelling restore stock; stock cannot go negative', () => {
  const s = S(), v = s.vehicles.find((x) => x.status === 'active' && !s.orders.some((o) => o.vehicleId === x.id && L.isOpenStatus(o.status)));
  const id = op(s, 'manager', { type: 'createOrder', vehicleId: v.id, kind: 'repair', title: 'Check noise', priority: 'low' }).orderId;
  op(s, 'manager', { type: 'startOrder', orderId: id });
  const p = s.parts.find((x) => x.stock > 3), b = p.stock;
  op(s, 'manager', { type: 'addPart', orderId: id, partId: p.id, qty: 3 });
  op(s, 'manager', { type: 'removePart', orderId: id, partId: p.id }); assert.equal(p.stock, b);
  op(s, 'manager', { type: 'addPart', orderId: id, partId: p.id, qty: 3 });
  bad(() => op(s, 'manager', { type: 'addPart', orderId: id, partId: p.id, qty: p.stock + 1 }), L.UserError, /Not enough stock/);
  op(s, 'manager', { type: 'cancelOrder', orderId: id, reason: 'Customer withdrew' }); assert.equal(p.stock, b);
  bad(() => op(s, 'manager', { type: 'addPart', orderId: id, partId: p.id, qty: 1 }), L.UserError);
});
test('approval: owner approves; startOrder blocked until then', () => {
  const s = S(), o = openOrder(s, 'awaiting');
  bad(() => op(s, 'manager', { type: 'startOrder', orderId: o.id }), L.UserError, /approval/);
  bad(() => op(s, 'manager', { type: 'approveOrder', orderId: o.id }), L.PermError);
  op(s, 'owner', { type: 'approveOrder', orderId: o.id }); assert.equal(o.status, 'open');
  bad(() => op(s, 'owner', { type: 'approveOrder', orderId: o.id }), L.UserError);
});
test('limits: workshop and manager cannot close jobs above their limit', () => {
  const s = S(), o = openOrder(s, 'progress'); o.hours10 = 0; o.partsUsed = []; o.vendor = 'X Garage'; o.vendorCost = 600000;
  bad(() => op(s, 'workshop', { type: 'completeOrder', orderId: o.id, odo: 999999 }), L.PermError, /manager/);
  o.vendorCost = 2500000;
  bad(() => op(s, 'manager', { type: 'completeOrder', orderId: o.id, odo: 999999 }), L.PermError, /owner/);
});
test('limits: empty job cannot be completed; waiting job must resume first', () => {
  const s = S(), w = openOrder(s, 'waiting');
  bad(() => op(s, 'manager', { type: 'completeOrder', orderId: w.id, odo: 999999 }), L.UserError, /Resume/);
  op(s, 'manager', { type: 'setWaiting', orderId: w.id, on: false }); assert.equal(w.status, 'progress');
  op(s, 'manager', { type: 'setWaiting', orderId: w.id, on: true, reason: 'Waiting for the supplier' }); assert.equal(w.status, 'waiting');
});
test('issues: driver reports, manager converts into an order or dismisses', () => {
  const s = S(), d = U(s, 'driver'), veh = s.vehicles.find((v) => v.driverId === d.driverId);
  const drv = { ...d }; const r = L.applyOp(s, { type: 'reportIssue', vehicleId: veh.id, title: 'Strange noise', desc: 'Front left', priority: 'normal' }, { user: drv, now: NOW });
  const i = s.issues.find((x) => x.id === r.issueId); assert.equal(i.driverId, d.driverId);
  bad(() => L.applyOp(s, { type: 'convertIssue', issueId: i.id }, { user: drv, now: NOW }), L.PermError);
  const c = op(s, 'manager', { type: 'convertIssue', issueId: i.id }); assert.equal(i.status, 'converted'); assert.equal(i.orderId, c.orderId);
  bad(() => op(s, 'manager', { type: 'dismissIssue', issueId: i.id, reason: 'Duplicate' }), L.UserError, /already/);
});
test('driver is limited to their own vehicle', () => {
  const s = S(), d = U(s, 'driver'), other = s.vehicles.find((v) => v.driverId !== d.driverId && v.status === 'active');
  bad(() => L.applyOp(s, { type: 'logReading', vehicleId: other.id, km: other.odo + 5 }, { user: d, now: NOW }), L.PermError);
  bad(() => L.applyOp(s, { type: 'createOrder', vehicleId: other.id, kind: 'repair', title: 'x y z' }, { user: d, now: NOW }), L.PermError);
});
test('assign driver: expired licence, double assignment, unassign', () => {
  const s = S(), v = s.vehicles.find((x) => x.status === 'active' && !x.driverId) || s.vehicles.find((x) => x.status === 'active');
  const expired = s.drivers.find((d) => d.licenseExpiry < L.dayKey(NOW));
  if (expired) bad(() => op(s, 'manager', { type: 'assignDriver', vehicleId: v.id, driverId: expired.id }), L.UserError, /licence/);
  const busy = s.vehicles.find((x) => x.driverId && x.id !== v.id);
  bad(() => op(s, 'manager', { type: 'assignDriver', vehicleId: v.id, driverId: busy.driverId }), L.UserError, /already/);
  op(s, 'manager', { type: 'assignDriver', vehicleId: busy.id, driverId: null }); assert.equal(busy.driverId, null);
});
test('vehicles: add with a unique plate, retire blocks new work', () => {
  const s = S(), n = s.vehicles.length;
  const r = op(s, 'manager', { type: 'addVehicle', plate: 'KFY 123', make: 'Toyota', model: 'Hilux', year: 2022, vtype: 'pickup', fuel: 'diesel', odo: 1000, regExpiry: '2027-03-01', insExpiry: '2027-03-01' });
  assert.equal(s.vehicles.length, n + 1);
  bad(() => op(s, 'manager', { type: 'addVehicle', plate: 'kfy123', make: 'Toyota', model: 'Hilux', year: 2022, vtype: 'pickup', fuel: 'diesel', odo: 5, regExpiry: '2027-03-01', insExpiry: '2027-03-01' }), L.UserError);
  const id = r.vehicleId; op(s, 'owner', { type: 'retireVehicle', vehicleId: id, reason: 'Sold' });
  bad(() => op(s, 'manager', { type: 'createOrder', vehicleId: id, kind: 'repair', title: 'Check noise' }), L.UserError, /retired/);
});
test('parts: receive updates average cost, new SKU unique, adjust needs reason', () => {
  const s = S(), p = s.parts[0], oldStock = p.stock;
  op(s, 'workshop', { type: 'receiveParts', partId: p.id, qty: 10, unitCost: p.cost * 2 });
  assert.equal(p.stock, oldStock + 10); assert.ok(p.cost > 0);
  const r = op(s, 'manager', { type: 'newPart', sku: 'tst-1', name: 'Test part', min: 2, cost: 1000, stock: 4 });
  assert.ok(s.parts.find((x) => x.id === r.partId));
  bad(() => op(s, 'manager', { type: 'newPart', sku: 'TST-1', name: 'Again' }), L.UserError, /exists/);
  bad(() => op(s, 'manager', { type: 'adjustStock', partId: p.id, count: 1, reason: '' }), L.UserError);
  bad(() => op(s, 'workshop', { type: 'newPart', sku: 'WS-1', name: 'No' }), L.PermError);
});
test('roles: workshop cannot create scheduled work, cancel, or set plans', () => {
  const s = S(), v = s.vehicles.find((x) => x.status === 'active');
  bad(() => op(s, 'workshop', { type: 'createOrder', vehicleId: v.id, kind: 'scheduled', planIds: [s.plans[0].id] }), L.PermError);
  bad(() => op(s, 'workshop', { type: 'cancelOrder', orderId: s.orders.find((o) => L.isOpenStatus(o.status)).id, reason: 'No need' }), L.PermError);
  bad(() => op(s, 'workshop', { type: 'logFuel', vehicleId: v.id, liters10: 300, cost: 15000, km: v.odo + 1 }), L.PermError);
});
test('unknown and prototype op names are rejected', () => {
  const s = S();
  for (const t of ['nope', 'constructor', '__proto__', 'toString', '']) bad(() => op(s, 'owner', { type: t }), L.UserError, /Unknown/);
  bad(() => L.applyOp(s, null, { user: U(s, 'owner'), now: NOW }), L.UserError);
});
test('reports: cost and availability numbers are consistent', () => {
  const s = S(), v = L.view(s, U(s, 'owner'), NOW), r = v.reports;
  assert.ok(r.availability > 0 && r.availability <= 1);
  assert.ok(r.months.length === 6);
  const sum = s.orders.filter((o) => o.status === 'done' && o.completedAt.startsWith(L.monthOf(L.dayKey(NOW)))).reduce((a, o) => a + o.total, 0);
  assert.equal(r.maintMonth, sum);
});
test('view privacy: driver sees own vehicle only, no costs, no stock reminders', () => {
  const s = S(), v = L.view(s, U(s, 'driver'), NOW), j = JSON.stringify(v);
  assert.equal(v.vehicles.length, 1); assert.equal(v.reports, undefined); assert.equal(v.audit, undefined);
  assert.ok(v.orders.every((o) => o.total === undefined && o.vendorCost === undefined && o.partsUsed.length === 0));
  const other = s.drivers.find((d) => d.id !== U(s, 'driver').driverId);
  assert.ok(!j.includes(other.phone));
  assert.ok(v.reminders === undefined || v.reminders.every((r) => r.type !== 'stock'));
});
test('view privacy: workshop gets no fuel, reports or audit; manager no audit', () => {
  const s = S(), w = L.view(s, U(s, 'workshop'), NOW), m = L.view(s, U(s, 'manager'), NOW), o = L.view(s, U(s, 'owner'), NOW);
  assert.equal(w.fuel.length, 0); assert.equal(w.reports, undefined); assert.equal(w.audit, undefined);
  assert.equal(m.audit, undefined); assert.ok(Array.isArray(o.audit));
});
test('reminders: log is idempotent per key and role-restricted', () => {
  const s = S(); op(s, 'manager', { type: 'logReminder', key: 'sv:abc1' });
  assert.equal(s.reminderLog.length, 1);
  bad(() => op(s, 'manager', { type: 'logReminder', key: '../../x' }), L.UserError);
  bad(() => op(s, 'workshop', { type: 'logReminder', key: 'sv:abc2' }), L.PermError);
});
test('settings limits are demo values: workshop 5,000 and manager 20,000 EGP', () => {
  assert.equal(L.DEFAULTS.workshopLimit, 500000); assert.equal(L.DEFAULTS.managerLimit, 2000000);
});
