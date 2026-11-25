import * as L from './logic.js';
import { T } from './i18n.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem('os.' + k)) ?? d; } catch { return d; } }, set: (k, v) => localStorage.setItem('os.' + k, JSON.stringify(v)), del: (k) => localStorage.removeItem('os.' + k) };
const rid = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
const S = { lang: new URLSearchParams(location.search).get('lang') || LS.get('lang', 'en'), token: LS.get('token', null), me: LS.get('me', null), data: null, modal: null, busy: false, err: '', vq: '', vf: 'all', sf: 'all', pf: 'all', iq: '', of: 'all', mo: {} };
if (!T[S.lang]) S.lang = 'en';
const get = (o, k) => k.split('.').reduce((a, p) => (a == null ? a : a[p]), o);
const t = (k) => get(T[S.lang], k) ?? get(T.en, k) ?? k;
const ar = () => S.lang === 'ar';
const nf = (n, d = 0) => Number(n).toLocaleString(ar() ? 'ar-EG' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (c) => `${nf(c / 100, c % 100 ? 2 : 0)} ${t('cur')}`;
const km = (n) => `${nf(n)} ${t('kmU')}`;
const pct = (x) => nf(Math.round(x * 100)) + '%';
const dt = (k) => (k ? new Date(k + 'T00:00:00Z').toLocaleDateString(ar() ? 'ar-EG' : 'en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }) : '');
const mon = (m) => new Date(m + '-01T00:00:00Z').toLocaleDateString(ar() ? 'ar-EG' : 'en-GB', { timeZone: 'UTC', month: 'short', year: '2-digit' });
const nm = (o) => (o ? (ar() ? o.nameAr || o.name : o.name) : '');
const D = () => S.data;
const me = () => S.data?.me || S.me;
const role = () => me()?.role;
const isDriver = () => role() === 'driver';
const canManage = () => role() === 'owner' || role() === 'manager';
const canWork = () => role() !== 'driver';
const vehOf = (id) => D().vehicles.find((v) => v.id === id);
const drvOf = (id) => D().drivers.find((d) => d.id === id);
const partOf = (id) => D().parts.find((p) => p.id === id);
const planOf = (id) => D().plans.find((p) => p.id === id);
const plate = (v) => (v ? (ar() ? L.plateAr(v.plate) : v.plate) : '');
const plateTag = (v) => `<bdi class="plate">${esc(plate(v))}</bdi>`;
const vlabel = (v) => (v ? `${plate(v)} · ${v.make} ${v.model}` : '');
const val = (id) => $('#' + id)?.value ?? '';
const AR_DIG = '٠١٢٣٤٥٦٧٨٩';
const norm = (s) => String(s ?? '').replace(/[٠-٩]/g, (d) => AR_DIG.indexOf(d)).replace(/٫/g, '.').replace(/،/g, ',').trim();
const toInt = (s) => { const n = Number(norm(s).replace(/,/g, '')); return Number.isFinite(n) && norm(s) !== '' ? n : NaN; };
const toCents = (s) => { const n = parseFloat(norm(s).replace(/,/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0; };
const toTenths = (s) => { const n = parseFloat(norm(s)); return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) : NaN; };
const toast = (m, bad) => { const el = $('#toast'); el.innerHTML = `<div class="${bad ? 'err' : ''}">${esc(m)}</div>`; clearTimeout(toast.h); toast.h = setTimeout(() => (el.innerHTML = ''), bad ? 5500 : 2600); };
const errText = (m) => { const d = T[S.lang].srv; if (d?.[m]) return d[m]; for (const [re, fn] of T[S.lang].srvRe || []) { const x = re.exec(m); if (x) return fn(...x.slice(1)); } return m; };

// ---------- network ----------
class NetError extends Error {}
async function call(method, body) {
  let r;
  try { r = await fetch('/api/data', { method, headers: { 'content-type': 'application/json', ...(S.token ? { authorization: 'Bearer ' + S.token } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' }); } catch { throw new NetError('offline'); }
  let j = {}; try { j = await r.json(); } catch { if (r.status >= 500) throw new NetError('server'); }
  if (r.status === 401 && S.token) { logout(); throw new Error(j.error || t('again')); }
  if (r.status >= 500) throw new NetError('server');
  if (!r.ok) throw new Error(j.error || 'Error');
  return j;
}
async function act(op, okMsg) {
  if (S.busy) return null; S.busy = true;
  try { const j = await call('POST', { op }); const { result, ...v } = j; S.data = v; if (okMsg) toast(okMsg); return result || {}; }
  catch (e) { toast(e instanceof NetError ? t(e.message === 'offline' ? 'offline' : 'err.server') : errText(e.message), true); return null; }
  finally { S.busy = false; }
}
async function refresh() { try { S.data = await call('GET'); S.err = ''; } catch (e) { S.err = e instanceof NetError ? t('offline') : errText(e.message); } }
async function login(pin) {
  try { const j = await call('POST', { op: { type: 'login', pin } }); S.token = j.token; S.me = j.me; LS.set('token', j.token); LS.set('me', j.me); S.err = ''; await refresh(); location.hash = j.me.role === 'driver' ? '#/home' : j.me.role === 'workshop' ? '#/orders' : '#/dashboard'; render(); }
  catch (e) { S.err = errText(e.message); render(); }
}
function logout() { S.token = null; S.me = null; S.data = null; LS.del('token'); LS.del('me'); S.modal = null; location.hash = ''; render(); }

// ---------- routing ----------
const NAV = {
  owner: ['dashboard', 'vehicles', 'service', 'orders', 'issues', 'parts', 'drivers', 'fuel', 'reports', 'audit'],
  manager: ['dashboard', 'vehicles', 'service', 'orders', 'issues', 'parts', 'drivers', 'fuel', 'reports'],
  workshop: ['orders', 'service', 'vehicles', 'parts'],
  driver: ['home', 'history'],
};
const route = () => (location.hash.replace(/^#\/?/, '') || NAV[role()]?.[0] || 'dashboard').split('/')[0];

// ---------- small views ----------
const pill = (cls, txt) => `<span class="pill ${cls}">${esc(txt)}</span>`;
const empty = (m) => `<p class="empty">${esc(m || t('none'))}</p>`;
const kpi = (n, l, cls = '', sub = '') => `<div class="card kpi ${cls}"><div class="n">${n}</div><div class="l">${esc(l)}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
const field = (id, label, inner, hint) => `<div class="f"><label for="${id}">${esc(label)}</label>${inner}${hint ? `<small class="muted">${esc(hint)}</small>` : ''}</div>`;
const LOGO = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#1c2733"/><path d="M8 29V19h17v10zm19-7h6l5 5v2H27z" fill="#f08a3c"/><circle cx="16" cy="32" r="3.6" fill="#1c2733" stroke="#f2f6f5" stroke-width="2"/><circle cx="33" cy="32" r="3.6" fill="#1c2733" stroke="#f2f6f5" stroke-width="2"/></svg>';
const sel = (id, opts, cur) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const meter = (x, cls = '') => `<div class="meter ${cls}"><i style="width:${Math.max(0, Math.min(100, Math.round(x * 100)))}%"></i></div>`;
const downloadCsv = (name, rows) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([L.toCsv(rows)], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
const stPill = (st) => pill(st === 'overdue' ? 'bad' : st === 'soon' ? 'off' : '', t('ss.' + st));
const vsPill = (v) => (v.status === 'retired' ? pill('gray', t('vs.retired')) : v.status === 'workshop' ? pill('ice', t('vs.workshop')) : pill('', t('vs.active')));
const osPill = (o) => pill(o.status === 'done' ? '' : o.status === 'cancelled' ? 'gray' : o.status === 'awaiting' ? 'bad' : o.status === 'open' ? 'ice' : 'off', t('os.' + o.status));
const prPill = (p) => (p === 'urgent' ? pill('bad', t('pr.urgent')) : p === 'low' ? pill('gray', t('pr.low')) : pill('ice', t('pr.normal')));
const docPill = (d) => { const left = L.diffDays(D().today, d); return pill(left < 0 ? 'bad' : left <= 30 ? 'off' : 'gray', dt(d)); };
const vHealth = (v) => { if (v.status === 'retired') return 'vac'; if (v.status === 'workshop') return 'ws'; const it = D().schedules.filter((s) => s.vehicleId === v.id); return it.some((s) => s.state === 'overdue') ? 'beh' : it.some((s) => s.state === 'soon') ? 'exp' : ''; };
const left = (it) => (it.kmLeft < 0 ? `<span class="neg">${esc(nf(-it.kmLeft))} ${esc(t('kmOver'))}</span>` : `${esc(km(it.kmLeft))}`);
const planName = (id) => nm(planOf(id));
const orderTotal = (o) => (o.total != null ? o.total : 0);

function shell(inner) {
  const nav = NAV[role()] || []; const r = route(); const m = me();
  return `<header class="top noprint"><a class="brand" href="#/${nav[0]}">${LOGO}<span>${esc(t('appName'))}<small>${esc(nm(D().company) || t('appSub'))}</small></span></a>
  <nav class="nav" aria-label="main">${nav.map((k) => `<a href="#/${k}" class="${r === k ? 'on' : ''}">${esc(t('nav.' + k))}</a>`).join('')}</nav>
  <div class="tools"><span class="pill">${esc(nm(m))} · ${esc(t('role.' + m.role))}</span><button class="btn sm ghost" data-act="lang">${esc(t('other'))}</button><button class="btn sm ghost" data-act="logout">${esc(t('logout'))}</button></div></header>
  <main>${S.err ? `<div class="notice bad" role="alert">${esc(S.err)}</div>` : ''}${inner}<p class="muted small foot noprint">${esc(t('limits'))}${role() === 'owner' ? ` <button class="btn sm" data-act="reset">${esc(t('b.reset'))}</button>` : ''}</p></main>`;
}

// ---------- pages ----------
function loginView() {
  return `<div class="login"><div class="logo">${LOGO}<div><h1>${esc(t('appName'))}</h1><p class="sub">${esc(t('appSub'))}</p></div></div>
  <div class="card"><h2>${esc(t('signin'))}</h2><p class="muted small">${esc(t('demoNote'))}</p>
  <div class="demo-users">${L.DEMO_USERS.map((u) => `<button class="btn" data-act="pin" data-pin="${u.pin}"><span>${esc(ar() ? u.labelAr : u.label)}</span><span class="pill gray" dir="ltr">${u.pin}</span></button>`).join('')}</div>
  <form id="pinform" class="row"><label for="pin" class="sr">${esc(t('pin'))}</label><input id="pin" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="${esc(t('pin'))}" dir="ltr"><button class="btn pri">${esc(t('signin'))}</button></form>
  ${S.err ? `<div class="notice bad" role="alert">${esc(S.err)}</div>` : ''}<p class="muted small">${esc(t('limits'))}</p>
  <button class="btn sm" data-act="lang">${esc(t('other'))}</button></div></div>`;
}
function remText(r) {
  const v = r.vehicleId ? vehOf(r.vehicleId) : null;
  if (r.type === 'service') return `<b>${esc(planName(r.planId))}</b> · ${plateTag(v)}<div class="small muted">${r.kmLeft < 0 ? esc(nf(-r.kmLeft) + ' ' + t('kmOver')) : esc(km(r.kmLeft) + ' ' + t('kmLeftW'))} · ${esc(dt(r.due))}</div>`;
  if (r.type === 'reg' || r.type === 'ins') return `<b>${esc(t('rem.' + r.type))}</b> · ${plateTag(v)}<div class="small muted">${esc(dt(r.due))}</div>`;
  if (r.type === 'license') { const d = drvOf(r.driverId); return `<b>${esc(t('rem.license'))}</b> · ${esc(nm(d))}<div class="small muted">${esc(dt(r.due))}${v ? ' · ' + esc(plate(v)) : ''}</div>`; }
  const p = partOf(r.partId); return `<b>${esc(t('rem.stock'))}</b> · ${esc(nm(p))}<div class="small muted">${esc(nf(p.stock))} / ${esc(nf(p.min))}</div>`;
}
function waUrl(r) {
  const d = drvOf(r.driverId), v = vehOf(r.vehicleId); if (!d?.phone || !v) return '';
  const msg = r.type === 'service' ? T[S.lang].remindMsg(nm(d), plate(v), planName(r.planId)) : T[S.lang].remindDocMsg(nm(d), plate(v), t('rem.' + r.type));
  return `https://wa.me/${d.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
}
function remRow(r, withAct) {
  const wa = withAct && canManage() && r.type !== 'stock' && r.driverId && (r.type !== 'license') ? waUrl(r) : '';
  return `<div class="mrow"><div>${remText(r)}</div><div class="row">${stPill(r.severity)}${wa ? `<a class="btn sm" data-act="remind" data-key="${esc(r.key)}" href="${esc(wa)}" target="_blank" rel="noopener">${r.sent ? esc(t('b.reminded')) : esc(t('b.remind'))}</a>` : ''}</div></div>`;
}
const bars = (months, a, b, la, lb) => {
  const max = Math.max(1, ...a, ...(b || [0]));
  return `<div class="bars2">${months.map((m, i) => `<div class="col2"><div class="pair"><div class="b" style="height:${(a[i] / max) * 100}%" title="${esc(la)}: ${esc(money(a[i]))}"></div>${b ? `<div class="b alt" style="height:${(b[i] / max) * 100}%" title="${esc(lb)}: ${esc(money(b[i]))}"></div>` : ''}</div><small>${esc(mon(m))}</small></div>`).join('')}</div>`;
};
function orderLine(o, cost = true) {
  const v = vehOf(o.vehicleId);
  return `<div class="mrow click" data-act="order" data-id="${o.id}" tabindex="0"><div><b>${esc(o.no)}</b> · ${plateTag(v)}<div class="small">${esc(o.title)}</div><div class="small muted">${esc(t('ok.' + o.kind))} · ${esc(dt(o.startedAt || o.openedAt))}${o.waitReason ? ' · ' + esc(o.waitReason) : ''}</div></div><div class="row">${prPill(o.priority)}${osPill(o)}${cost && o.total ? `<b>${esc(money(o.total))}</b>` : ''}</div></div>`;
}

const PAGES = {
  dashboard() {
    const d = D(), r = d.reports; const open = d.orders.filter((o) => L.isOpenStatus(o.status)); const act = d.vehicles.filter((v) => v.status !== 'retired');
    const by = (s) => open.filter((o) => o.status === s).length;
    const attn = d.reminders.slice(0, 8);
    const top = r.vehicles.filter((x) => x.perKm > 0).sort((a, b) => b.perKm - a.perKm).slice(0, 6); const topMax = Math.max(1, ...top.map((x) => x.perKm));
    return `<div class="bar"><h1>${esc(t('nav.dashboard'))}</h1><span class="sp"></span>${canManage() ? `<button class="btn" data-act="newvehicle">${esc(t('b.addVehicle'))}</button><button class="btn pri" data-act="neworder">${esc(t('b.newOrder'))}</button>` : ''}</div>
    <div class="grid kpis">
      ${kpi(pct(r.availability), t('k.availability'), r.availability >= 0.9 ? 'good' : 'warn', `${nf(act.filter((v) => v.status === 'active').length)} ${t('of')} ${nf(act.length)} ${t('k.vehiclesRun')}`)}
      ${kpi(nf(r.overdue), t('k.overdue'), r.overdue ? 'warn' : 'good', `${pct(r.compliance)} ${t('k.onSchedule')}`)}
      ${kpi(nf(open.length), t('k.openOrders'), '', `${nf(by('progress'))} ${t('k.inProgress')} · ${nf(by('waiting'))} ${t('k.waiting')} · ${nf(by('awaiting'))} ${t('k.awaiting')}`)}
      ${kpi(money(r.maintMonth), t('k.maintMonth'), '', `${esc(t('k.last6'))}: ${esc(money(r.maint.reduce((a, b) => a + b, 0)))}`)}
      ${kpi(r.totalKm ? money(Math.round((r.totalMaint + r.totalFuel) / r.totalKm)) : '-', t('k.perKm'), '', t('k.perKmSub'))}
    </div>
    <div class="grid two" style="margin-top:1rem">
      <section class="card"><div class="bar"><h2>${esc(t('needsAttention'))}</h2><span class="sp"></span><a class="btn sm" href="#/service">${esc(t('seeAll'))}</a></div>${attn.length ? attn.map((x) => remRow(x, true)).join('') : empty(t('allClear'))}</section>
      <section class="card"><div class="bar"><h2>${esc(t('inWorkshop'))}</h2><span class="sp"></span><a class="btn sm" href="#/orders">${esc(t('seeAll'))}</a></div>${open.length ? open.sort((a, b) => (a.status === 'awaiting' ? -1 : 0) - (b.status === 'awaiting' ? -1 : 0)).slice(0, 6).map((o) => orderLine(o)).join('') : empty()}</section>
      <section class="card"><h2>${esc(t('chartMaint'))}</h2>${bars(r.months, r.maint)}</section>
      <section class="card"><h2>${esc(t('costPerKmTop'))}</h2>${top.map((x) => `<div class="agrow"><span>${plateTag(vehOf(x.vehicleId))} <small class="muted">${esc(vehOf(x.vehicleId).model)}</small></span>${meter(x.perKm / topMax, x.perKm / topMax > 0.8 ? 'bad' : '')}<b>${esc(money(x.perKm))}</b></div>`).join('') || empty()}<p class="muted small">${esc(t('perKmNote'))}</p></section>
    </div>`;
  },
  vehicles() {
    const d = D(); const q = S.vq.trim().toLowerCase(); const f = S.vf;
    const list = d.vehicles.filter((v) => {
      const h = vHealth(v);
      if (f === 'retired' ? v.status !== 'retired' : v.status === 'retired' && f !== 'all') return false;
      if (f === 'all' && v.status === 'retired') return false;
      if (f === 'overdue' && h !== 'beh') return false; if (f === 'soon' && h !== 'exp') return false; if (f === 'workshop' && v.status !== 'workshop') return false;
      if (q && !(v.plate + ' ' + plate(v) + ' ' + v.make + ' ' + v.model + ' ' + nm(drvOf(v.driverId))).toLowerCase().includes(q)) return false; return true;
    });
    const chips = ['all', 'overdue', 'soon', 'workshop', 'retired'];
    return `<div class="bar"><h1>${esc(t('nav.vehicles'))}</h1><span class="sp"></span>${canManage() ? `<button class="btn pri" data-act="newvehicle">${esc(t('b.addVehicle'))}</button>` : ''}</div>
    <div class="chips noprint">${chips.map((c) => `<button class="chip ${f === c ? 'on' : ''}" data-act="vf" data-f="${c}">${esc(t('vf.' + c))}</button>`).join('')}<input id="vq" type="search" placeholder="${esc(t('f.search'))}" value="${esc(S.vq)}" aria-label="${esc(t('f.search'))}"></div>
    ${list.length ? `<div class="grid unitgrid">${list.map((v) => { const its = d.schedules.filter((s) => s.vehicleId === v.id && s.state !== 'ok').sort((a, b) => (a.state === 'overdue' ? 0 : 1) - (b.state === 'overdue' ? 0 : 1)); const nx = its[0];
      return `<article class="card ucard ${vHealth(v)}" data-act="vehicle" data-id="${v.id}" tabindex="0" role="button"><h3><span>${plateTag(v)}</span>${vsPill(v)}</h3><div>${esc(v.make)} ${esc(v.model)} · ${esc(nf(v.year).replace(/[,٬]/g, ''))}</div><div class="small muted">${esc(t('vt.' + v.type))} · ${esc(t('fu.' + v.fuel))} · ${esc(km(v.odo))}</div><div class="small">${v.driverId ? esc(nm(drvOf(v.driverId))) : `<span class="muted">${esc(t('noDriver'))}</span>`}</div>${nx ? `<div class="alts">${stPill(nx.state)}<small>${esc(planName(nx.planId))}</small></div>` : v.status === 'active' ? `<div class="alts">${pill('', t('ss.ok'))}</div>` : ''}</article>`; }).join('')}</div>` : empty()}`;
  },
  service() {
    const d = D(); const f = S.sf; const rank = { overdue: 0, soon: 1, ok: 2 };
    let list = d.schedules.filter((s) => f === 'all' || s.state === f).sort((a, b) => rank[a.state] - rank[b.state] || a.due.localeCompare(b.due));
    const chips = ['all', 'overdue', 'soon', 'ok'];
    return `<div class="bar"><h1>${esc(t('nav.service'))}</h1><span class="sp"></span>${canManage() ? `<button class="btn" data-act="csv" data-k="service">${esc(t('b.csv'))}</button>` : ''}</div>
    <div class="chips noprint">${chips.map((c) => `<button class="chip ${f === c ? 'on' : ''}" data-act="sf" data-f="${c}">${esc(c === 'all' ? t('f.all') : t('ss.' + c))} (${nf(c === 'all' ? d.schedules.length : d.schedules.filter((s) => s.state === c).length)})</button>`).join('')}</div>
    <div class="tw"><table><thead><tr><th>${esc(t('vehicle'))}</th><th>${esc(t('service'))}</th><th>${esc(t('lastDone'))}</th><th>${esc(t('nextDue'))}</th><th>${esc(t('left'))}</th><th>${esc(t('status'))}</th><th class="noprint"></th></tr></thead><tbody>
    ${list.map((it) => { const v = vehOf(it.vehicleId); const rem = d.reminders.find((r) => r.key === 'svc:' + it.id); const wa = rem && canManage() ? waUrl(rem) : '';
      return `<tr><td>${plateTag(v)} <small class="muted">${esc(v.make)} ${esc(v.model)}</small></td><td>${esc(planName(it.planId))}</td><td>${esc(km(it.lastKm))}<br><small class="muted">${esc(dt(it.lastDate))}</small></td><td>${esc(km(it.nextKm))}<br><small class="muted">${esc(dt(it.due))}</small></td><td>${left(it)}<br><small class="muted">${it.daysLeft < 0 ? esc(nf(-it.daysLeft) + ' ' + t('daysOver')) : esc(nf(it.daysLeft) + ' ' + t('days'))}</small></td><td>${stPill(it.state)}${it.orderId ? '<br>' + pill('ice', t('hasOrder')) : ''}</td><td class="noprint"><div class="acts1">${it.orderId ? `<button class="btn sm" data-act="order" data-id="${it.orderId}">${esc(t('b.open'))}</button>` : canManage() && it.state !== 'ok' ? `<button class="btn sm pri" data-act="neworder" data-v="${v.id}" data-sc="${it.id}">${esc(t('b.newOrder'))}</button>` : ''}${wa && !it.orderId ? `<a class="btn sm" data-act="remind" data-key="${esc(rem.key)}" href="${esc(wa)}" target="_blank" rel="noopener">${rem.sent ? esc(t('b.reminded')) : esc(t('b.remind'))}</a>` : ''}</div></td></tr>`; }).join('')}</tbody></table></div>
    ${list.length ? '' : empty()}
    <section class="card" style="margin-top:1rem"><h2>${esc(t('plans'))}</h2><p class="muted small">${esc(t('plansNote'))}</p>${d.plans.map((p) => `<div class="mrow"><div><b>${esc(nm(p))}</b></div><div class="row"><span>${esc(t('every'))} ${esc(km(p.km))} ${esc(t('orWord'))} ${esc(nf(p.months))} ${esc(t('months'))}</span>${role() === 'owner' ? `<button class="btn sm" data-act="plan" data-id="${p.id}">${esc(t('b.edit'))}</button>` : ''}</div></div>`).join('')}</section>`;
  },
  orders() {
    const d = D(); const cut = L.addDays(d.today, -30);
    const cols = [['open', (o) => o.status === 'open' || o.status === 'awaiting'], ['progress', (o) => o.status === 'progress'], ['waiting', (o) => o.status === 'waiting'], ['done', (o) => (o.status === 'done' || o.status === 'cancelled') && (o.completedAt || '') >= cut]];
    const sortO = (a, b) => ({ urgent: 0, normal: 1, low: 2 })[a.priority] - ({ urgent: 0, normal: 1, low: 2 })[b.priority] || a.openedAt.localeCompare(b.openedAt);
    return `<div class="bar"><h1>${esc(t('nav.orders'))}</h1><span class="sp"></span>${canManage() ? `<button class="btn" data-act="csv" data-k="orders">${esc(t('b.csv'))}</button>` : ''}<button class="btn pri" data-act="neworder">${esc(t('b.newOrder'))}</button></div>
    <div class="kan kan4">${cols.map(([k, fn]) => { const list = d.orders.filter(fn).sort(k === 'done' ? (a, b) => b.completedAt.localeCompare(a.completedAt) : sortO).slice(0, k === 'done' ? 12 : 30);
      return `<section><h3>${esc(t('col.' + k))} <span class="pill gray">${nf(d.orders.filter(fn).length)}</span></h3>${list.map((o) => { const v = vehOf(o.vehicleId);
        return `<article class="card req ${o.priority}" data-act="order" data-id="${o.id}" tabindex="0" role="button"><div class="row"><b>${esc(o.no)}</b><span class="sp"></span>${o.status === 'awaiting' ? pill('bad', t('os.awaiting')) : o.status === 'cancelled' ? pill('gray', t('os.cancelled')) : prPill(o.priority)}</div><div>${plateTag(v)} <small class="muted">${esc(v.make)} ${esc(v.model)}</small></div><div class="small">${esc(o.title)}</div><div class="small muted">${esc(t('ok.' + o.kind))} · ${esc(dt(o.completedAt || o.startedAt || o.planned || o.openedAt))}${o.total && o.status === 'done' && !isDriver() ? ' · ' + esc(money(o.total)) : ''}</div>${o.waitReason ? `<div class="small">${esc(o.waitReason)}</div>` : ''}</article>`; }).join('') || empty()}</section>`; }).join('')}</div>`;
  },
  issues() {
    const d = D(); const list = [...d.issues].sort((a, b) => (a.status === 'new' ? 0 : 1) - (b.status === 'new' ? 0 : 1) || b.date.localeCompare(a.date)).slice(0, 60);
    return `<div class="bar"><h1>${esc(t('nav.issues'))}</h1><span class="sp"></span><button class="btn pri" data-act="newissue">${esc(t('b.reportIssue'))}</button></div>
    ${list.length ? `<div class="tw"><table><thead><tr><th>${esc(t('date'))}</th><th>${esc(t('vehicle'))}</th><th>${esc(t('issue'))}</th><th>${esc(t('reportedBy'))}</th><th>${esc(t('priority'))}</th><th>${esc(t('status'))}</th><th class="noprint"></th></tr></thead><tbody>${list.map((i) => { const v = vehOf(i.vehicleId);
      return `<tr><td>${esc(dt(i.date))}</td><td>${plateTag(v)}</td><td><b>${esc(i.title)}</b>${i.desc ? `<div class="small muted">${esc(i.desc)}</div>` : ''}</td><td>${esc(ar() ? i.byAr : i.by)}</td><td>${prPill(i.priority)}</td><td>${pill(i.status === 'new' ? 'off' : i.status === 'converted' ? '' : 'gray', t('is.' + i.status))}${i.reason ? `<div class="small muted">${esc(i.reason)}</div>` : ''}</td><td class="noprint"><div class="acts1">${i.status === 'new' && canManage() ? `<button class="btn sm pri" data-act="convert" data-id="${i.id}">${esc(t('b.toOrder'))}</button><button class="btn sm" data-act="dismiss" data-id="${i.id}">${esc(t('b.dismiss'))}</button>` : ''}${i.orderId ? `<button class="btn sm" data-act="order" data-id="${i.orderId}">${esc(t('b.open'))}</button>` : ''}</div></td></tr>`; }).join('')}</tbody></table></div>` : empty()}`;
  },
  parts() {
    const d = D(); const f = S.pf; const list = d.parts.filter((p) => f === 'all' || p.stock < p.min).sort((a, b) => (a.stock < a.min ? 0 : 1) - (b.stock < b.min ? 0 : 1) || a.sku.localeCompare(b.sku));
    return `<div class="bar"><h1>${esc(t('nav.parts'))}</h1><span class="sp"></span>${canManage() ? `<button class="btn pri" data-act="newpart">${esc(t('b.newPart'))}</button>` : ''}</div>
    <div class="chips noprint">${['all', 'low'].map((c) => `<button class="chip ${f === c ? 'on' : ''}" data-act="pf" data-f="${c}">${esc(t('pf.' + c))}${c === 'low' ? ' (' + nf(d.parts.filter((p) => p.stock < p.min).length) + ')' : ''}</button>`).join('')}</div>
    <div class="tw"><table><thead><tr><th>SKU</th><th>${esc(t('part'))}</th><th>${esc(t('stock'))}</th><th class="num">${esc(t('min'))}</th><th class="num">${esc(t('avgCost'))}</th><th>${esc(t('supplier'))}</th><th class="noprint"></th></tr></thead><tbody>
    ${list.map((p) => `<tr><td dir="ltr">${esc(p.sku)}</td><td>${esc(nm(p))}</td><td><div class="row"><b>${esc(nf(p.stock))}</b>${p.stock < p.min ? pill(p.stock === 0 ? 'bad' : 'off', t(p.stock === 0 ? 'out' : 'low')) : ''}</div>${meter(Math.min(1, p.stock / Math.max(1, p.min * 2)), p.stock < p.min ? 'bad' : '')}</td><td class="num">${esc(nf(p.min))}</td><td class="num">${esc(money(p.cost))}</td><td>${esc(p.supplier)}</td><td class="noprint"><div class="acts1"><button class="btn sm" data-act="receive" data-id="${p.id}">${esc(t('b.receive'))}</button>${canManage() ? `<button class="btn sm" data-act="adjust" data-id="${p.id}">${esc(t('b.adjust'))}</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>`;
  },
  drivers() {
    const d = D();
    return `<div class="bar"><h1>${esc(t('nav.drivers'))}</h1></div>
    <div class="tw"><table><thead><tr><th>${esc(t('driver'))}</th><th>${esc(t('phone'))}</th><th>${esc(t('licence'))}</th><th>${esc(t('vehicle'))}</th><th class="noprint"></th></tr></thead><tbody>
    ${d.drivers.map((x) => { const v = d.vehicles.find((y) => y.driverId === x.id && y.status !== 'retired'); const days = L.diffDays(d.today, x.licenseExpiry);
      return `<tr><td><b>${esc(nm(x))}</b></td><td dir="ltr">${esc(x.phone)}</td><td>${pill(days < 0 ? 'bad' : days <= 45 ? 'off' : 'gray', dt(x.licenseExpiry))}${days < 0 ? ' ' + pill('bad', t('expired')) : ''}</td><td>${v ? `${plateTag(v)} <small class="muted">${esc(v.make)} ${esc(v.model)}</small>` : `<span class="muted">${esc(t('noVehicle'))}</span>`}</td><td class="noprint">${v ? `<button class="btn sm" data-act="vehicle" data-id="${v.id}">${esc(t('b.open'))}</button>` : `<button class="btn sm" data-act="assignfor" data-id="${x.id}">${esc(t('b.assign'))}</button>`}</td></tr>`; }).join('')}</tbody></table></div>`;
  },
  fuel() {
    const d = D(); const rows = d.vehicles.filter((v) => v.status !== 'retired').map((v) => {
      const fl = d.fuel.filter((f) => f.vehicleId === v.id).sort((a, b) => a.km - b.km); const l = fl.reduce((a, f) => a + f.liters10, 0) / 10, c = fl.reduce((a, f) => a + f.cost, 0);
      const dist = fl.length > 1 ? fl[fl.length - 1].km - fl[0].km : 0; const lit = fl.length > 1 ? (fl.slice(1).reduce((a, f) => a + f.liters10, 0) / 10) : 0;
      return { v, l, c, econ: dist > 0 ? (lit / dist) * 100 : 0, n: fl.length };
    });
    const recent = [...d.fuel].sort((a, b) => b.date.localeCompare(a.date) || b.km - a.km).slice(0, 14);
    return `<div class="bar"><h1>${esc(t('nav.fuel'))}</h1><span class="sp"></span>${canManage() ? `<button class="btn" data-act="csv" data-k="fuel">${esc(t('b.csv'))}</button>` : ''}<button class="btn" data-act="newreading">${esc(t('b.logOdo'))}</button><button class="btn pri" data-act="newfuel">${esc(t('b.logFuel'))}</button></div>
    <div class="grid two"><section class="card"><h2>${esc(t('economy'))}</h2><p class="muted small">${esc(t('economyNote'))}</p><div class="tw"><table><thead><tr><th>${esc(t('vehicle'))}</th><th class="num">${esc(t('litres'))}</th><th class="num">${esc(t('cost'))}</th><th class="num">${esc(t('l100'))}</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${plateTag(x.v)}</td><td class="num">${esc(nf(x.l))}</td><td class="num">${esc(money(x.c))}</td><td class="num">${x.econ ? esc(nf(x.econ, 1)) : '-'}</td></tr>`).join('')}</tbody></table></div></section>
    <section class="card"><h2>${esc(t('recentFuel'))}</h2><div class="tw"><table><thead><tr><th>${esc(t('date'))}</th><th>${esc(t('vehicle'))}</th><th class="num">${esc(t('litres'))}</th><th class="num">${esc(t('cost'))}</th><th class="num">${esc(t('odometer'))}</th></tr></thead><tbody>${recent.map((f) => `<tr><td>${esc(dt(f.date))}</td><td>${plateTag(vehOf(f.vehicleId))}</td><td class="num">${esc(nf(f.liters10 / 10, 1))}</td><td class="num">${esc(money(f.cost))}</td><td class="num">${esc(nf(f.km))}</td></tr>`).join('')}</tbody></table></div></section></div>`;
  },
  reports() {
    const r = D().reports; const maxK = Math.max(1, ...Object.values(r.kinds)); const maxP = Math.max(1, ...r.topParts.map((x) => x.cost));
    return `<div class="bar"><h1>${esc(t('nav.reports'))}</h1><span class="sp"></span><button class="btn" data-act="csv" data-k="costs">${esc(t('b.csvCosts'))}</button><button class="btn" data-act="csv" data-k="orders">${esc(t('b.csvOrders'))}</button></div>
    <div class="grid kpis">${kpi(pct(r.availability), t('k.availability'), r.availability >= 0.9 ? 'good' : 'warn')}${kpi(pct(r.compliance), t('k.compliance'), r.compliance >= 0.9 ? 'good' : 'warn', `${nf(r.overdue)} ${t('k.overdueItems')}`)}${kpi(pct(r.preventive), t('k.preventive'), r.preventive >= 0.7 ? 'good' : 'warn', t('k.preventiveSub'))}${kpi(money(r.avgJob), t('k.avgJob'), '', t('k.last180'))}${kpi(nf(r.downDays), t('k.downDays'), '', t('k.last180'))}</div>
    <div class="grid two" style="margin-top:1rem"><section class="card"><h2>${esc(t('chartMaint'))}</h2>${bars(r.months, r.maint)}</section><section class="card"><h2>${esc(t('chartFuel'))}</h2>${bars(r.months, r.fuel)}</section>
    <section class="card"><h2>${esc(t('byKind'))}</h2>${Object.entries(r.kinds).sort((a, b) => b[1] - a[1]).map(([k, c]) => `<div class="agrow"><span>${esc(t('ok.' + k))}</span>${meter(c / maxK)}<b>${esc(money(c))}</b></div>`).join('') || empty()}</section>
    <section class="card"><h2>${esc(t('topParts'))}</h2>${r.topParts.map((x) => `<div class="agrow"><span>${esc(nm(partOf(x.partId)))}</span>${meter(x.cost / maxP)}<b>${esc(money(x.cost))}</b></div>`).join('') || empty()}</section></div>
    <section class="card" style="margin-top:1rem"><h2>${esc(t('byVehicle'))}</h2><p class="muted small">${esc(t('byVehicleNote'))}</p><div class="tw"><table><thead><tr><th>${esc(t('vehicle'))}</th><th class="num">${esc(t('maint'))}</th><th class="num">${esc(t('fuelC'))}</th><th class="num">${esc(t('kmDriven'))}</th><th class="num">${esc(t('perKmH'))}</th><th class="num">${esc(t('downH'))}</th><th class="num">${esc(t('jobs'))}</th><th class="num">${esc(t('unplanned'))}</th></tr></thead><tbody>${r.vehicles.map((x) => `<tr class="click" data-act="vehicle" data-id="${x.vehicleId}"><td>${plateTag(vehOf(x.vehicleId))} <small class="muted">${esc(vehOf(x.vehicleId).make)} ${esc(vehOf(x.vehicleId).model)}</small></td><td class="num">${esc(money(x.maint))}</td><td class="num">${esc(money(x.fuel))}</td><td class="num">${esc(nf(x.km))}</td><td class="num">${x.perKm ? esc(money(x.perKm)) : '-'}</td><td class="num">${esc(nf(x.down))}</td><td class="num">${esc(nf(x.jobs))}</td><td class="num">${esc(nf(x.unplanned))}</td></tr>`).join('')}</tbody></table></div></section>`;
  },
  audit() {
    const a = D().audit || [];
    return `<div class="bar"><h1>${esc(t('nav.audit'))}</h1></div>${a.length ? `<div class="tw"><table><thead><tr><th>${esc(t('when'))}</th><th>${esc(t('user'))}</th><th>${esc(t('action'))}</th><th>${esc(t('detail'))}</th></tr></thead><tbody>${a.map((x) => `<tr><td>${esc(new Date(x.ts).toLocaleString(ar() ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' }))}</td><td>${esc(x.name)}</td><td>${esc(x.action)}</td><td>${esc(x.detail)}</td></tr>`).join('')}</tbody></table></div>` : empty(t('auditEmpty'))}`;
  },
  home() {
    const d = D(); const v = d.vehicles.find((x) => x.status !== 'retired'); const dr = d.drivers[0];
    if (!v) return `<div class="bar"><h1>${esc(t('nav.home'))}</h1></div><div class="card">${empty(t('noVehicleYours'))}</div>`;
    const its = d.schedules.filter((s) => s.vehicleId === v.id); const open = d.orders.filter((o) => o.vehicleId === v.id && L.isOpenStatus(o.status));
    return `<div class="bar"><h1>${esc(t('hello'))} ${esc(nm(dr))}</h1><span class="sp"></span><button class="btn" data-act="newreading" data-v="${v.id}">${esc(t('b.logOdo'))}</button><button class="btn" data-act="newfuel" data-v="${v.id}">${esc(t('b.logFuel'))}</button><button class="btn pri" data-act="newissue" data-v="${v.id}">${esc(t('b.reportIssue'))}</button></div>
    <section class="card hero"><div class="row"><h2>${plateTag(v)} ${esc(v.make)} ${esc(v.model)}</h2><span class="sp"></span>${vsPill(v)}</div><div class="det"><div><span>${esc(t('odometer'))}</span><b>${esc(km(v.odo))}</b></div><div><span>${esc(t('lastReading'))}</span><b>${esc(dt(v.odoDate))}</b></div><div><span>${esc(t('avgDaily'))}</span><b>${esc(km(v.kmPerDay))}</b></div><div><span>${esc(t('regExp'))}</span><b>${esc(dt(v.regExpiry))}</b></div><div><span>${esc(t('insExp'))}</span><b>${esc(dt(v.insExpiry))}</b></div><div><span>${esc(t('licence'))}</span><b>${esc(dt(dr.licenseExpiry))}</b></div></div></section>
    ${open.length ? `<div class="notice">${esc(t('inShop'))}: ${open.map((o) => esc(o.no + ' · ' + o.title + ' · ' + t('os.' + o.status))).join('; ')}</div>` : ''}
    <div class="grid two" style="margin-top:1rem"><section class="card"><h2>${esc(t('yourService'))}</h2>${its.map((it) => `<div class="mrow"><div><b>${esc(planName(it.planId))}</b><div class="small muted">${esc(km(it.nextKm))} · ${esc(dt(it.due))}</div></div><div class="row">${left(it)}${stPill(it.state)}</div></div>`).join('')}</section>
    <section class="card"><h2>${esc(t('needsAttention'))}</h2>${d.reminders.length ? d.reminders.map((x) => remRow(x, false)).join('') : empty(t('allClear'))}</section></div>`;
  },
  history() {
    const d = D(); const v = d.vehicles.find((x) => x.status !== 'retired') || d.vehicles[0];
    if (!v) return empty();
    const ords = d.orders.filter((o) => o.vehicleId === v.id).sort((a, b) => (b.completedAt || b.openedAt).localeCompare(a.completedAt || a.openedAt)).slice(0, 12);
    return `<div class="bar"><h1>${esc(t('nav.history'))}</h1></div><div class="grid two"><section class="card"><h2>${esc(t('workDone'))}</h2>${ords.map((o) => orderLine(o, false)).join('') || empty()}</section>
    <section class="card"><h2>${esc(t('myIssues'))}</h2>${d.issues.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10).map((i) => `<div class="mrow"><div><b>${esc(i.title)}</b><div class="small muted">${esc(dt(i.date))}${i.reason ? ' · ' + esc(i.reason) : ''}</div></div>${pill(i.status === 'new' ? 'off' : i.status === 'converted' ? '' : 'gray', t('is.' + i.status))}</div>`).join('') || empty()}</section>
    <section class="card"><h2>${esc(t('readings'))}</h2>${v.readings.map((r) => `<div class="mrow"><span>${esc(dt(r.date))}</span><b>${esc(km(r.km))}</b></div>`).join('') || empty()}</section>
    <section class="card"><h2>${esc(t('recentFuel'))}</h2>${d.fuel.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((f) => `<div class="mrow"><span>${esc(dt(f.date))}</span><span>${esc(nf(f.liters10 / 10, 1))} ${esc(t('litresU'))}</span><b>${esc(money(f.cost))}</b></div>`).join('') || empty()}</section></div>`;
  },
};

// ---------- modals ----------
const modal = (title, body, wide) => `<div class="modal-bg" data-act="close"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}" data-act="stop"><div class="bar"><h2>${esc(title)}</h2><span class="sp"></span><button class="btn sm" data-act="close" aria-label="${esc(t('b.close'))}">✕</button></div>${body}</div></div>`;
const vOpts = (all = true) => D().vehicles.filter((v) => v.status !== 'retired').map((v) => [v.id, vlabel(v)]);
function vehicleModal(id) {
  const v = vehOf(id); if (!v) return '';
  const d = D(); const its = d.schedules.filter((s) => s.vehicleId === id); const ords = d.orders.filter((o) => o.vehicleId === id).sort((a, b) => (b.completedAt || b.openedAt).localeCompare(a.completedAt || a.openedAt)).slice(0, 6);
  const cost = d.reports?.vehicles.find((x) => x.vehicleId === id);
  return modal(vlabel(v), `<div class="row">${vsPill(v)}${v.driverId ? pill('gray', nm(drvOf(v.driverId))) : pill('gray', t('noDriver'))}</div>
  <div class="det"><div><span>${esc(t('odometer'))}</span><b>${esc(km(v.odo))}</b></div><div><span>${esc(t('avgDaily'))}</span><b>${esc(km(v.kmPerDay))}</b></div><div><span>${esc(t('type'))}</span><b>${esc(t('vt.' + v.type))} · ${esc(t('fu.' + v.fuel))}</b></div><div><span>${esc(t('regExp'))}</span>${docPill(v.regExpiry)}</div><div><span>${esc(t('insExp'))}</span>${docPill(v.insExpiry)}</div>${cost ? `<div><span>${esc(t('perKmH'))}</span><b>${cost.perKm ? esc(money(cost.perKm)) : '-'}</b></div>` : ''}</div>
  ${v.status === 'retired' ? `<div class="notice">${esc(t('retiredOn'))} ${esc(dt(v.retiredAt))}: ${esc(v.retireReason)}</div>` : ''}
  <div class="acts noprint">${v.status !== 'retired' ? `<button class="btn" data-act="newreading" data-v="${id}">${esc(t('b.logOdo'))}</button><button class="btn" data-act="newissue" data-v="${id}">${esc(t('b.reportIssue'))}</button>` : ''}${v.status !== 'retired' && canWork() ? `<button class="btn pri" data-act="neworder" data-v="${id}">${esc(t('b.newOrder'))}</button>` : ''}${canManage() && v.status !== 'retired' ? `<button class="btn" data-act="assignfor" data-v="${id}">${esc(t('b.assign'))}</button><button class="btn" data-act="docs" data-v="${id}">${esc(t('b.renewDocs'))}</button>` : ''}${role() === 'owner' && v.status !== 'retired' ? `<button class="btn danger" data-act="retire" data-v="${id}">${esc(t('b.retire'))}</button>` : ''}</div>
  <h3>${esc(t('serviceSchedule'))}</h3><div class="tw"><table><thead><tr><th>${esc(t('service'))}</th><th>${esc(t('lastDone'))}</th><th>${esc(t('nextDue'))}</th><th>${esc(t('left'))}</th><th></th></tr></thead><tbody>${its.map((it) => `<tr><td>${esc(planName(it.planId))}</td><td>${esc(km(it.lastKm))} · ${esc(dt(it.lastDate))}</td><td>${esc(km(it.nextKm))} · ${esc(dt(it.due))}</td><td>${left(it)}</td><td>${stPill(it.state)}</td></tr>`).join('')}</tbody></table></div>
  <h3 style="margin-top:1rem">${esc(t('recentOrders'))}</h3>${ords.map((o) => orderLine(o, !isDriver())).join('') || empty()}`, true);
}
function orderModal(id) {
  const o = D().orders.find((x) => x.id === id); if (!o) return '';
  const v = vehOf(o.vehicleId); const editable = canWork() && (o.status === 'progress' || o.status === 'waiting'); const priv = !isDriver();
  const parts = o.partsUsed; const pc = parts.reduce((a, l) => a + l.qty * (l.unitCost || 0), 0), lc = Math.round(((o.hours10 || 0) * (o.rate || 0)) / 10);
  const lim = role() === 'workshop' ? D().settings.workshopLimit : role() === 'manager' ? D().settings.managerLimit : Infinity;
  return modal(`${o.no} · ${o.title}`, `<div class="row">${osPill(o)}${prPill(o.priority)}${pill('gray', t('ok.' + o.kind))}${plateTag(v)}<span class="muted">${esc(v.make)} ${esc(v.model)}</span></div>
  <div class="det"><div><span>${esc(t('opened'))}</span><b>${esc(dt(o.openedAt))}</b></div>${o.planned ? `<div><span>${esc(t('planned'))}</span><b>${esc(dt(o.planned))}</b></div>` : ''}${o.startedAt ? `<div><span>${esc(t('started'))}</span><b>${esc(dt(o.startedAt))}</b></div>` : ''}${o.completedAt ? `<div><span>${esc(t('closed'))}</span><b>${esc(dt(o.completedAt))}</b></div>` : ''}${o.tech ? `<div><span>${esc(t('technician'))}</span><b>${esc(nm(o.tech))}</b></div>` : ''}${o.odo != null ? `<div><span>${esc(t('odometer'))}</span><b>${esc(km(o.odo))}</b></div>` : ''}${o.status === 'done' ? `<div><span>${esc(t('downtime'))}</span><b>${esc(nf(o.downDays))} ${esc(t('days'))}</b></div>` : ''}${priv && o.estimate ? `<div><span>${esc(t('estimate'))}</span><b>${esc(money(o.estimate))}</b></div>` : ''}</div>
  ${o.desc ? `<p>${esc(o.desc)}</p>` : ''}${o.planIds.length ? `<p class="small muted">${esc(t('covers'))}: ${o.planIds.map((p) => { const sc = D().schedules.find((x) => x.id === p); return esc(sc ? planName(sc.planId) : p); }).join(', ')}</p>` : ''}${o.waitReason ? `<div class="notice">${esc(o.waitReason)}</div>` : ''}${o.status === 'cancelled' && o.note ? `<div class="notice">${esc(o.note)}</div>` : ''}
  ${priv ? `<h3>${esc(t('partsUsed'))}</h3>` : ''}${!priv ? '' : parts.length ? `<div class="tw"><table><tbody>${parts.map((l) => `<tr><td>${esc(nm(partOf(l.partId)))}</td><td class="num">× ${esc(nf(l.qty))}</td>${priv ? `<td class="num">${esc(money(l.qty * l.unitCost))}</td>` : ''}<td class="num">${editable ? `<button class="btn sm" data-act="rmpart" data-id="${o.id}" data-p="${l.partId}">✕</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : empty(t('noParts'))}
  ${editable ? `<div class="row" style="margin:.6rem 0">${sel('op-p', [['', t('choosePart')], ...D().parts.map((p) => [p.id, `${nm(p)} (${p.stock})`])], '')}<input id="op-q" class="qi" inputmode="numeric" value="1" aria-label="${esc(t('qty'))}"><button class="btn sm" data-act="addpart" data-id="${o.id}">${esc(t('b.addPart'))}</button></div>` : ''}
  <h3>${esc(t('labourOutside'))}</h3><dl class="dl"><dt>${esc(t('hours'))}</dt><dd>${editable ? `<input id="ol-h" class="qi" inputmode="decimal" value="${esc(nf((o.hours10 || 0) / 10, 1))}" dir="ltr" style="width:5rem"> <button class="btn sm" data-act="savelabor" data-id="${o.id}">${esc(t('b.save'))}</button>` : esc(nf((o.hours10 || 0) / 10, 1))}${priv && o.rate ? ` <small class="muted">× ${esc(money(o.rate))}/${esc(t('hourU'))}</small>` : ''}</dd><dt>${esc(t('outside'))}</dt><dd>${editable ? `<input id="ov-n" placeholder="${esc(t('vendor'))}" value="${esc(o.vendor)}"> <input id="ov-c" class="qi" inputmode="decimal" placeholder="${esc(t('cost'))}" value="${o.vendorCost ? o.vendorCost / 100 : ''}" dir="ltr" style="width:6rem"> <button class="btn sm" data-act="savevendor" data-id="${o.id}">${esc(t('b.save'))}</button>` : esc(o.vendor ? `${o.vendor}${priv ? ' · ' + money(o.vendorCost) : ''}` : '-')}</dd></dl>
  ${priv ? `<div class="quote"><div class="r"><span>${esc(t('partsC'))}</span><span>${esc(money(pc))}</span></div><div class="r"><span>${esc(t('labourC'))}</span><span>${esc(money(lc))}</span></div><div class="r"><span>${esc(t('outside'))}</span><span>${esc(money(o.vendorCost || 0))}</span></div><div class="r tot"><span>${esc(t('total'))}</span><span>${esc(money(pc + lc + (o.vendorCost || 0)))}</span></div>${editable && pc + lc + (o.vendorCost || 0) > lim ? `<div class="small neg">${esc(t('overLimit'))}</div>` : ''}</div>` : ''}
  ${o.note && o.status === 'done' ? `<p class="muted">${esc(o.note)}</p>` : ''}
  <div class="acts noprint">
  ${o.status === 'awaiting' && role() === 'owner' ? `<button class="btn pri" data-act="approve" data-id="${o.id}">${esc(t('b.approve'))}</button>` : ''}${o.status === 'open' && canWork() ? `<button class="btn pri" data-act="start" data-id="${o.id}">${esc(t('b.start'))}</button>` : ''}
  ${o.status === 'progress' && canWork() ? `<button class="btn" data-act="wait" data-id="${o.id}">${esc(t('b.waitParts'))}</button>` : ''}${o.status === 'waiting' && canWork() ? `<button class="btn" data-act="resume" data-id="${o.id}">${esc(t('b.resume'))}</button>` : ''}
  ${o.status === 'progress' && canWork() ? `<span class="row"><input id="oc-k" inputmode="numeric" class="qi" style="width:7rem" dir="ltr" placeholder="${esc(t('odometer'))}" value="${v.odo}" aria-label="${esc(t('odometer'))}"><input id="oc-n" placeholder="${esc(t('note'))}" aria-label="${esc(t('note'))}"><button class="btn pri" data-act="complete" data-id="${o.id}">${esc(t('b.complete'))}</button></span>` : ''}
  ${canManage() && L.isOpenStatus(o.status) ? `<button class="btn danger" data-act="cancelorder" data-id="${o.id}">${esc(t('b.cancelOrder'))}</button>` : ''}</div>`, true);
}
function newOrderModal() {
  const m = S.mo; const vs = vOpts(); const vid = m.vid || vs[0]?.[0]; const kind = m.kind || (canManage() ? 'scheduled' : 'repair'); const v = vid && vehOf(vid);
  const its = v ? D().schedules.filter((s) => s.vehicleId === vid && !s.orderId).sort((a, b) => ({ overdue: 0, soon: 1, ok: 2 })[a.state] - ({ overdue: 0, soon: 1, ok: 2 })[b.state]) : [];
  const kinds = canManage() ? L.KINDS : ['repair', 'inspection'];
  return modal(t('ttl.newOrder'), `${field('no-v', t('vehicle'), sel('no-v', vs, vid))}${field('no-k', t('type'), sel('no-k', kinds.map((k) => [k, t('ok.' + k)]), kind))}
  ${kind === 'scheduled' ? `<div class="f"><label>${esc(t('services'))}</label>${its.map((s) => `<label class="chk"><input type="checkbox" class="no-sc" value="${s.id}"${(m.sc || []).includes(s.id) || (!m.sc && s.state === 'overdue') ? ' checked' : ''}> ${esc(planName(s.planId))} ${stPill(s.state)}</label>`).join('') || empty(t('noServices'))}</div>` : `${field('no-t', t('title'), '<input id="no-t" maxlength="80">')}${field('no-d', t('desc'), '<textarea id="no-d" rows="3" maxlength="400"></textarea>')}`}
  ${field('no-p', t('priority'), sel('no-p', L.PRIORITIES.map((p) => [p, t('pr.' + p)]), 'normal'))}${field('no-e', t('estimate'), '<input id="no-e" inputmode="decimal" dir="ltr">', t('h.estimate'))}${field('no-pl', t('planned'), `<input id="no-pl" type="date" min="${D().today}" dir="ltr">`)}
  <div class="acts"><button class="btn" data-act="close">${esc(t('b.cancel'))}</button><button class="btn pri" data-act="saveorder">${esc(t('b.save'))}</button></div>`);
}
const simple = (title, body, saveAct, id) => modal(title, `${body}<div class="acts"><button class="btn" data-act="close">${esc(t('b.cancel'))}</button><button class="btn pri" data-act="${saveAct}"${id ? ` data-id="${id}"` : ''}>${esc(t('b.save'))}</button></div>`);
function modalHtml() {
  const m = S.modal; if (!m) return '';
  if (m.type === 'vehicle') return vehicleModal(m.id);
  if (m.type === 'order') return orderModal(m.id);
  if (m.type === 'neworder') return newOrderModal();
  if (m.type === 'newvehicle') return simple(t('ttl.newVehicle'), `${field('nv-p', t('plate'), '<input id="nv-p" dir="ltr" maxlength="9" placeholder="ABC 1234">', t('h.plate'))}${field('nv-m', t('make'), '<input id="nv-m" maxlength="30">')}${field('nv-d', t('model'), '<input id="nv-d" maxlength="30">')}${field('nv-y', t('year'), `<input id="nv-y" inputmode="numeric" dir="ltr" value="${D().today.slice(0, 4)}">`)}${field('nv-t', t('type'), sel('nv-t', L.VTYPES.map((x) => [x, t('vt.' + x)]), 'van'))}${field('nv-f', t('fuel'), sel('nv-f', L.FUELS.map((x) => [x, t('fu.' + x)]), 'diesel'))}${field('nv-o', t('odometer'), '<input id="nv-o" inputmode="numeric" dir="ltr" value="0">')}${field('nv-r', t('regExp'), `<input id="nv-r" type="date" dir="ltr" value="${L.addDays(D().today, 365)}">`)}${field('nv-i', t('insExp'), `<input id="nv-i" type="date" dir="ltr" value="${L.addDays(D().today, 365)}">`)}`, 'savevehicle');
  if (m.type === 'reading') { const v = vehOf(m.vid || S.mo.vid || D().vehicles.find((x) => x.status !== 'retired')?.id); return simple(t('ttl.reading'), `${isDriver() ? `<p>${plateTag(v)}</p>` : field('rd-v', t('vehicle'), sel('rd-v', vOpts(), v?.id))}${field('rd-k', t('odometer'), `<input id="rd-k" inputmode="numeric" dir="ltr" value="${v ? v.odo : ''}">`, `${t('h.lastReading')}: ${v ? km(v.odo) : ''}`)}`, 'savereading'); }
  if (m.type === 'fuel') { const v = vehOf(m.vid || D().vehicles.find((x) => x.status !== 'retired')?.id); return simple(t('ttl.fuel'), `${isDriver() ? `<p>${plateTag(v)}</p>` : field('fl-v', t('vehicle'), sel('fl-v', vOpts(), v?.id))}${field('fl-l', t('litres'), '<input id="fl-l" inputmode="decimal" dir="ltr">')}${field('fl-c', t('totalCost'), '<input id="fl-c" inputmode="decimal" dir="ltr">')}${field('fl-k', t('odometer'), `<input id="fl-k" inputmode="numeric" dir="ltr" value="${v ? v.odo : ''}">`)}`, 'savefuel'); }
  if (m.type === 'issue') { const v = vehOf(m.vid || D().vehicles.find((x) => x.status !== 'retired')?.id); return simple(t('ttl.issue'), `${isDriver() ? `<p>${plateTag(v)}</p>` : field('is-v', t('vehicle'), sel('is-v', vOpts(), v?.id))}${field('is-t', t('title'), '<input id="is-t" maxlength="80">')}${field('is-d', t('desc'), '<textarea id="is-d" rows="3" maxlength="400"></textarea>')}${field('is-p', t('priority'), sel('is-p', L.PRIORITIES.map((p) => [p, t('pr.' + p)]), 'normal'))}`, 'saveissue'); }
  if (m.type === 'assign') { const v = vehOf(m.vid); const cur = v?.driverId || ''; const dr = D().drivers; return simple(t('ttl.assign'), `${v ? `<p>${plateTag(v)} ${esc(v.make)} ${esc(v.model)}</p>` : field('as-v', t('vehicle'), sel('as-v', vOpts(), ''))}${field('as-d', t('driver'), sel('as-d', [['', t('noDriver')], ...dr.map((x) => [x.id, nm(x)])], m.did || cur))}`, 'saveassign'); }
  if (m.type === 'docs') { const v = vehOf(m.vid); return simple(t('ttl.docs'), `<p>${plateTag(v)}</p>${field('dc-r', t('regExp'), `<input id="dc-r" type="date" dir="ltr" value="${v.regExpiry}">`)}${field('dc-i', t('insExp'), `<input id="dc-i" type="date" dir="ltr" value="${v.insExpiry}">`)}`, 'savedocs'); }
  if (m.type === 'receive') { const p = partOf(m.id); return simple(t('ttl.receive') + ': ' + nm(p), `${field('rc-q', t('qty'), '<input id="rc-q" inputmode="numeric" dir="ltr">')}${field('rc-c', t('unitCost'), `<input id="rc-c" inputmode="decimal" dir="ltr" value="${p.cost / 100}">`, `${t('avgCost')}: ${money(p.cost)}`)}`, 'savereceive', p.id); }
  if (m.type === 'adjust') { const p = partOf(m.id); return simple(t('ttl.adjust') + ': ' + nm(p), `${field('aj-n', t('countNow'), `<input id="aj-n" inputmode="numeric" dir="ltr" value="${p.stock}">`)}${field('aj-r', t('reason'), '<input id="aj-r" maxlength="80">')}`, 'saveadjust', p.id); }
  if (m.type === 'newpart') return simple(t('ttl.newPart'), `${field('np-s', 'SKU', '<input id="np-s" dir="ltr" maxlength="14">')}${field('np-n', t('name'), '<input id="np-n" maxlength="50">')}${field('np-a', t('nameAr'), '<input id="np-a" maxlength="50">')}${field('np-c', t('unitCost'), '<input id="np-c" inputmode="decimal" dir="ltr">')}${field('np-m', t('min'), '<input id="np-m" inputmode="numeric" dir="ltr" value="5">')}${field('np-q', t('stock'), '<input id="np-q" inputmode="numeric" dir="ltr" value="0">')}${field('np-v', t('supplier'), '<input id="np-v" maxlength="50">')}`, 'savepart');
  if (m.type === 'plan') { const p = planOf(m.id); return simple(nm(p), `${field('pl-k', t('everyKm'), `<input id="pl-k" inputmode="numeric" dir="ltr" value="${p.km}">`)}${field('pl-m', t('everyMonths'), `<input id="pl-m" inputmode="numeric" dir="ltr" value="${p.months}">`)}`, 'saveplan', p.id); }
  return '';
}
function render() {
  document.documentElement.lang = S.lang; document.documentElement.dir = T[S.lang].dir; document.title = t('appName') + ' | ' + t('appSub');
  const app = $('#app');
  if (!S.token || !S.data) { app.innerHTML = loginView(); $('#pin')?.focus(); return; }
  const r = route(); const nav = NAV[role()] || []; if (!nav.includes(r)) { location.hash = '#/' + nav[0]; return; }
  const ae = document.activeElement, keep = ae && ['vq'].includes(ae.id) ? { id: ae.id, pos: ae.selectionStart } : null;
  app.innerHTML = shell(PAGES[r]()) + modalHtml();
  if (keep) { const el = $('#' + keep.id); if (el) { el.focus(); try { el.setSelectionRange(keep.pos, keep.pos); } catch {} } }
}

// ---------- actions ----------
const open = (m) => { S.modal = m; render(); };
const done = (r) => { if (r) { S.modal = null; render(); } return r; };
const keepForm = () => { const f = {}; document.querySelectorAll('.modal input[id],.modal textarea[id],.modal select[id]').forEach((e) => (f[e.id] = e.value)); return f; };
const restoreForm = (f) => { for (const k in f) { const e = $('#' + k); if (e && e.tagName !== 'SELECT') e.value = f[k]; } };
const H = {
  pin: (d) => login(d.pin), lang: () => { S.lang = S.lang === 'en' ? 'ar' : 'en'; LS.set('lang', S.lang); render(); }, logout, close: () => { S.modal = null; render(); }, stop: () => {},
  reset: async () => { if (!confirm(t('confirmReset'))) return; if (await act({ type: 'reset' }, t('msgs.saved'))) render(); },
  vf: (d) => { S.vf = d.f; render(); }, sf: (d) => { S.sf = d.f; render(); }, pf: (d) => { S.pf = d.f; render(); },
  vehicle: (d) => open({ type: 'vehicle', id: d.id }), order: (d) => open({ type: 'order', id: d.id }),
  newvehicle: () => open({ type: 'newvehicle' }),
  savevehicle: async () => { done(await act({ type: 'addVehicle', key: S.mo.key || (S.mo.key = rid()), plate: val('nv-p'), make: val('nv-m'), model: val('nv-d'), year: toInt(val('nv-y')), vtype: val('nv-t'), fuel: val('nv-f'), odo: toInt(val('nv-o')), regExpiry: val('nv-r'), insExpiry: val('nv-i') }, t('msgs.vehicleOk'))); S.mo = {}; },
  neworder: (d) => { S.mo = { vid: d.v, kind: d.sc ? 'scheduled' : null, sc: d.sc ? [d.sc] : null }; open({ type: 'neworder' }); },
  saveorder: async () => {
    const kind = val('no-k'); const planIds = [...document.querySelectorAll('.no-sc:checked')].map((e) => e.value);
    const op = { type: 'createOrder', key: rid(), vehicleId: val('no-v'), kind, priority: val('no-p'), planIds: kind === 'scheduled' ? planIds : [], estimate: toCents(val('no-e')), planned: val('no-pl') || undefined };
    if (kind !== 'scheduled') { op.title = val('no-t'); op.desc = val('no-d'); }
    const r = await act(op, t('msgs.orderOk')); if (r?.orderId) { S.modal = { type: 'order', id: r.orderId }; render(); }
  },
  start: async (d) => { if (await act({ type: 'startOrder', orderId: d.id }, t('msgs.started'))) render(); },
  approve: async (d) => { if (await act({ type: 'approveOrder', orderId: d.id }, t('msgs.approved'))) render(); },
  addpart: async (d) => { const p = val('op-p'); if (!p) return toast(t('choosePart'), true); if (await act({ type: 'addPart', orderId: d.id, partId: p, qty: toInt(val('op-q')) }, t('msgs.saved'))) render(); },
  rmpart: async (d) => { if (await act({ type: 'removePart', orderId: d.id, partId: d.p }, t('msgs.saved'))) render(); },
  savelabor: async (d) => { if (await act({ type: 'setLabor', orderId: d.id, hours10: toTenths(val('ol-h')) }, t('msgs.saved'))) render(); },
  savevendor: async (d) => { if (await act({ type: 'setVendor', orderId: d.id, vendor: val('ov-n'), cost: toCents(val('ov-c')) }, t('msgs.saved'))) render(); },
  wait: async (d) => { const r = prompt(t('waitReason'), ar() ? 'في انتظار قطعة الغيار' : 'Waiting for parts'); if (r === null) return; if (await act({ type: 'setWaiting', orderId: d.id, on: true, reason: r }, t('msgs.saved'))) render(); },
  resume: async (d) => { if (await act({ type: 'setWaiting', orderId: d.id, on: false }, t('msgs.saved'))) render(); },
  complete: async (d) => { if (await act({ type: 'completeOrder', orderId: d.id, odo: toInt(val('oc-k')), note: val('oc-n') }, t('msgs.completed'))) render(); },
  cancelorder: async (d) => { const r = prompt(t('cancelReason'), ar() ? 'لم يعد مطلوبًا' : 'No longer needed'); if (r === null) return; if (await act({ type: 'cancelOrder', orderId: d.id, reason: r }, t('msgs.cancelled'))) { S.modal = null; render(); } },
  newreading: (d) => open({ type: 'reading', vid: d.v }),
  savereading: async () => { done(await act({ type: 'logReading', key: rid(), vehicleId: $('#rd-v') ? val('rd-v') : S.modal.vid || D().vehicles.find((x) => x.status !== 'retired').id, km: toInt(val('rd-k')) }, t('msgs.saved'))); },
  newfuel: (d) => open({ type: 'fuel', vid: d.v }),
  savefuel: async () => { done(await act({ type: 'logFuel', key: rid(), vehicleId: $('#fl-v') ? val('fl-v') : S.modal.vid || D().vehicles.find((x) => x.status !== 'retired').id, liters10: toTenths(val('fl-l')), cost: toCents(val('fl-c')), km: toInt(val('fl-k')) }, t('msgs.saved'))); },
  newissue: (d) => open({ type: 'issue', vid: d.v }),
  saveissue: async () => { done(await act({ type: 'reportIssue', key: rid(), vehicleId: $('#is-v') ? val('is-v') : S.modal.vid || D().vehicles.find((x) => x.status !== 'retired').id, title: val('is-t'), desc: val('is-d'), priority: val('is-p') }, t('msgs.issueOk'))); },
  convert: async (d) => { const r = await act({ type: 'convertIssue', issueId: d.id }, t('msgs.orderOk')); if (r?.orderId) { S.modal = { type: 'order', id: r.orderId }; render(); } },
  dismiss: async (d) => { const r = prompt(t('dismissReason'), ar() ? 'لا يحتاج إصلاحًا' : 'Not a fault'); if (r === null) return; if (await act({ type: 'dismissIssue', issueId: d.id, reason: r }, t('msgs.saved'))) render(); },
  assignfor: (d) => open({ type: 'assign', vid: d.v, did: d.id }),
  saveassign: async () => { done(await act({ type: 'assignDriver', vehicleId: $('#as-v') ? val('as-v') : S.modal.vid, driverId: val('as-d') || null }, t('msgs.saved'))); },
  docs: (d) => open({ type: 'docs', vid: d.v }),
  savedocs: async () => { done(await act({ type: 'updateDocs', vehicleId: S.modal.vid, regExpiry: val('dc-r'), insExpiry: val('dc-i') }, t('msgs.saved'))); },
  retire: async (d) => { const r = prompt(t('retireReason'), ar() ? 'بيعت' : 'Sold'); if (r === null) return; if (await act({ type: 'retireVehicle', vehicleId: d.v, reason: r }, t('msgs.saved'))) { S.modal = null; render(); } },
  receive: (d) => open({ type: 'receive', id: d.id }), savereceive: async (d) => { done(await act({ type: 'receiveParts', key: rid(), partId: d.id, qty: toInt(val('rc-q')), unitCost: toCents(val('rc-c')) }, t('msgs.saved'))); },
  adjust: (d) => open({ type: 'adjust', id: d.id }), saveadjust: async (d) => { done(await act({ type: 'adjustStock', partId: d.id, count: toInt(val('aj-n')), reason: val('aj-r') }, t('msgs.saved'))); },
  newpart: () => open({ type: 'newpart' }),
  savepart: async () => { done(await act({ type: 'newPart', key: rid(), sku: val('np-s'), name: val('np-n'), nameAr: val('np-a'), cost: toCents(val('np-c')), min: toInt(val('np-m')), stock: toInt(val('np-q')), supplier: val('np-v') }, t('msgs.saved'))); },
  plan: (d) => open({ type: 'plan', id: d.id }), saveplan: async (d) => { done(await act({ type: 'setPlan', planId: d.id, km: toInt(val('pl-k')), months: toInt(val('pl-m')) }, t('msgs.saved'))); },
  remind: (d, el) => { window.open(el.getAttribute('href'), '_blank', 'noopener'); act({ type: 'logReminder', key: d.key.replace(/^(\w+):(\w+)$/, '$1:$2') }, t('msgs.logged')).then(() => render()); },
  csv: (d) => {
    const v = D();
    if (d.k === 'orders') downloadCsv('work-orders.csv', [['Number', 'Vehicle', 'Type', 'Title', 'Status', 'Opened', 'Completed', 'Parts EGP', 'Labour EGP', 'Outside EGP', 'Total EGP', 'Downtime days'], ...v.orders.map((o) => [o.no, vehOf(o.vehicleId)?.plate, o.kind, o.title, o.status, o.openedAt, o.completedAt || '', o.partsUsed.reduce((a, l) => a + l.qty * l.unitCost, 0) / 100, Math.round(((o.hours10 || 0) * (o.rate || 0)) / 10) / 100, (o.vendorCost || 0) / 100, (o.total || 0) / 100, o.downDays || ''])]);
    if (d.k === 'service') downloadCsv('service-schedule.csv', [['Vehicle', 'Service', 'Last km', 'Last date', 'Next km', 'Due date', 'Km left', 'Status'], ...v.schedules.map((s) => [vehOf(s.vehicleId)?.plate, planOf(s.planId)?.name, s.lastKm, s.lastDate, s.nextKm, s.due, s.kmLeft, s.state])]);
    if (d.k === 'fuel') downloadCsv('fuel.csv', [['Date', 'Vehicle', 'Litres', 'Cost EGP', 'Odometer km'], ...v.fuel.map((f) => [f.date, vehOf(f.vehicleId)?.plate, f.liters10 / 10, f.cost / 100, f.km])]);
    if (d.k === 'costs') downloadCsv('cost-per-vehicle.csv', [['Vehicle', 'Maintenance EGP', 'Fuel EGP', 'Km driven', 'EGP per km', 'Downtime days', 'Jobs', 'Unplanned'], ...v.reports.vehicles.map((x) => [vehOf(x.vehicleId)?.plate, x.maint / 100, x.fuel / 100, x.km, x.perKm / 100, x.down, x.jobs, x.unplanned])]);
  },
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  if (el.dataset.act === 'close' && el.classList.contains('modal-bg') && e.target !== el) return;
  if (el.dataset.act === 'stop') return;
  const f = H[el.dataset.act]; if (!f) return;
  if ((el.tagName === 'TR' || el.classList.contains('ucard') || el.classList.contains('req') || el.classList.contains('click')) && e.target.closest('button,a,input,select,textarea')) { if (!e.target.closest('[data-act]') || e.target.closest('[data-act]') === el) return; }
  if (el.tagName !== 'A' || el.dataset.act === 'remind') e.preventDefault();
  f(el.dataset, el, e);
});
document.addEventListener('submit', (e) => { if (e.target.id === 'pinform') { e.preventDefault(); login(val('pin').trim()); } });
document.addEventListener('input', (e) => { if (e.target.id === 'vq') { S.vq = e.target.value; render(); } });
document.addEventListener('change', (e) => {
  const id = e.target.id;
  if (id === 'no-v' || id === 'no-k') { const f = keepForm(); S.mo.vid = val('no-v'); S.mo.kind = val('no-k'); S.mo.sc = null; render(); restoreForm(f); }
  else if (id === 'rd-v' || id === 'fl-v') { const v = vehOf(e.target.value); const k = $(id === 'rd-v' ? '#rd-k' : '#fl-k'); if (v && k) k.value = v.odo; }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.modal) { S.modal = null; render(); }
  if ((e.key === 'Enter' || e.key === ' ') && (e.target.classList?.contains('ucard') || e.target.classList?.contains('req') || e.target.classList?.contains('click'))) { e.preventDefault(); e.target.click(); }
});
window.addEventListener('hashchange', () => { S.modal = null; render(); });
(async function init() { if (S.token) await refresh(); if (S.err && !S.data) { S.token = null; } render(); })();
