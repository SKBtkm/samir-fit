/* ============================================================
   Samir Fit — приложение
   ============================================================ */
const tg = window.Telegram && window.Telegram.WebApp;
const TGU = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) || null;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Math.round(n).toLocaleString('ru-RU');
const fmt1 = n => (Math.round(n * 10) / 10).toLocaleString('ru-RU');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ver = v => { try { return !!(tg && tg.isVersionAtLeast && tg.isVersionAtLeast(v)); } catch (e) { return false; } };

/* ---------- даты ---------- */
const dkey = d => '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
const fromKey = k => new Date(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8));
const todayKey = () => dkey(new Date());
const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
const wdi = d => (d.getDay() + 6) % 7;
const weekStart = d => addDays(d, -wdi(d));
const DN = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const MG = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const MN = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
function dayLabel(k) {
  if (k === todayKey()) return 'Сегодня';
  if (k === dkey(addDays(new Date(), -1))) return 'Вчера';
  const d = fromKey(k); return `${d.getDate()} ${MG[d.getMonth()]}`;
}
const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const m = n % 10; return (n > 10 && n < 20) ? c : m > 1 && m < 5 ? b : m === 1 ? a : c; };

/* ---------- план (Миффлин — Сан Жеор) ---------- */
function calcPlan(p) {
  const bmr = 10 * p.w + 6.25 * p.h - 5 * p.age + (p.sex === 'm' ? 5 : -161);
  const act = {sit: 1.2, light: 1.375, mid: 1.55, high: 1.725}[p.act] || 1.375;
  const tdee = bmr * act;
  let kcal = p.goal === 'lose' ? tdee * 0.82 : p.goal === 'gain' ? tdee * 1.12 : tdee;
  kcal = Math.round(Math.max(kcal, p.sex === 'm' ? 1500 : 1200) / 10) * 10;
  const pr = Math.round(p.w * (p.goal === 'lose' ? 2 : p.goal === 'gain' ? 1.8 : 1.6));
  const fat = Math.round(Math.max(p.w * 0.9, kcal * 0.25 / 9));
  const carb = Math.max(Math.round((kcal - pr * 4 - fat * 9) / 4), 50);
  return {bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, p: pr, f: fat, c: carb,
    water: clamp(Math.round(p.w * 30 / 250), 6, 14), min: ({1: 20, 2: 30, 3: 45})[p.lvl] || 30};
}
let PLAN = null;
const plan = () => PLAN || (PLAN = calcPlan(DB.state.p));
const kg = () => (DB.state.p && DB.state.p.w) || 70;

/* ---------- дневник ---------- */
const emptyDay = () => ({f: [], w: 0, m: 0, k: 0, x: []});
const day = k => DB.state.d[k] || emptyDay();
const dayW = k => { if (!DB.state.d[k]) DB.state.d[k] = emptyDay(); const r = DB.state.d[k]; r.f = r.f || []; r.x = r.x || []; return r; };
const saveDay = k => DB.save('d' + k);
const eat = r => (r.f || []).reduce((a, x) => { a.k += x[3]; a.p += x[4]; a.f += x[5]; a.c += x[6]; return a; }, {k: 0, p: 0, f: 0, c: 0});
const ringP = k => { const r = day(k), pl = plan(); return [eat(r).k / pl.kcal, r.m / pl.min, r.w / pl.water]; };
const isActive = r => !!r && (r.m > 0 || (r.f && r.f.length > 0));
function streak() {
  let n = 0, d = new Date();
  if (!isActive(DB.state.d[dkey(d)])) d = addDays(d, -1);
  while (isActive(DB.state.d[dkey(d)])) { n++; d = addDays(d, -1); }
  return n;
}
function totals() {
  const t = {w: 0, m: 0, k: 0, food: 0, rings: false, water: false};
  const pl = plan();
  for (const k in DB.state.d) {
    const r = DB.state.d[k];
    t.w += (r.x || []).filter(x => x[0] === 'w').length; t.m += r.m || 0; t.k += r.k || 0;
    if (r.f && r.f.length) t.food++;
    if (r.w >= pl.water) t.water = true;
    if (eat(r).k >= pl.kcal * 0.9 && r.m >= pl.min && r.w >= pl.water) t.rings = true;
  }
  return t;
}
const lastWeight = () => DB.state.w.length ? DB.state.w[DB.state.w.length - 1][1] : kg();

/* ---------- расписание ---------- */
function progIdFor(date) {
  const p = DB.state.p; if (!p) return null;
  const days = TRAIN_DAYS[p.days] || TRAIN_DAYS[3];
  const pos = days.indexOf(wdi(date)); if (pos < 0) return null;
  const rot = (ROTATION[p.place] || ROTATION.home)[p.goal] || ROTATION.home.keep;
  const weekNo = Math.round((weekStart(date) - new Date(2024, 0, 1)) / 6048e5);
  return rot[(weekNo * days.length + pos) % rot.length];
}
function progFor(id) {
  const pr = PROG[id], lvl = (DB.state.p && DB.state.p.lvl) || 2;
  if (pr.tag === 'stretch') return Object.assign({}, pr);
  const rounds = clamp(pr.rounds + (lvl === 3 ? 1 : 0), 1, 6);
  const mult = lvl === 1 ? 0.8 : lvl === 3 ? 1.2 : 1;
  const items = pr.items.map(([e, v]) => [e, EX[e].type === 't' ? Math.max(15, Math.round(v * mult / 5) * 5) : Math.max(5, Math.round(v * mult))]);
  return Object.assign({}, pr, {rounds, items});
}
function progEst(pr) {
  let sec = 0, kc = 0;
  pr.items.forEach(([e, v]) => { const s = EX[e].type === 't' ? v : v * 3; sec += s; kc += EX[e].met * kg() * s / 3600; });
  const total = pr.rounds * (sec + pr.rest * pr.items.length) - pr.rest;
  return {min: Math.max(1, Math.round(total / 60)), kcal: Math.round(pr.rounds * kc + total / 60 * 1.5)};
}
const valTxt = (e, v) => EX[e].type === 't' ? `${v} сек` : `×${v}`;

/* ============================================================
   UI-утилиты
   ============================================================ */
function haptic(t = 'light') {
  if (!ver('6.1')) return;
  try { if (t === 'success' || t === 'error' || t === 'warning') tg.HapticFeedback.notificationOccurred(t); else if (t === 'sel') tg.HapticFeedback.selectionChanged(); else tg.HapticFeedback.impactOccurred(t); } catch (e) {}
}
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2400); }
let AC;
function beep(f = 880, d = .12, v = .22) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .015); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d + .03);
  } catch (e) {}
}
function confetti() {
  const c = $('#fx'), x = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
  const cols = ['#FF2A3A','#C3001B','#FF7A2F','#FFFFFF'];
  const ps = Array.from({length: 150}, () => ({x: c.width / 2, y: c.height * .35, vx: (Math.random() - .5) * 15, vy: Math.random() * -15 - 4, s: Math.random() * 7 + 4, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: cols[Math.random() * 4 | 0]}));
  let f = 0;
  (function a() {
    x.clearRect(0, 0, c.width, c.height);
    ps.forEach(p => { p.vy += .38; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); x.restore(); });
    if (++f < 160) requestAnimationFrame(a); else x.clearRect(0, 0, c.width, c.height);
  })();
}
function countUp(el, to, dec = 0) {
  if (!el) return;
  const from = +el.dataset.v || 0; el.dataset.v = to; const t0 = performance.now();
  (function f(t) { const k = Math.min((t - t0) / 900, 1), e = 1 - Math.pow(1 - k, 3), v = from + (to - from) * e; el.textContent = dec ? fmt1(v) : fmt(v); if (k < 1) requestAnimationFrame(f); })(t0);
}
function ask(msg, cb) {
  if (ver('6.2')) { try { tg.showConfirm(msg, ok => { if (ok) cb(); }); return; } catch (e) {} }
  if (window.confirm(msg)) cb();
}

/* --- стек «Назад» (кнопка Telegram BackButton) --- */
const backStack = [];
function pushBack(fn) { backStack.push(fn); updateBack(); }
function popBack() { const fn = backStack[backStack.length - 1]; if (!fn) return; const keep = fn(true) === false; if (!keep) backStack.pop(); updateBack(); }
function dropBack() { backStack.pop(); updateBack(); }
function updateBack() {
  if (!ver('6.1')) return;
  try { if (backStack.length) tg.BackButton.show(); else tg.BackButton.hide(); } catch (e) {}
}

/* --- нижние шторки --- */
let sheetOpen = false;
function openSheet(html, tall = false) {
  const s = $('#sheet');
  s.innerHTML = '<div class="grab"></div>' + html;
  s.classList.toggle('tall', tall); s.scrollTop = 0;
  if (!sheetOpen) { sheetOpen = true; $('#dim').classList.add('on'); requestAnimationFrame(() => s.classList.add('on')); pushBack(closeSheet); document.body.classList.add('lock'); }
  FIG.mount(s); haptic();
}
function closeSheet(fromBack) {
  if (!sheetOpen) return;
  sheetOpen = false; $('#sheet').classList.remove('on'); $('#dim').classList.remove('on');
  if (document.activeElement) document.activeElement.blur();
  if (!pages.length && !PL) document.body.classList.remove('lock');
  if (fromBack !== true) dropBack();
}

