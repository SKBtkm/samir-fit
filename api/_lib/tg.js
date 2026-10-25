/* Telegram Bot API + проверка initData мини-приложения */
const crypto = require('crypto');
const TOKEN = process.env.BOT_TOKEN;

async function tg(method, params = {}) {
  if (!TOKEN) throw new Error('Не задан BOT_TOKEN');
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(params)});
  const j = await r.json();
  if (!j.ok) { const e = new Error(j.description || 'Telegram error'); e.code = j.error_code; throw e; }
  return j.result;
}

/* Возвращает пользователя Telegram, если подпись initData верна, иначе null */
function checkInitData(initData, maxAgeSec = 3 * 86400) {
  if (!initData || !TOKEN || typeof initData !== 'string') return null;
  const p = new URLSearchParams(initData);
  const hash = p.get('hash'); if (!hash) return null;
  p.delete('hash');
  const dcs = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const h = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  if (h.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hash))) return null;
  const ad = +p.get('auth_date');
  if (!ad || Date.now() / 1000 - ad > maxAgeSec) return null;
  try { const u = JSON.parse(p.get('user')); return u && u.id ? u : null; } catch (e) { return null; }
}

const appUrl = req => process.env.APP_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}/`;

module.exports = {tg, checkInitData, appUrl};
