/* ============================================================
   Samir Fit — доступ, пробный период и оплата звёздами.
   Статус берётся с сервера (/api/me) и кэшируется на устройстве.
   ============================================================ */
const ACC = (() => {
  const tgw = window.Telegram && window.Telegram.WebApp;
  const K = 'sf_acc', KD = 'sf_dirs';
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const st = Object.assign({status: 'unknown', price: 219, count: 0, trialDays: 30, support: 'sahatmuradov'}, ls.get(K) || {});
  let dirs = ls.get(KD);
  const cachedOk = () => !!st.end && st.end > Date.now();
  const initData = () => (tgw && tgw.initData) || '';

  async function post(url, timeout = 9000) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({initData: initData()}), signal: ctl.signal});
      const j = await r.json().catch(() => ({ok: false}));
      j.httpStatus = r.status; return j;
    } finally { clearTimeout(t); }
  }

  async function check() {
    if (!initData()) { st.status = 'noauth'; return st; }
    try {
      const j = await post('/api/me');
      if (!j.ok) {
        if (j.httpStatus === 401) st.status = 'noauth';
        else if (!cachedOk()) st.status = 'offline';
        return st;
      }
      const skew = Date.now() - (j.now || Date.now()); // поправка на часы телефона
      const fix = v => v > 0 ? v + skew : 0;
      Object.assign(st, {status: j.status, trialEnd: fix(j.trialEnd), until: fix(j.until), end: fix(j.end), auto: j.auto,
        isNew: j.isNew, price: j.price, trialDays: j.trialDays, support: j.support, count: j.count, synced: Date.now()});
      if (j.dirs) { dirs = j.dirs; ls.set(KD, dirs); } else { dirs = null; ls.del(KD); }
      const save = Object.assign({}, st); delete save.isNew; ls.set(K, save);
    } catch (e) {
      if (!cachedOk() && (st.status === 'unknown' || st.status === 'noauth')) st.status = 'offline';
    }
    return st;
  }

  /* есть ли доступ к тренировкам и питанию */
  function has() {
    if (st.status === 'free' || st.status === 'unknown') return true;
    if (st.status === 'active' || st.status === 'trial') return !st.end || st.end > Date.now();
    if (st.status === 'offline') return cachedOk() || !st.synced; // сервер недоступен: новый пользователь не блокируется
    return false;
  }
  const daysLeft = () => Math.max(0, Math.ceil(((st.status === 'trial' ? st.trialEnd : st.end) - Date.now()) / 864e5));
  const wasPaid = () => (st.until || 0) > 0;

  let paying = false;
  async function pay() {
    if (paying) return;
    if (!initData()) { toast('Открой Samir Fit через Telegram-бота'); return; }
    if (!ver('6.1') || !tgw.openInvoice) { toast('Обнови Telegram, чтобы оплатить звёздами'); return; }
    paying = true; haptic('medium');
    try {
      const j = await post('/api/invoice');
      if (!j.ok) { toast(j.error === 'already' ? '✓ Подписка уже активна' : 'Не удалось создать счёт. Попробуй ещё раз'); return; }
      tgw.openInvoice(j.link, async status => {
        if (status === 'paid') {
          haptic('success'); toast('⭐ Оплата прошла! Открываю доступ…');
          for (let i = 0; i < 10; i++) { await new Promise(r => setTimeout(r, 1500)); await check(); if (st.status === 'active') break; }
          if (typeof onAccessChange === 'function') onAccessChange(true);
        } else if (status === 'failed') { haptic('error'); toast('Оплата не прошла'); }
      });
    } catch (e) { toast('Нет связи с сервером. Попробуй ещё раз'); }
    finally { paying = false; }
  }

  function requestWrite() {
    try { if (ver('6.9') && tgw.requestWriteAccess) tgw.requestWriteAccess(() => {}); } catch (e) {}
  }

  return {state: st, check, has, pay, daysLeft, wasPaid, requestWrite, dirs: () => dirs, flag: {
    get: k => ls.get('sf_f_' + k), set: (k, v) => ls.set('sf_f_' + k, v)}};
})();