/* --- полноэкранные страницы --- */
const pages = [];
function openPage(html) {
  const el = document.createElement('div'); el.className = 'page';
  el.innerHTML = `<div class="inner">${html}</div>`;
  document.body.appendChild(el); pages.push(el); FIG.mount(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
  pushBack(closePage); $('nav').classList.add('off'); document.body.classList.add('lock'); haptic();
  return el;
}
function closePage(fromBack) {
  const el = pages.pop(); if (!el) return;
  el.classList.remove('on'); setTimeout(() => el.remove(), 460);
  if (fromBack !== true) dropBack();
  if (!pages.length) { $('nav').classList.remove('off'); if (!sheetOpen) document.body.classList.remove('lock'); }
}
const ptop = (title = '') => `<div class="ptop"><button class="back" onclick="popBack()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg></button><b style="font-size:17px;font-weight:800">${title}</b></div>`;

/* ---------- кольца ---------- */
const RC = ['#FF2A3A', '#FF7A2F', '#F2F2F2'];
function ringSVG(svg, radii, sw, colors = RC) {
  const c = svg.viewBox.baseVal.width / 2;
  svg.innerHTML = radii.map((r, i) => `<circle cx="${c}" cy="${c}" r="${r}" stroke="${colors[i]}" stroke-opacity=".16" stroke-width="${sw}"/><circle class="p" cx="${c}" cy="${c}" r="${r}" stroke="${colors[i]}" stroke-width="${sw}"/>`).join('');
  svg.querySelectorAll('.p').forEach(el => { const L = 2 * Math.PI * el.r.baseVal.value; el.style.strokeDasharray = L; el.style.strokeDashoffset = L; });
}
function setRings(svg, pcts) {
  svg.querySelectorAll('.p').forEach((el, i) => { const L = 2 * Math.PI * el.r.baseVal.value; const v = Math.min(pcts[i] || 0, 1); el.style.strokeDashoffset = v <= 0 ? L : L * (1 - v); el.style.opacity = v <= 0 ? 0 : 1; });
}
const celebrated = new Set();
function primeRings() { const k = todayKey(); ringP(k).forEach((v, i) => { if (v >= 1) celebrated.add(k + i); }); }
function checkRings() {
  const k = todayKey(), msgs = ['🔥 Кольцо питания закрыто!', '💪 Кольцо тренировки закрыто!', '💧 Норма воды выполнена!'];
  ringP(k).forEach((v, i) => {
    if (v >= 1 && !celebrated.has(k + i)) { celebrated.add(k + i); setTimeout(() => { confetti(); haptic('success'); toast(msgs[i]); }, 700); }
  });
}

/* ---------- достижения ---------- */
function checkAch() {
  const t = totals(), s = streak(), have = new Set(DB.state.a), w = DB.state.w, p = DB.state.p;
  const cond = {w1: t.w >= 1, w10: t.w >= 10, w50: t.w >= 50, w100: t.w >= 100, s3: s >= 3, s7: s >= 7, s30: s >= 30, rings: t.rings, water: t.water, food7: t.food >= 7, k10: t.k >= 10000, wt: false};
  if (w.length >= 2) { const d = w[w.length - 1][1] - w[0][1]; cond.wt = p.goal === 'lose' ? d <= -1 : p.goal === 'gain' ? d >= 1 : w.length >= 4 && Math.abs(d) <= 1; }
  const fresh = ACH.filter(a => cond[a[0]] && !have.has(a[0]));
  if (!fresh.length) return;
  fresh.forEach(a => DB.state.a.push(a[0])); DB.save('a');
  fresh.forEach((a, i) => setTimeout(() => { toast(`${a[1]} Достижение: ${a[2]}`); confetti(); haptic('success'); }, 1300 + i * 2600));
}

/* ============================================================
   Шапка и вкладки
   ============================================================ */
function userName() { return (DB.state.p && DB.state.p.name) || (TGU && TGU.first_name) || 'Атлет'; }
function avaHTML(cls = 'ava') {
  const n = userName();
  return (TGU && TGU.photo_url) ? `<div class="${cls}"><img src="${esc(TGU.photo_url)}" alt="" onerror="this.parentNode.textContent='${esc(n[0].toUpperCase())}'"></div>` : `<div class="${cls}">${esc(n[0].toUpperCase())}</div>`;
}
function renderHeader() {
  const h = new Date().getHours();
  $('#hdr').innerHTML = `<button onclick="openProfile()" style="display:flex;align-items:center;gap:12px;text-align:left;min-width:0">${avaHTML()}
    <div class="hello"><small>${h < 5 ? 'Доброй ночи,' : h < 12 ? 'Доброе утро,' : h < 18 ? 'Добрый день,' : 'Добрый вечер,'}</small><b>${esc(userName())}</b></div></button>
    <div class="streak"><svg viewBox="0 0 24 24" fill="#FF2A3A"><path d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5 .2 2 1.3 3 2.5 3-1.5-3-1-6 0-9z"/></svg>${streak()}</div>`;
}
let cur = 0;
const RENDER = [renderHome, renderWorkouts, renderFood, renderProgress];
function go(t, force) {
  if (t === cur && !force) { window.scrollTo({top: 0, behavior: 'smooth'}); return; }
  const dir = t > cur ? 'from-right' : t < cur ? 'from-left' : '';
  $$('.view').forEach(v => v.classList.remove('active', 'from-left', 'from-right'));
  const nv = $('#v' + t); nv.classList.add('active'); if (dir) nv.classList.add(dir);
  $$('.tab').forEach(b => b.classList.toggle('on', +b.dataset.t === t));
  $('#pill').style.transform = `translateX(${t * 100}%)`;
  cur = t; window.scrollTo({top: 0}); haptic('sel'); RENDER[t]();
}
function refresh() { renderHeader(); RENDER[cur](); checkRings(); }

/* ============================================================
   Главная
   ============================================================ */
const I = {
  drop: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s7 7.6 7 12.5A7 7 0 0 1 5 14.5C5 9.6 12 2 12 2z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 9a5 5 0 0 1 8 0M12 9l1.5-2"/></svg>',
  chev: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
  play: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  prev: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg>',
  next: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
};
function renderHome() {
  const k = todayKey(), r = day(k), pl = plan(), e = eat(r);
  const pid = progIdFor(new Date()), done = (r.x || []).some(x => x[0] === 'w');
  let wc;
  if (pid) {
    const pr = progFor(pid), est = progEst(pr);
    wc = `<div class="card wcard" style="--i:2" onclick="openProgram('${pid}')"><div style="flex:1;min-width:0">
      ${done ? '<span class="tag green">Выполнено ✓</span>' : '<span class="tag">Тренировка дня</span>'}
      <h4>${esc(pr.n)}</h4><p>${est.min} мин · ${pr.items.length} упр. · ~${est.kcal} ккал</p>
      <button class="btn sm">${done ? '↻ Ещё раз' : '▶ Начать'}</button></div>${FIG.html(pr.items[0][0])}</div>`;
  } else {
    wc = `<div class="card wcard" style="--i:2" onclick="openProgram('stretch')"><div style="flex:1;min-width:0">
      <span class="tag dark">День отдыха</span><h4>Восстановление</h4><p>Лёгкая растяжка 10 минут ускорит восстановление мышц</p>
      <button class="btn sm">▶ Растяжка</button></div>${FIG.html('child')}</div>`;
  }
  const ws = weekStart(new Date()); let act = 0;
  const wk = DN.map((d, i) => { const dk = dkey(addDays(ws, i)); if (isActive(DB.state.d[dk])) act++; return `<div class="day ${dk === k ? 'today' : ''}"><svg class="mini" viewBox="0 0 36 36" data-k="${dk}"></svg>${d}</div>`; }).join('');
  $('#v0 .st').innerHTML = `
    <div class="card rings-card" style="--i:0">
      <svg class="rings" viewBox="0 0 200 200" id="bigRings"></svg>
      <div class="legend">
        <div class="lg"><small><i style="background:var(--red)"></i>Питание</small><b><span id="lgF">0</span> <em>/ ${fmt(pl.kcal)} ккал</em></b></div>
        <div class="lg"><small><i style="background:var(--orange)"></i>Тренировка</small><b><span id="lgT">0</span> <em>/ ${pl.min} мин</em></b></div>
        <div class="lg"><small><i style="background:var(--white)"></i>Вода</small><b><span id="lgW">0</span> <em>/ ${pl.water} стак.</em></b></div>
      </div>
    </div>
    <div class="quick" style="--i:1">
      <button class="qbtn" onclick="addWater()"><span class="ic">${I.drop}</span>Вода</button>
      <button class="qbtn" onclick="openFoodSheet()"><span class="ic">${I.plus}</span>Еда</button>
      <button class="qbtn" onclick="openActivity()"><span class="ic">${I.bolt}</span>Активность</button>
      <button class="qbtn" onclick="openWeight()"><span class="ic">${I.scale}</span>Вес</button>
    </div>
    ${wc}
    <div class="card" style="--i:3"><h3>Эта неделя <span>${act} из 7 активных</span></h3><div class="week">${wk}</div></div>
    <div class="stats" style="--i:4">
      <div class="stat"><small>Сожжено</small><b><span id="stK">0</span> <em>ккал</em></b></div>
      <div class="stat"><small>Вес</small><b>${fmt1(lastWeight())} <em>кг</em></b></div>
      <div class="stat"><small>Серия</small><b>${streak()} <em>${plural(streak(), 'день', 'дня', 'дней')}</em></b></div>
    </div>`;
  const big = $('#bigRings'); ringSVG(big, [86, 62, 38], 20);
  requestAnimationFrame(() => requestAnimationFrame(() => setRings(big, ringP(k))));
  countUp($('#lgF'), e.k); countUp($('#lgT'), r.m); countUp($('#lgW'), r.w); countUp($('#stK'), r.k);
  $$('#v0 .mini').forEach((s, i) => { ringSVG(s, [15, 10.5, 6], 3.6); const dk = s.dataset.k; const v = dk <= k ? ringP(dk) : [0, 0, 0]; setTimeout(() => setRings(s, v), 150 + i * 70); });
  FIG.mount($('#v0'));
}

/* ============================================================
   Тренировки
   ============================================================ */
let wTab = 'prog', pFilter = 'all', eFilter = 'all';
const P_FILTERS = [['all','Все'],['home','Дома'],['gym','Зал'],['lose','Похудение'],['strength','Сила'],['abs','Пресс'],['stretch','Растяжка']];
const pMatch = (p, f) => f === 'all' || (f === 'home' && p.place !== 'gym') || (f === 'gym' && p.place !== 'home') ||
  (f === 'lose' && ['hiit','cardio','start','legs','g_full','abs'].includes(p.id)) || (f === 'strength' && ['upper','legs','g_chest','g_back','g_legs','g_sh','g_full'].includes(p.id)) ||
  (f === 'abs' && p.tag === 'abs') || (f === 'stretch' && ['stretch','back'].includes(p.id));
function progCard(p, i) {
  const pr = progFor(p.id), est = progEst(pr);
  return `<div class="card prog" style="--i:${i}" onclick="openProgram('${p.id}')"><div class="thumb">${FIG.html(pr.items[0][0], '')}</div>
    <div style="min-width:0"><h4>${esc(p.n)}</h4><p>${est.min} мин · ${pr.items.length} упр. · ${p.place === 'gym' ? 'зал' : p.place === 'home' ? 'дома' : 'везде'}</p>
    <div class="lvl">${[1, 2, 3].map(l => `<i class="${l <= p.lvl ? 'on' : ''}"></i>`).join('')}</div></div><div class="go">${I.chev}</div></div>`;
}
function renderWorkouts() {
  const p = DB.state.p, ws = weekStart(new Date()), tk = todayKey();
  let body = '';
  if (wTab === 'prog') {
    const planDays = DN.map((d, i) => {
      const dt = addDays(ws, i), dk = dkey(dt), pid = progIdFor(dt), r = DB.state.d[dk], done = r && (r.x || []).some(x => x[0] === 'w');
      return `<button class="pd ${pid ? 'train' : 'rest'} ${done ? 'done' : ''} ${dk === tk ? 'today' : ''}" onclick="openProgram('${pid || 'stretch'}')">${d}<span class="dot">${done ? '✓' : pid ? '●' : '–'}</span><b>${pid ? PROG[pid].s : 'Отдых'}</b></button>`;
    }).join('');
    body = `<div class="card" style="--i:2"><h3>План на неделю <span>${p.days} ${plural(p.days, 'тренировка', 'тренировки', 'тренировок')}</span></h3><div class="plan">${planDays}</div></div>
      <div class="chips" style="--i:3">${P_FILTERS.map(([id, n]) => `<button class="chip ${pFilter === id ? 'on' : ''}" onclick="pFilter='${id}';renderWorkouts()">${n}</button>`).join('')}</div>
      ${PROGRAMS.filter(x => pMatch(x, pFilter)).map((x, i) => progCard(x, i + 4)).join('')}`;
  } else {
    const list = Object.values(EX).filter(e => eFilter === 'all' || e.g === eFilter);
    body = `<div class="chips" style="--i:2">${[['all', 'Все']].concat(Object.entries(GROUPS)).map(([id, n]) => `<button class="chip ${eFilter === id ? 'on' : ''}" onclick="eFilter='${id}';renderWorkouts()">${n}</button>`).join('')}</div>
      <div class="exgrid" style="--i:3">${list.map(e => `<button class="excard" onclick="openExInfo('${e.id}')"><div class="fb">${FIG.html(e.id, '')}</div><b>${esc(e.n)}</b><small>${GROUPS[e.g]} · ${EQ[e.eq]}</small></button>`).join('')}</div>`;
  }
  $('#v1 .st').innerHTML = `<h2 style="--i:0">Тренировки</h2>
    <div class="seg" style="--i:1"><div class="sp" style="transform:translateX(${wTab === 'ex' ? 100 : 0}%)"></div>
      <button class="${wTab === 'prog' ? 'on' : ''}" onclick="setWTab('prog')">Программы</button><button class="${wTab === 'ex' ? 'on' : ''}" onclick="setWTab('ex')">Упражнения</button></div>${body}`;
  FIG.mount($('#v1'));
}
function setWTab(t) { if (wTab === t) return; wTab = t; haptic('sel'); renderWorkouts(); }

function openExInfo(id) {
  const e = EX[id];
  openSheet(`<div class="hero" style="height:210px;margin-top:4px">${FIG.html(id, '')}</div>
    <div class="sh-t">${esc(e.n)}</div>
    <div class="meta"><span>${GROUPS[e.g]}</span><span>${EQ[e.eq]}</span><span>~${Math.round(e.met * kg() / 60 * 10) / 10} ккал/мин</span></div>
    <ol class="tips">${e.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ol><div style="height:10px"></div>`);
  if (PL && !PL.paused) togglePause();
}

function openProgram(id) {
  const pr = progFor(id), est = progEst(pr);
  const lvlN = ['', 'Новичок', 'Средний', 'Продвинутый'][pr.lvl];
  openPage(`${ptop()}
    <div class="hero">${FIG.html(pr.items[0][0], '')}</div>
    <h2 style="margin:0 0 6px">${esc(pr.n)}</h2><div class="sub">${esc(pr.d)}</div>
    <div class="meta"><span>⏱ ${est.min} мин</span><span>🔥 ~${est.kcal} ккал</span><span>📶 ${lvlN}</span><span>🔁 ${pr.rounds} ${plural(pr.rounds, 'круг', 'круга', 'кругов')}</span><span>⏸ отдых ${pr.rest} с</span></div>
    <div class="card"><h3>Упражнения <span>${pr.items.length}</span></h3>
      ${pr.items.map(([e, v]) => `<div class="exrow" onclick="openExInfo('${e}')"><div class="thumb">${FIG.html(e, '')}</div><div style="min-width:0"><b>${esc(EX[e].n)}</b><small>${GROUPS[EX[e].g]}</small></div><span class="n">${valTxt(e, v)}</span></div>`).join('')}
    </div>
    <div class="fixbtn"><button class="btn" onclick="startWorkout('${id}')">▶ Начать тренировку</button></div>`);
}

/* ============================================================
   Плеер тренировки
   ============================================================ */
let PL = null, plTimer = null, wake = null;
function startWorkout(id) {
  const pr = progFor(id), seq = [{t: 'ready', s: 5, ex: pr.items[0][0]}];
  for (let r = 0; r < pr.rounds; r++) pr.items.forEach(([e, v], i) => {
    seq.push({t: 'ex', ex: e, v, r, i});
    const last = r === pr.rounds - 1 && i === pr.items.length - 1;
    if (!last) { const ni = (i + 1) % pr.items.length; seq.push({t: 'rest', s: Math.max(5, pr.rest), next: pr.items[ni][0], nv: pr.items[ni][1]}); }
  });
  PL = {pr, seq, idx: 0, left: 0, paused: false, active: 0, kcal: 0, done: 0, last: Date.now(), lastSec: -1, total: seq.filter(s => s.t === 'ex').length};
  while (pages.length) { closePage(); }
  const pl = $('#player'); pl.classList.add('on'); document.body.classList.add('lock');
  pushBack(() => { exitWorkout(); return false; });
  try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(w => wake = w).catch(() => {}); } catch (e) {}
  beep(660, .08, .05);
  setStep(0);
  clearInterval(plTimer); plTimer = setInterval(tick, 200);
}
function setStep(i) {
  const s = PL.seq[i]; PL.idx = i; PL.left = (s.t === 'ex' && EX[s.ex].type === 'r') ? 0 : (s.t === 'ex' ? s.v : s.s) * 1000; PL.lastSec = -1; PL.dur = PL.left;
  renderStep();
}
function renderStep() {
  const s = PL.seq[PL.idx], pr = PL.pr, pl = $('#player');
  const exN = PL.seq.slice(0, PL.idx + 1).filter(x => x.t === 'ex').length;
  const pct = Math.round(PL.seq.slice(0, PL.idx).filter(x => x.t === 'ex').length / PL.total * 100);
  pl.classList.toggle('rest', s.t !== 'ex');
  const timed = s.t !== 'ex' || EX[s.ex].type === 't';
  const exId = s.t === 'rest' ? s.next : s.ex;
  let center = '', ctl = '';
  const ring = (color, fig) => `<div class="timer"><svg viewBox="0 0 220 220"><circle cx="110" cy="110" r="100" stroke="#26262A"/><circle id="pRing" cx="110" cy="110" r="100" stroke="${color}" style="stroke-dasharray:628.3;stroke-dashoffset:0"/></svg>${fig ? FIG.html(fig) : ''}</div>`;
  if (s.t === 'ready') {
    center = `<div class="step">Приготовься</div><h4>${esc(EX[s.ex].n)}</h4>${ring('#FF2A3A', s.ex)}<div class="ptime" id="pTime">5</div>`;
    ctl = `<button class="btn" onclick="nextStep()">Поехали!</button>`;
  } else if (s.t === 'rest') {
    center = `<div class="step">Отдых</div><div class="timer"><svg viewBox="0 0 220 220"><circle cx="110" cy="110" r="100" stroke="#26262A"/><circle id="pRing" cx="110" cy="110" r="100" stroke="#F2F2F2" style="stroke-dasharray:628.3;stroke-dashoffset:0"/></svg><div class="tin"><div class="ptime" id="pTime">0:00</div><div class="sub">восстанови дыхание</div></div></div>
      <div class="next"><div class="thumb">${FIG.html(s.next, '')}</div><div><small>Далее</small><b>${esc(EX[s.next].n)}</b><small>${valTxt(s.next, s.nv)}</small></div></div>`;
    ctl = `<button class="btn ghost" onclick="PL.left+=10000;PL.dur+=10000;haptic()">+10 сек</button><button class="btn" onclick="nextStep()">Пропустить</button>`;
  } else {
    center = `<div class="step">Круг ${s.r + 1} из ${pr.rounds} · ${s.i + 1}/${pr.items.length}</div>
      <h4 onclick="openExInfo('${s.ex}')">${esc(EX[s.ex].n)} <span style="font-size:16px;color:var(--muted)">ⓘ</span></h4>${ring('#FF2A3A', s.ex)}
      ${timed ? '<div class="ptime" id="pTime">0:00</div>' : `<div class="ptime reps">×${s.v}</div><div class="sub">повторений</div>`}`;
    ctl = timed
      ? `<button class="rb" onclick="prevStep()">${I.prev}</button><button class="btn ghost" id="pPause" onclick="togglePause()">${PL.paused ? I.play + ' Продолжить' : I.pause + ' Пауза'}</button><button class="rb" onclick="nextStep()">${I.next}</button>`
      : `<button class="rb" onclick="prevStep()">${I.prev}</button><button class="btn" onclick="nextStep()">Готово ✓</button><button class="rb" onclick="togglePause()" id="pPause">${PL.paused ? I.play : I.pause}</button>`;
  }
  pl.innerHTML = `<div class="ptbar"><button class="close" onclick="exitWorkout()">✕</button><div class="ptrack"><i style="width:${pct}%"></i></div><div class="cnt">${exN}/${PL.total}</div></div>
    <div class="pbody">${center}</div><div class="pctl">${ctl}</div>`;
  FIG.mount(pl); tickUI();
}
function tickUI() {
  const s = PL.seq[PL.idx], t = $('#pTime'), ring = $('#pRing');
  const timed = s.t !== 'ex' || EX[s.ex].type === 't';
  if (!timed) return;
  const sec = Math.ceil(PL.left / 1000);
  if (t) t.textContent = s.t === 'ready' ? sec : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  if (ring) { ring.style.transition = 'stroke-dashoffset .25s linear'; ring.style.strokeDashoffset = 628.3 * (1 - PL.left / PL.dur); }
}
function tick() {
  if (!PL) return;
  const now = Date.now(), dt = now - PL.last; PL.last = now;
  if (PL.paused || PL.finished) return;
  const s = PL.seq[PL.idx];
  if (s.t === 'ex') { PL.active += dt; PL.kcal += EX[s.ex].met * kg() * dt / 3600000; }
  else if (s.t === 'rest') { PL.kcal += 1.5 * kg() * dt / 3600000; }
  const timed = s.t !== 'ex' || EX[s.ex].type === 't';
  if (!timed) return;
  PL.left -= dt;
  const sec = Math.ceil(PL.left / 1000);
  if (sec !== PL.lastSec) { PL.lastSec = sec; if (sec <= 3 && sec >= 1) { beep(740, .1); haptic('light'); } }
  if (PL.left <= 0) { nextStep(); return; }
  tickUI();
}
function nextStep() {
  if (!PL) return;
  const s = PL.seq[PL.idx];
  if (s.t === 'ex') PL.done++;
  if (PL.idx + 1 >= PL.seq.length) { finishWorkout(); return; }
  const n = PL.seq[PL.idx + 1];
  beep(n.t === 'ex' ? 1046 : 520, .2); haptic(n.t === 'ex' ? 'heavy' : 'medium');
  PL.paused = false; setStep(PL.idx + 1);
}
function prevStep() {
  let i = PL.idx - 1; while (i > 0 && PL.seq[i].t !== 'ex') i--;
  if (i < 1) i = 1; haptic(); PL.paused = false; setStep(i);
}
function togglePause() {
  if (!PL) return; PL.paused = !PL.paused; haptic();
  const b = $('#pPause'); if (!b) return;
  const timed = PL.seq[PL.idx].t !== 'ex' || EX[PL.seq[PL.idx].ex].type === 't';
  b.innerHTML = timed ? (PL.paused ? I.play + ' Продолжить' : I.pause + ' Пауза') : (PL.paused ? I.play : I.pause);
}
function exitWorkout() {
  if (!PL) return;
  if (PL.finished) { saveWorkout(); return; }
  if (!PL.paused) togglePause();
  ask(PL.active >= 60000 ? 'Завершить тренировку? Выполненная часть сохранится.' : 'Выйти из тренировки?', () => { if (!PL) return; if (PL.active >= 60000) finishWorkout(true); else closePlayer(); });
}
function closePlayer() {
  clearInterval(plTimer); PL = null;
  $('#player').classList.remove('on'); setTimeout(() => { if (!PL) $('#player').innerHTML = ''; }, 500);
  if (sheetOpen) closeSheet();
  dropBack();
  document.body.classList.remove('lock');
  try { if (wake) wake.release(); } catch (e) {}
}
function finishWorkout(partial) {
  PL.finished = true; clearInterval(plTimer);
  const min = Math.max(1, Math.round(PL.active / 60000)), kcal = Math.max(1, Math.round(PL.kcal));
  PL.result = {min, kcal};
  beep(784, .15); setTimeout(() => beep(1046, .3), 160); haptic('success');
  const pl = $('#player'); pl.classList.remove('rest');
  pl.innerHTML = `<div class="pbody finish"><div class="trophy">${partial ? '💪' : '🏆'}</div>
    <h2>${partial ? 'Хорошая работа!' : 'Тренировка завершена!'}</h2><div class="sub">${esc(PL.pr.n)}</div>
    <div class="res" style="width:100%;margin-top:22px">
      <div class="card"><b>${min}</b><small>${plural(min, 'минута', 'минуты', 'минут')}</small></div><div class="card"><b>${kcal}</b><small>ккал сожжено</small></div>
      <div class="card"><b>${PL.done}</b><small>${plural(PL.done, 'упражнение', 'упражнения', 'упражнений')}</small></div><div class="card"><b>${streak() + (isActive(DB.state.d[todayKey()]) ? 0 : 1)}</b><small>дней подряд</small></div>
    </div></div>
    <div class="pctl"><button class="btn" onclick="saveWorkout()">Сохранить результат</button></div>`;
  setTimeout(confetti, 300);
}
function saveWorkout() {
  const k = todayKey(), r = dayW(k), {min, kcal} = PL.result;
  r.m += min; r.k += kcal; r.x.push(['w', PL.pr.n, min, kcal, PL.pr.id]);
  saveDay(k); closePlayer(); toast(`✓ +${min} мин · ${kcal} ккал`);
  if (cur !== 0) go(0); else refresh();
  renderHeader(); checkRings(); checkAch();
}

