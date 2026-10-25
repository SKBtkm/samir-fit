/* ============================================================
   Samir Fit — хранение данных
   Telegram CloudStorage (синхронизация между устройствами)
   + localStorage как мгновенный кэш / запасной вариант.
   Ключи: p — профиль, w — вес, a — достижения, r — недавние продукты,
          dYYYYMMDD — дневник за день.
   ============================================================ */
const DB = (() => {
  const tg = window.Telegram && window.Telegram.WebApp;
  let cloudOK = false;
  try { cloudOK = !!(tg && tg.initData && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast('6.9')); } catch (e) {}
  const LP = 'sf_';
  const ls = {
    get(k) { try { return localStorage.getItem(LP + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(LP + k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(LP + k); } catch (e) {} },
    keys() { try { return Object.keys(localStorage).filter(k => k.startsWith(LP)).map(k => k.slice(LP.length)); } catch (e) { return []; } },
  };
  const cloud = {
    keys: () => new Promise(r => { try { tg.CloudStorage.getKeys((e, k) => r(e ? [] : (k || []))); } catch (x) { r([]); } }),
    get: ks => new Promise(r => { try { tg.CloudStorage.getItems(ks, (e, v) => r(e ? {} : (v || {}))); } catch (x) { r({}); } }),
    set: (k, v) => new Promise(r => { try { tg.CloudStorage.setItem(k, v, e => r(!e)); } catch (x) { r(false); } }),
    del: ks => new Promise(r => { try { tg.CloudStorage.removeItems(ks, e => r(!e)); } catch (x) { r(false); } }),
  };

  const state = {p: null, d: {}, w: [], a: [], r: []};
  const stamp = {};
  const parse = s => { try { return JSON.parse(s); } catch (e) { return null; } };
  const valid = k => k === 'p' || k === 'w' || k === 'a' || k === 'r' || /^d\d{8}$/.test(k);

  function apply(k, o) {
    if (!o || typeof o !== 'object' || !('v' in o)) return;
    stamp[k] = o.u || 0;
    if (k[0] === 'd') state.d[k.slice(1)] = o.v; else state[k] = o.v;
  }
  function valueOf(k) { return k[0] === 'd' ? state.d[k.slice(1)] : state[k]; }

  function loadLocal() { ls.keys().filter(valid).forEach(k => apply(k, parse(ls.get(k)))); }

  async function syncCloud() {
    if (!cloudOK) return false;
    try {
      const keys = (await cloud.keys()).filter(valid);
      const vals = {};
      for (let i = 0; i < keys.length; i += 50) Object.assign(vals, await cloud.get(keys.slice(i, i + 50)));
      let changed = false;
      for (const k of keys) {
        const c = parse(vals[k]);
        if (!c) continue;
        if ((c.u || 0) > (stamp[k] || 0)) { apply(k, c); ls.set(k, vals[k]); changed = true; }
      }
      // отправляем в облако то, чего там нет или что новее локально
      for (const k of ls.keys().filter(valid)) {
        const c = parse(vals[k]);
        if (!c || (stamp[k] || 0) > (c.u || 0)) await cloud.set(k, ls.get(k));
      }
      return changed;
    } catch (e) { return false; }
  }

  const timers = {}, pending = {};
  function serialize(k) {
    let v = valueOf(k);
    let s = JSON.stringify({u: Date.now(), v});
    // лимит Telegram — 4096 символов на значение
    if (s.length > 4000 && k[0] === 'd' && v && v.f) {
      v.f.forEach(x => { x[1] = String(x[1]).slice(0, 18); });
      s = JSON.stringify({u: Date.now(), v});
    }
    if (s.length > 4000 && k === 'w') { state.w = state.w.slice(-150); s = JSON.stringify({u: Date.now(), v: state.w}); }
    if (s.length > 4000 && k === 'r') { state.r = state.r.slice(0, 20); s = JSON.stringify({u: Date.now(), v: state.r}); }
    return s;
  }
  function save(k) {
    const s = serialize(k);
    stamp[k] = parse(s).u;
    ls.set(k, s);
    if (cloudOK) { clearTimeout(timers[k]); pending[k] = s; timers[k] = setTimeout(() => { delete pending[k]; cloud.set(k, s); }, 500); }
  }
  function flush() { for (const k in pending) { clearTimeout(timers[k]); cloud.set(k, pending[k]); delete pending[k]; } }

  function prune(keepDays = 200) {
    const lim = new Date(); lim.setDate(lim.getDate() - keepDays);
    const limKey = '' + lim.getFullYear() + String(lim.getMonth() + 1).padStart(2, '0') + String(lim.getDate()).padStart(2, '0');
    const old = Object.keys(state.d).filter(d => d < limKey);
    old.forEach(d => { delete state.d[d]; ls.del('d' + d); });
    if (cloudOK && old.length) cloud.del(old.map(d => 'd' + d));
  }

  async function reset() {
    const keys = ls.keys(); keys.forEach(k => ls.del(k));
    if (cloudOK) { const ck = await cloud.keys(); for (let i = 0; i < ck.length; i += 50) await cloud.del(ck.slice(i, i + 50)); }
    state.p = null; state.d = {}; state.w = []; state.a = []; state.r = [];
  }

  return {state, loadLocal, syncCloud, save, prune, reset, flush, get cloudOK() { return cloudOK; }};
})();