/* ============================================================
   Питание
   ============================================================ */
let foodDay = null;
const defMeal = () => { const h = new Date().getHours(); return h < 11 ? 'b' : h < 16 ? 'l' : h < 21 ? 'd' : 's'; };
function renderFood() {
  const k = foodDay || todayKey(), r = day(k), pl = plan(), e = eat(r), isToday = k === todayKey();
  const M = [['Белки', 'p'], ['Жиры', 'f'], ['Углеводы', 'c']];
  $('#v2 .st').innerHTML = `<h2 style="--i:0">Питание</h2>
    <div class="dnav" style="--i:1"><button onclick="shiftFoodDay(-1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg></button><b>${dayLabel(k)}</b><button onclick="shiftFoodDay(1)" ${isToday ? 'disabled' : ''}>${I.chev}</button></div>
    <div class="card" style="--i:2"><div class="kcal">
      <svg class="semi" viewBox="0 0 240 130"><defs><linearGradient id="gr"><stop offset="0" stop-color="#C3001B"/><stop offset="1" stop-color="#FF2A3A"/></linearGradient></defs>
        <path d="M20 120 A100 100 0 0 1 220 120" stroke="#26262A" stroke-width="18"/><path class="p" id="semiP" d="M20 120 A100 100 0 0 1 220 120" stroke="${e.k > pl.kcal ? '#FF7A2F' : 'url(#gr)'}" stroke-width="18"/></svg>
      <div class="big"><b id="kLeft">0</b><small>${e.k > pl.kcal ? 'ккал сверх нормы' : 'ккал осталось'}</small></div>
      <div class="kline"><div>Цель<b>${fmt(pl.kcal)}</b></div><div style="text-align:center">Съедено<b>${fmt(e.k)}</b></div><div style="text-align:right">Сожжено<b>${fmt(r.k)}</b></div></div>
      <div class="macros">${M.map(([n, x]) => `<div class="mac"><small>${n}</small><b>${Math.round(e[x])} / ${pl[x]} г</b><div class="bar"><i class="${e[x] > pl[x] ? 'over' : ''}" data-w="${Math.min(e[x] / pl[x] * 100, 100)}"></i></div></div>`).join('')}</div>
    </div></div>
    ${MEALS.map(([mk, mn, em], i) => {
      const items = r.f.map((x, idx) => [x, idx]).filter(([x]) => x[0] === mk), sum = items.reduce((s, [x]) => s + x[3], 0);
      return `<div class="card meal" style="--i:${i + 3}"><div class="meal-h"><span class="em">${em}</span><div><b>${mn}</b><small>${sum ? fmt(sum) + ' ккал' : 'Ещё ничего'}</small></div><button class="add" onclick="openFoodSheet('${mk}','${k}')">+</button></div>
        ${items.length ? `<div class="items">${items.map(([x, idx]) => `<div class="item"><div class="nm">${esc(x[1])}<small>${x[2] ? x[2] + ' г · ' : ''}Б ${Math.round(x[4])} · Ж ${Math.round(x[5])} · У ${Math.round(x[6])}</small></div><span class="kc">${fmt(x[3])}</span><button class="del" onclick="delFood('${k}',${idx})">✕</button></div>`).join('')}</div>` : ''}</div>`;
    }).join('')}
    <div class="card" style="--i:7"><h3>Вода <span>${r.w} / ${pl.water} стаканов · ${fmt1(r.w * 0.25)} л</span></h3>
      <div class="glasses">${Array.from({length: Math.max(pl.water, r.w)}, (_, i) => `<button class="glass ${i < r.w ? 'full' : ''}" onclick="setWater('${k}',${i + 1})"></button>`).join('')}</div></div>`;
  const L = $('#semiP'), len = L.getTotalLength(); L.style.strokeDasharray = len; L.style.strokeDashoffset = len;
  requestAnimationFrame(() => requestAnimationFrame(() => { L.style.strokeDashoffset = len * (1 - Math.min(e.k / pl.kcal, 1)); }));
  countUp($('#kLeft'), Math.abs(pl.kcal - e.k));
  setTimeout(() => $$('#v2 .bar i').forEach(i => i.style.width = i.dataset.w + '%'), 60);
}
function shiftFoodDay(n) {
  const k = foodDay || todayKey(); const nk = dkey(addDays(fromKey(k), n));
  if (nk > todayKey()) return; foodDay = nk === todayKey() ? null : nk; haptic('sel'); renderFood();
}
function delFood(k, idx) {
  const r = dayW(k), x = r.f[idx]; if (!x) return;
  r.f.splice(idx, 1); saveDay(k); haptic('medium'); toast(`Удалено: ${x[1]}`); refresh();
}
function addWater() { const k = todayKey(), r = dayW(k); if (r.w >= 20) return; r.w++; saveDay(k); haptic('medium'); toast(`💧 +1 стакан · ${r.w} из ${plan().water}`); refresh(); checkAch(); }
function setWater(k, n) { const r = dayW(k); r.w = r.w === n ? n - 1 : n; saveDay(k); haptic('sel'); refresh(); checkAch(); }

/* --- добавление еды --- */
let FS = null;
function openFoodSheet(meal, k) {
  FS = {meal: meal || defMeal(), k: k || todayKey(), cat: DB.state.r.length ? 'recent' : 'all', q: ''};
  renderFoodList();
}
const mealChips = () => `<div class="chips" style="margin-top:12px;margin-bottom:0">${MEALS.map(([mk, mn, em]) => `<button class="chip ${FS.meal === mk ? 'on' : ''}" onclick="FS.meal='${mk}';$$('.mchip').forEach(b=>b.classList.toggle('on',b.dataset.m==='${mk}'));haptic('sel')" data-m="${mk}" ${''}>${em} ${mn}</button>`).join('').replace(/class="chip/g, 'class="mchip chip')}</div>`;
function renderFoodList() {
  openSheet(`<div class="sh-t">Добавить еду · ${dayLabel(FS.k)}</div>${mealChips()}
    <div class="search">${I.search}<input id="fq" placeholder="Поиск: плов, яйцо, банан…" value="${esc(FS.q)}" oninput="FS.q=this.value;renderFoodItems()" autocomplete="off"></div>
    <div class="chips">${FOOD_CATS.map(([id, n]) => `<button class="chip ${FS.cat === id ? 'on' : ''}" onclick="FS.cat='${id}';$$('.fcat').forEach(b=>b.classList.toggle('on',b.dataset.c==='${id}'));renderFoodItems();haptic('sel')" data-c="${id}">${n}</button>`).join('').replace(/class="chip/g, 'class="fcat chip')}</div>
    <button class="btn line" style="margin-bottom:6px;padding:13px" onclick="customFood()">✏️ Своё блюдо / ввести калории вручную</button>
    <div id="flist"></div>`, true);
  renderFoodItems();
}
function foodPool() {
  const q = FS.q.trim().toLowerCase();
  let pool = FS.cat === 'recent' && !q ? DB.state.r.slice() : FOODS.filter(f => FS.cat === 'all' || FS.cat === 'recent' || f[6] === FS.cat);
  if (q) { const extra = DB.state.r.filter(f => f[6] === 'custom'); pool = pool.concat(extra).filter(f => f[0].toLowerCase().includes(q)); }
  const seen = new Set(); return pool.filter(f => !seen.has(f[0]) && seen.add(f[0]));
}
function renderFoodItems() {
  const list = foodPool(), el = $('#flist'); if (!el) return;
  FS.list = list;
  el.innerHTML = list.length ? list.slice(0, 80).map((f, i) => `<div class="food" onclick="openPortion(${i})"><div class="nm"><b>${esc(f[0])}</b><small>${f[5]} г · Б ${fmt1(f[2] * f[5] / 100)} Ж ${fmt1(f[3] * f[5] / 100)} У ${fmt1(f[4] * f[5] / 100)}</small></div>
    <span style="display:flex;align-items:center;gap:10px"><span class="kc">${fmt(f[1] * f[5] / 100)} ккал</span><button class="add" onclick="event.stopPropagation();quickAdd(${i})">+</button></span></div>`).join('')
    : `<div class="empty">${FS.cat === 'recent' && !FS.q ? 'Здесь появятся продукты, которые ты добавляешь' : 'Ничего не найдено. Добавь своё блюдо ✏️'}</div>`;
}
function quickAdd(i) { const f = FS.list[i]; addFoodEntry(f, f[5]); closeSheet(); }
function openPortion(i) {
  const f = FS.list[i]; FS.item = f; FS.g = f[5];
  openSheet(`<button class="sub" onclick="renderFoodList()" style="margin-bottom:8px">‹ Назад к списку</button>
    <div class="sh-t">${esc(f[0])}</div><div class="sub">${f[1]} ккал на 100 г</div>
    <div class="stepper"><button onclick="setG(FS.g-10)">−</button><div class="val"><input id="gIn" type="number" inputmode="numeric" value="${FS.g}" oninput="setG(+this.value||0,true)"><small>грамм</small></div><button onclick="setG(FS.g+10)">+</button></div>
    <div class="qmul">${[[.5, '½ порции'], [1, '1 порция'], [1.5, '1½'], [2, '2 порции']].map(([m, n]) => `<button class="chip" onclick="setG(${Math.round(f[5] * m)})">${n}</button>`).join('')}</div>
    <div class="nut" id="nut"></div>${mealChips()}
    <button class="btn" style="margin-top:16px" onclick="addFoodEntry(FS.item,FS.g);closeSheet()">Добавить</button>`, true);
  setG(FS.g, true);
}
function setG(g, fromInput) {
  FS.g = clamp(Math.round(g), 0, 3000); const f = FS.item;
  if (!fromInput) { $('#gIn').value = FS.g; haptic('sel'); }
  $('#nut').innerHTML = `<div><b>${fmt(f[1] * FS.g / 100)}</b><small>ккал</small></div><div><b>${fmt1(f[2] * FS.g / 100)}</b><small>белки</small></div><div><b>${fmt1(f[3] * FS.g / 100)}</b><small>жиры</small></div><div><b>${fmt1(f[4] * FS.g / 100)}</b><small>углев.</small></div>`;
}
function addFoodEntry(f, g) {
  if (!g || g <= 0) { toast('Укажи вес порции'); return; }
  const k = FS.k, r = dayW(k), m = g / 100, r1 = v => Math.round(v * 10) / 10;
  r.f.push([FS.meal, f[0], f[6] === 'custom' && g === 100 ? 0 : Math.round(g), Math.round(f[1] * m), r1(f[2] * m), r1(f[3] * m), r1(f[4] * m)]);
  saveDay(k);
  DB.state.r = [f].concat(DB.state.r.filter(x => x[0] !== f[0])).slice(0, 25); DB.save('r');
  haptic('medium'); toast(`✓ ${f[0]} · ${fmt(f[1] * m)} ккал`);
  if (FS.k !== todayKey()) foodDay = FS.k;
  refresh(); checkAch();
}
function customFood() {
  openSheet(`<button class="sub" onclick="renderFoodList()" style="margin-bottom:8px">‹ Назад к списку</button>
    <div class="sh-t" style="margin-bottom:14px">Своё блюдо</div>
    <label class="fld"><span>Название</span><input id="cN" placeholder="Например: суп мамин" maxlength="30"></label>
    <label class="fld"><span>Калории на порцию</span><input id="cK" type="number" inputmode="numeric" placeholder="ккал"></label>
    <div class="row"><label class="fld"><span>Белки, г</span><input id="cP" type="number" inputmode="decimal" placeholder="0"></label><label class="fld"><span>Жиры, г</span><input id="cF" type="number" inputmode="decimal" placeholder="0"></label><label class="fld"><span>Углев., г</span><input id="cC" type="number" inputmode="decimal" placeholder="0"></label></div>
    ${mealChips()}<button class="btn" style="margin-top:16px" onclick="saveCustom()">Добавить</button>`, true);
  setTimeout(() => $('#cN') && $('#cN').focus(), 350);
}
function saveCustom() {
  const n = $('#cN').value.trim() || 'Своё блюдо', k = +$('#cK').value;
  if (!k || k <= 0) { toast('Укажи калории'); haptic('error'); return; }
  const f = [n, Math.round(k), +$('#cP').value || 0, +$('#cF').value || 0, +$('#cC').value || 0, 100, 'custom'];
  addFoodEntry(f, 100); closeSheet();
}

/* --- активность --- */
let ACT = {i: 0, min: 30};
function openActivity() {
  openSheet(`<div class="sh-t">Добавить активность</div><div class="sub">Ходьба, спорт и всё, что не из программ</div>
    <div class="opts two" style="margin:14px 0;grid-template-columns:repeat(2,1fr)">${ACTIVITIES.map((a, i) => `<button class="opt actopt ${ACT.i === i ? 'on' : ''}" style="padding:12px 8px" onclick="ACT.i=${i};$$('.actopt').forEach((b,j)=>b.classList.toggle('on',j===${i}));actCalc();haptic('sel')"><span style="font-size:24px">${a[2]}</span><b style="font-size:14px">${a[0]}</b></button>`).join('')}</div>
    <div class="stepper"><button onclick="ACT.min=Math.max(5,ACT.min-5);actCalc(1)">−</button><div class="val"><input id="aIn" type="number" inputmode="numeric" value="${ACT.min}" oninput="ACT.min=clamp(+this.value||0,0,600);actCalc()"><small>минут</small></div><button onclick="ACT.min=Math.min(600,ACT.min+5);actCalc(1)">+</button></div>
    <div class="nut" style="grid-template-columns:1fr 1fr"><div><b id="aK">0</b><small>ккал</small></div><div><b id="aM">0</b><small>минут в кольцо</small></div></div>
    <button class="btn" onclick="saveActivity()">Добавить</button>`, true);
  actCalc();
}
function actCalc(upd) { if (upd) { $('#aIn').value = ACT.min; haptic('sel'); } $('#aK').textContent = fmt(ACTIVITIES[ACT.i][1] * kg() * ACT.min / 60); $('#aM').textContent = ACT.min; }
function saveActivity() {
  if (!ACT.min) return;
  const k = todayKey(), r = dayW(k), a = ACTIVITIES[ACT.i], kc = Math.round(a[1] * kg() * ACT.min / 60);
  r.m += ACT.min; r.k += kc; r.x.push(['a', a[0], ACT.min, kc]); saveDay(k);
  closeSheet(); haptic('medium'); toast(`${a[2]} ${a[0]} · ${ACT.min} мин · ${kc} ккал`); refresh(); checkAch();
}

/* --- вес --- */
let WV = 70;
function openWeight() {
  WV = lastWeight();
  openSheet(`<div class="sh-t">Записать вес</div><div class="sub">Взвешивайся утром натощак — так точнее</div>
    <div class="stepper"><button onclick="setWV(WV-0.1)">−</button><div class="val"><input id="wIn" type="number" inputmode="decimal" step="0.1" value="${WV}" oninput="WV=+this.value||WV"><small>кг</small></div><button onclick="setWV(WV+0.1)">+</button></div>
    <button class="btn" onclick="saveWeight()">Сохранить</button>`);
}
function setWV(v) { WV = Math.round(clamp(v, 30, 250) * 10) / 10; $('#wIn').value = WV; haptic('sel'); }
function saveWeight() {
  const v = Math.round(clamp(WV, 30, 250) * 10) / 10, k = todayKey();
  DB.state.w = DB.state.w.filter(x => x[0] !== k).concat([[k, v]]).sort((a, b) => a[0] < b[0] ? -1 : 1); DB.save('w');
  DB.state.p.w = v; DB.save('p'); PLAN = null;
  closeSheet(); haptic('success'); toast(`⚖️ Вес ${fmt1(v)} кг сохранён`); refresh(); checkAch();
}

/* ============================================================
   Прогресс
   ============================================================ */
function barsHTML(vals, goal, labels, todayIdx, fmtV = v => v) {
  const max = Math.max(goal * 1.25, ...vals, 1);
  return `<div class="bars"><div class="glw"><div class="gl" style="bottom:${goal / max * 100}%"></div></div>${vals.map((v, i) => `<div class="bcol ${i <= todayIdx && v ? (v > goal * 1.1 && goal > 999 ? 'ov' : 'on') : ''}"><div class="bw"><span class="bv">${v ? fmtV(v) : ''}</span><i data-h="${v ? Math.max(v / max * 100, 4) : 2}"></i></div><small>${labels[i]}</small></div>`).join('')}</div>`;
}
function renderProgress() {
  const p = DB.state.p, pl = plan(), t = totals(), ws = weekStart(new Date()), td = wdi(new Date());
  const keys = DN.map((_, i) => dkey(addDays(ws, i)));
  const mins = keys.map(k => day(k).m), kcals = keys.map(k => Math.round(eat(day(k)).k));
  const W = DB.state.w, cw = lastWeight(), sw = W.length ? W[0][1] : cw, diff = Math.round((cw - sw) * 10) / 10;
  const good = p.goal === 'lose' ? diff < 0 : p.goal === 'gain' ? diff > 0 : Math.abs(diff) < 1;
  const bmi = cw / Math.pow(p.h / 100, 2), bmiI = bmi < 18.5 ? 0 : bmi < 25 ? 1 : bmi < 30 ? 2 : 3;
  let chart = '<div class="empty">Записывай вес раз в несколько дней — здесь появится график</div>';
  if (W.length >= 2) {
    const pts = W.slice(-30), vs = pts.map(x => x[1]), mn = Math.min(...vs) - .5, mx = Math.max(...vs) + .5;
    const xy = pts.map((x, i) => [i / (pts.length - 1) * 290 + 5, 60 - (x[1] - mn) / (mx - mn) * 50]);
    const line = xy.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
    const lp = xy[xy.length - 1];
    chart = `<svg viewBox="0 0 300 70" style="width:100%;margin-top:12px;overflow:visible"><defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF2A3A" stop-opacity=".35"/><stop offset="1" stop-color="#FF2A3A" stop-opacity="0"/></linearGradient></defs>
      <path d="${line} L${lp[0]} 70 L5 70Z" fill="url(#wg)"/><path d="${line}" fill="none" stroke="#FF2A3A" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${lp[0]}" cy="${lp[1]}" r="5" fill="#FF2A3A"/></svg>
      <div class="rlab" style="margin-top:6px"><span>${dayLabel(pts[0][0])}</span><span>${dayLabel(pts[pts.length - 1][0])}</span></div>`;
  }
  const now = new Date(), first = new Date(now.getFullYear(), now.getMonth(), 1), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  let cal = DN.map(d => `<div class="h">${d}</div>`).join('') + '<div></div>'.repeat(wdi(first));
  for (let d = 1; d <= dim; d++) { const k = dkey(new Date(now.getFullYear(), now.getMonth(), d)); cal += `<div class="c ${k === todayKey() ? 't' : ''}"><svg class="mini" viewBox="0 0 36 36" data-k="${k}"></svg>${d}</div>`; }
  const have = new Set(DB.state.a);
  $('#v3 .st').innerHTML = `<h2 style="--i:0">Прогресс</h2>
    <div class="totals" style="--i:1"><div class="stat"><small>Тренировок</small><b>${t.w}</b></div><div class="stat"><small>Минут</small><b>${fmt(t.m)}</b></div><div class="stat"><small>Сожжено</small><b>${fmt(t.k)}</b></div></div>
    <div class="card" style="--i:2"><h3>Минуты тренировок <span>цель ${pl.min} в день</span></h3>${barsHTML(mins, pl.min, DN, td)}</div>
    <div class="card" style="--i:3"><h3>Калории <span>норма ${fmt(pl.kcal)}</span></h3>${barsHTML(kcals, pl.kcal, DN, td, v => fmt(v))}</div>
    <div class="card" style="--i:4"><h3>Вес <span class="lnk" onclick="openWeight()">+ Записать</span></h3>
      <div class="weight"><b>${fmt1(cw)} <span style="font-size:16px;color:var(--muted)">кг</span></b>
      <span class="d" style="color:${diff === 0 ? 'var(--muted)' : good ? 'var(--green)' : 'var(--orange)'}">${diff === 0 ? 'без изменений' : (diff > 0 ? '▲ +' : '▼ ') + fmt1(diff) + ' кг'}</span></div>
      <div class="sub">Цель: ${fmt1(p.tw)} кг · ИМТ ${fmt1(bmi)} — ${['дефицит', 'норма', 'избыток', 'ожирение'][bmiI]}</div>
      <div class="bmi">${['#4FC3F7', '#3DDC84', '#FF7A2F', '#FF2A3A'].map((c, i) => `<i class="${i === bmiI ? 'on' : ''}" style="background:${c}"></i>`).join('')}</div>${chart}</div>
    <div class="card" style="--i:5"><h3>${MN[now.getMonth()]} <span>кольца по дням</span></h3><div class="cal">${cal}</div></div>
    <div class="card" style="--i:6"><h3>Достижения <span>${have.size} / ${ACH.length}</span></h3><div class="badges">${ACH.map(a => `<button class="badge ${have.has(a[0]) ? 'on' : ''}" onclick="toast('${have.has(a[0]) ? '✓ ' : '🔒 '}${a[2]}')"><div class="b">${a[1]}</div>${a[2]}</button>`).join('')}</div></div>`;
  setTimeout(() => $$('#v3 .bcol i').forEach((b, i) => setTimeout(() => b.style.height = b.dataset.h + '%', (i % 7) * 50)), 60);
  $$('#v3 .cal .mini').forEach(s => { ringSVG(s, [14], 4, ['#FF2A3A']); const k = s.dataset.k; if (k <= todayKey()) { const v = ringP(k); setTimeout(() => setRings(s, [(Math.min(v[0], 1) + Math.min(v[1], 1) + Math.min(v[2], 1)) / 3]), 200); } });
}

/* ============================================================
   Профиль
   ============================================================ */
const LBL = {
  sex: {m: 'Мужской', f: 'Женский'}, goal: {lose: 'Похудеть', keep: 'Поддерживать форму', gain: 'Набрать массу'},
  act: {sit: 'Сидячий', light: 'Лёгкий', mid: 'Средний', high: 'Высокий'}, lvl: {1: 'Новичок', 2: 'Средний', 3: 'Продвинутый'}, place: {home: 'Дома', gym: 'В зале'},
};
function openProfile() {
  const p = DB.state.p, pl = plan();
  openPage(`${ptop('Профиль')}
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin:8px 0 20px">${avaHTML('ava xl')}<h2 style="margin:6px 0 0">${esc(userName())}</h2>${TGU && TGU.username ? `<div class="sub">@${esc(TGU.username)}</div>` : ''}</div>
    <h3>Твой план</h3>
    <div class="plancards">
      <div class="stat"><small>Калории в день</small><b>${fmt(pl.kcal)}</b></div><div class="stat"><small>Белки / Жиры / Углев.</small><b>${pl.p}/${pl.f}/${pl.c} <em>г</em></b></div>
      <div class="stat"><small>Вода</small><b>${pl.water} <em>стак. · ${fmt1(pl.water * .25)} л</em></b></div><div class="stat"><small>Тренировка</small><b>${pl.min} <em>мин/день</em></b></div>
    </div>
    <div class="card"><h3>Параметры</h3>
      <div class="kv"><span>Пол</span><span>${LBL.sex[p.sex]}</span></div><div class="kv"><span>Возраст</span><span>${p.age} ${plural(p.age, 'год', 'года', 'лет')}</span></div>
      <div class="kv"><span>Рост</span><span>${p.h} см</span></div><div class="kv"><span>Вес</span><span>${fmt1(p.w)} кг</span></div>
      <div class="kv"><span>Цель</span><span>${LBL.goal[p.goal]}</span></div><div class="kv"><span>Желаемый вес</span><span>${fmt1(p.tw)} кг</span></div>
      <div class="kv"><span>Активность</span><span>${LBL.act[p.act]}</span></div><div class="kv"><span>Уровень</span><span>${LBL.lvl[p.lvl]}</span></div>
      <div class="kv"><span>Где тренируюсь</span><span>${LBL.place[p.place]}</span></div><div class="kv"><span>Тренировок в неделю</span><span>${p.days}</span></div>
      <div class="kv"><span>Базовый обмен</span><span>${fmt(pl.bmr)} ккал</span></div><div class="kv"><span>Расход в день</span><span>${fmt(pl.tdee)} ккал</span></div>
    </div>
    <button class="btn" onclick="closePage();startOnboarding(true)">Изменить данные</button>
    <button class="btn line" style="margin-top:10px" onclick="resetAll()">Сбросить все данные</button>
    <p class="sub" style="text-align:center;margin-top:18px;line-height:1.5">${DB.cloudOK ? '☁️ Данные сохраняются в твоём Telegram и доступны на всех устройствах' : '📱 Данные сохраняются на этом устройстве'}<br>Samir Fit · версия 1.0</p>`);
}
function resetAll() { ask('Удалить все данные: дневник, вес, достижения и профиль?', async () => { await DB.reset(); location.reload(); }); }

/* ============================================================
   Онбординг
   ============================================================ */
let OB = null;
const OB_STEPS = ['hello', 'sex', 'goal', 'age', 'height', 'weight', 'target', 'act', 'lvl', 'place', 'days', 'result'];
const LOGO = `<svg viewBox="0 0 120 120"><defs><linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF4D5A"/><stop offset="1" stop-color="#C3001B"/></linearGradient></defs>
  <g fill="none" stroke-linecap="round" transform="rotate(-90 60 60)"><circle cx="60" cy="60" r="52" stroke="#FF2A3A" stroke-opacity=".15" stroke-width="12"/><circle cx="60" cy="60" r="52" stroke="url(#lg1)" stroke-width="12" stroke-dasharray="326.7" stroke-dashoffset="326.7"><animate attributeName="stroke-dashoffset" from="326.7" to="40" dur="1.4s" fill="freeze" calcMode="spline" keySplines=".2 .8 .2 1"/></circle>
  <circle cx="60" cy="60" r="36" stroke="#FF7A2F" stroke-opacity=".15" stroke-width="12"/><circle cx="60" cy="60" r="36" stroke="#FF7A2F" stroke-width="12" stroke-dasharray="226.2" stroke-dashoffset="226.2"><animate attributeName="stroke-dashoffset" from="226.2" to="60" dur="1.4s" begin=".15s" fill="freeze" calcMode="spline" keySplines=".2 .8 .2 1"/></circle>
  <circle cx="60" cy="60" r="20" stroke="#F2F2F2" stroke-opacity=".15" stroke-width="12"/><circle cx="60" cy="60" r="20" stroke="#F2F2F2" stroke-width="12" stroke-dasharray="125.7" stroke-dashoffset="125.7"><animate attributeName="stroke-dashoffset" from="125.7" to="20" dur="1.4s" begin=".3s" fill="freeze" calcMode="spline" keySplines=".2 .8 .2 1"/></circle></g></svg>`;
function startOnboarding(edit) {
  const p = DB.state.p;
  OB = {i: edit ? 1 : 0, edit, dir: 1, d: p ? Object.assign({}, p) : {name: (TGU && TGU.first_name) || '', sex: null, goal: null, age: 25, h: 170, w: 70, tw: 65, act: null, lvl: null, place: null, days: 3}};
  const o = $('#onb'); o.classList.remove('hidden', 'out');
  if (edit) pushBack(() => { obBack(); return false; });
  renderOb();
}
function obOpts(key, opts, cls = '') {
  return `<div class="opts ${cls}">${opts.map(([v, e, b, s]) => `<button class="opt ${OB.d[key] == v ? 'on' : ''}" onclick="obPick('${key}','${v}')">${e ? `<span class="e">${e}</span>` : ''}<div>${b ? `<b>${b}</b>` : ''}${s ? `<small>${s}</small>` : ''}</div></button>`).join('')}</div>`;
}
function obRange(key, min, max, step, unit) {
  const v = OB.d[key], fill = (v - min) / (max - min) * 100;
  return `<div class="bigval"><b id="rv">${String(v).replace('.', ',')}</b><span>${unit}</span></div>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${v}" style="--fill:${fill}%" oninput="obRangeIn(this,'${key}',${min},${max})">
    <div class="rlab"><span>${min}</span><span>${max}</span></div>`;
}
function obRangeIn(el, key, min, max) {
  const v = +el.value; OB.d[key] = v; el.style.setProperty('--fill', (v - min) / (max - min) * 100 + '%');
  $('#rv').textContent = String(v).replace('.', ','); haptic('sel');
}
function obPick(key, v) {
  OB.d[key] = ['lvl', 'days'].includes(key) ? +v : v; haptic('sel');
  if (key === 'goal') OB.d.tw = v === 'lose' ? Math.round(OB.d.w - 5) : v === 'gain' ? Math.round(OB.d.w + 5) : OB.d.w;
  renderOb(true); setTimeout(() => { if (OB && OB_STEPS[OB.i] !== 'result') obNext(); }, 260);
}
function obValid() {
  const s = OB_STEPS[OB.i], d = OB.d;
  return s === 'hello' ? !!(d.name && d.name.trim()) : s === 'sex' ? !!d.sex : s === 'goal' ? !!d.goal : s === 'act' ? !!d.act : s === 'lvl' ? !!d.lvl : s === 'place' ? !!d.place : true;
}
function renderOb(stay) {
  const s = OB_STEPS[OB.i], d = OB.d, o = $('#onb');
  let body = '', btn = 'Далее';
  if (s === 'hello') {
    body = `<div class="logo">${LOGO}<div class="wm">SAMIR <span>FIT</span></div></div>
      <h1>Привет${d.name ? ', ' + esc(d.name) : ''}! 👋</h1><p class="lead">Я — твой персональный тренер в Telegram. Ответь на несколько вопросов, и я составлю план тренировок и питания под тебя.</p>
      ${TGU && TGU.first_name ? '' : `<label class="fld"><span>Как тебя зовут?</span><input value="${esc(d.name)}" placeholder="Имя" maxlength="24" oninput="OB.d.name=this.value;$('#obNext').disabled=!this.value.trim()"></label>`}
      <div class="feat"><div><span>🏋️</span>Программы под твою цель — дома или в зале</div><div><span>🍽️</span>Подсчёт калорий, БЖУ и воды</div><div><span>🎯</span>Кольца активности и прогресс недели</div></div>`;
    btn = 'Начать';
  } else if (s === 'sex') {
    body = `<h1>Твой пол</h1><p class="lead">Нужен для точного расчёта нормы калорий</p>${obOpts('sex', [['m', '👨', 'Мужской'], ['f', '👩', 'Женский']], 'two')}`;
  } else if (s === 'goal') {
    body = `<h1>Какая у тебя цель?</h1><p class="lead">От неё зависят калории и программа</p>${obOpts('goal', [['lose', '🔥', 'Похудеть', 'Сжечь жир и стать легче'], ['keep', '⚖️', 'Поддерживать форму', 'Быть в тонусе и здоровым'], ['gain', '💪', 'Набрать массу', 'Больше мышц и силы']])}`;
  } else if (s === 'age') {
    body = `<h1>Сколько тебе лет?</h1><p class="lead">С возрастом меняется обмен веществ</p>${obRange('age', 14, 80, 1, plural(d.age, 'год', 'года', 'лет'))}`;
  } else if (s === 'height') {
    body = `<h1>Твой рост</h1><p class="lead">Передвинь ползунок</p>${obRange('h', 140, 215, 1, 'см')}`;
  } else if (s === 'weight') {
    body = `<h1>Твой вес сейчас</h1><p class="lead">Будем отслеживать прогресс от этой точки</p>${obRange('w', 40, 180, .5, 'кг')}`;
  } else if (s === 'target') {
    if (d.goal === 'lose' && d.tw >= d.w) d.tw = Math.round(d.w - 5);
    if (d.goal === 'gain' && d.tw <= d.w) d.tw = Math.round(d.w + 5);
    body = `<h1>Желаемый вес</h1><p class="lead">${d.goal === 'lose' ? 'К какому весу стремишься?' : d.goal === 'gain' ? 'Сколько хочешь весить?' : 'Вес, который хочешь удерживать'}</p>${obRange('tw', 40, 180, .5, 'кг')}`;
  } else if (s === 'act') {
    body = `<h1>Активность в течение дня</h1><p class="lead">Без учёта тренировок в приложении</p>${obOpts('act', [['sit', '🪑', 'Сидячая', 'Офис, учёба, мало движения'], ['light', '🚶', 'Лёгкая', 'Прогулки, иногда спорт'], ['mid', '🏃', 'Средняя', 'Много хожу, спорт 3–4 раза в неделю'], ['high', '⚡', 'Высокая', 'Физическая работа или спорт каждый день']])}`;
  } else if (s === 'lvl') {
    body = `<h1>Уровень подготовки</h1><p class="lead">Подберу нагрузку, чтобы было эффективно и безопасно</p>${obOpts('lvl', [['1', '🌱', 'Новичок', 'Только начинаю'], ['2', '💪', 'Средний', 'Тренируюсь время от времени'], ['3', '🔥', 'Продвинутый', 'Регулярно тренируюсь']])}`;
  } else if (s === 'place') {
    body = `<h1>Где будешь тренироваться?</h1><p class="lead">Программы можно менять в любой момент</p>${obOpts('place', [['home', '🏠', 'Дома', 'Без инвентаря'], ['gym', '🏋️', 'В зале', 'Штанга, гантели, турник']], 'two')}`;
  } else if (s === 'days') {
    body = `<h1>Сколько дней в неделю?</h1><p class="lead">Оптимально — 3–4 тренировки. Остальные дни — восстановление</p>${obOpts('days', [[2, '', '2'], [3, '', '3'], [4, '', '4'], [5, '', '5'], [6, '', '6']], 'days')}`;
  } else if (s === 'result') {
    const pl = calcPlan(d), dw = Math.abs(d.w - d.tw), weeks = Math.ceil(dw / (d.goal === 'gain' ? .25 : .5));
    body = `<h1>Твой план готов! 🎯</h1><p class="lead">${d.goal === 'keep' ? 'Держим форму и становимся сильнее.' : dw > 0 ? `Безопасный темп — ${d.goal === 'gain' ? '0,25' : '0,5'} кг в неделю. До цели ≈ ${weeks} ${plural(weeks, 'неделя', 'недели', 'недель')}.` : 'Ты уже у цели — будем её удерживать.'}</p>
      <div class="res">
        <div class="card wide"><b id="rk">0</b><small>ккал в день</small></div>
        <div class="card"><b>${pl.p} г</b><small>белки</small></div><div class="card"><b>${pl.f} г</b><small>жиры</small></div>
        <div class="card"><b>${pl.c} г</b><small>углеводы</small></div><div class="card"><b>${pl.water}</b><small>стаканов воды</small></div>
        <div class="card wide" style="padding:14px"><b style="font-size:20px">${d.days} ${plural(d.days, 'тренировка', 'тренировки', 'тренировок')} в неделю · ${LBL.place[d.place].toLowerCase()}</b><small>по ${pl.min}+ минут</small></div>
      </div>`;
    btn = OB.edit ? 'Сохранить' : 'Поехали! 🚀';
  }
  const showBack = OB.i > 0 && !(s === 'hello');
  o.innerHTML = `<div class="top">${showBack ? `<button class="back" onclick="obBack()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg></button>` : ''}
      ${s !== 'hello' ? `<div class="prog2"><i style="width:${OB.i / (OB_STEPS.length - 1) * 100}%"></i></div>` : ''}</div>
    <div class="body"><div class="slide ${OB.dir < 0 ? 'bk' : ''}" ${stay ? 'style="--x:0"' : ''}>${body}</div></div>
    <div class="foot"><button class="btn" id="obNext" onclick="obNext()" ${obValid() ? '' : 'disabled'}>${btn}</button></div>`;
  if (stay) $$('.slide>*', o).forEach(x => x.style.animation = 'none');
  if (s === 'result') countUp($('#rk'), calcPlan(d).kcal);
}
function obNext() {
  if (!obValid()) return;
  if (OB_STEPS[OB.i] === 'result') { finishOnboarding(); return; }
  OB.i++; OB.dir = 1; haptic(); renderOb();
}
function obBack() {
  if (OB.edit && OB.i <= 1) { closeOnboarding(); dropBack(); return; }
  if (OB.i <= 0) return;
  OB.i--; OB.dir = -1; haptic(); renderOb();
}
function closeOnboarding() { const o = $('#onb'); o.classList.add('out'); setTimeout(() => o.classList.add('hidden'), 500); }
function finishOnboarding() {
  const first = !DB.state.p, d = OB.d;
  const oldW = DB.state.p ? DB.state.p.w : null;
  DB.state.p = Object.assign({}, d, {name: d.name.trim() || userName(), created: d.created || todayKey()}); DB.save('p');
  if (first || oldW !== d.w) { const k = todayKey(); DB.state.w = DB.state.w.filter(x => x[0] !== k).concat([[k, d.w]]).sort((a, b) => a[0] < b[0] ? -1 : 1); DB.save('w'); }
  PLAN = null; haptic('success');
  if (OB.edit) dropBack();
  closeOnboarding(); OB = null;
  if (first) initApp(); else refresh();
  setTimeout(() => { confetti(); toast(first ? `Добро пожаловать в Samir Fit, ${userName()}! 💪` : '✓ План обновлён'); }, 400);
}

/* ============================================================
   Запуск
   ============================================================ */
let inited = false;
function initApp() {
  if (inited) { refresh(); return; }
  inited = true;
  primeRings(); renderHeader();
  $$('.tab').forEach(b => b.onclick = () => go(+b.dataset.t));
  go(0, true);
  $('#app').classList.remove('hidden');
}
async function boot() {
  if (tg) {
    try { tg.ready(); tg.expand(); } catch (e) {}
    try { if (ver('6.1')) { tg.setHeaderColor('#0A0A0B'); tg.setBackgroundColor('#0A0A0B'); } } catch (e) {}
    try { if (ver('7.10')) tg.setBottomBarColor('#0A0A0B'); } catch (e) {}
    try { if (ver('7.7')) tg.disableVerticalSwipes(); } catch (e) {}
    try { if (ver('6.1')) tg.BackButton.onClick(popBack); } catch (e) {}
  }
  $('#dim').onclick = () => closeSheet();
  DB.loadLocal(); DB.prune();
  if (DB.state.p) { $('#splash').remove(); initApp(); }
  const changed = await DB.syncCloud();
  if ($('#splash')) $('#splash').remove();
  if (DB.state.p) { if (changed) { PLAN = null; } initApp(); }
  else startOnboarding(false);
  // новый день, пока приложение открыто
  let lastDay = todayKey();
  setInterval(() => { if (todayKey() !== lastDay) { lastDay = todayKey(); if (DB.state.p && !PL) refresh(); } }, 60000);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') DB.flush(); });
boot();
