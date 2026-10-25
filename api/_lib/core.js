/* Пользователи, доступ и подписки.
   Redis:
     u:<id>        — хэш пользователя: first, trial, until, un, fn, auto, sub, last, paid
     users         — множество всех id (для счётчика)
     un:<ник>      — id по нику
     ends          — sorted set: id → момент окончания доступа (для напоминаний и /list)
*/
const S = require('./settings');
const {cmd, pipe, toObj} = require('./redis');

const DAY = 864e5;
const PERIOD_DAYS = 30; // Telegram списывает подписку каждые 30 дней

function parse(id, h) {
  if (!h || !h.first) return null;
  return {id: String(id), first: +h.first || 0, trial: +h.trial || 0, until: +h.until || 0, un: h.un || '', fn: h.fn || '',
    auto: h.auto === '1', sub: h.sub || '', last: h.last || '', paid: +h.paid || 0};
}
const endOf = u => Math.max(u.trial, u.until);
function statusOf(u, now = Date.now()) {
  if (!S.PAYWALL) return 'free';
  if (u.until > now) return 'active';
  if (u.trial > now) return 'trial';
  return 'expired';
}
const hasAccess = s => s === 'active' || s === 'trial' || s === 'free';

async function getUser(id) { return parse(id, toObj(await cmd('HGETALL', 'u:' + id))); }
async function getUsers(ids) {
  const res = await pipe(ids.map(id => ['HGETALL', 'u:' + id]));
  return ids.map((id, i) => parse(id, toObj(res[i]))).filter(Boolean);
}
async function findId(ref) {
  ref = String(ref || '').trim().replace(/^@/, '');
  if (!ref) return null;
  if (/^\d+$/.test(ref)) return ref;
  return await cmd('GET', 'un:' + ref.toLowerCase());
}
async function save(u, fields) {
  const flat = [];
  for (const k in fields) { u[k] = fields[k]; flat.push(k, typeof fields[k] === 'boolean' ? (fields[k] ? 1 : 0) : fields[k]); }
  await pipe([['HSET', 'u:' + u.id, ...flat], ['ZADD', 'ends', endOf(u), u.id]]);
  return u;
}

/* Регистрирует пользователя при первом входе (с пробным периодом) или обновляет ник */
async function touch(from) {
  const id = String(from.id), now = Date.now();
  const un = (from.username || '').toLowerCase(), fn = [from.first_name, from.last_name].filter(Boolean).join(' ').slice(0, 64);
  let u = await getUser(id);
  if (!u) {
    u = {id, first: now, trial: now + S.TRIAL_DAYS * DAY, until: 0, un, fn, auto: false, sub: '', last: '', paid: 0};
    await pipe([
      ['HSET', 'u:' + id, 'first', u.first, 'trial', u.trial, 'until', 0, 'un', un, 'fn', fn, 'auto', 0, 'paid', 0],
      ['SADD', 'users', id], ['ZADD', 'ends', endOf(u), id],
    ].concat(un ? [['SET', 'un:' + un, id]] : []));
    u.isNew = true;
    return u;
  }
  if (u.un !== un || u.fn !== fn) {
    const c = [['HSET', 'u:' + id, 'un', un, 'fn', fn]];
    if (un) c.push(['SET', 'un:' + un, id]);
    await pipe(c); u.un = un; u.fn = fn;
  }
  return u;
}

/* Продлевает доступ на N дней. Остаток пробного/оплаченного периода сохраняется. */
async function extend(u, days, extra = {}) {
  const now = Date.now(), base = Math.max(now, u.until, u.trial);
  return save(u, Object.assign({until: base + days * DAY}, extra));
}
async function revoke(u) {
  const t = Date.now() - 1000;
  return save(u, {until: Math.min(u.until, t), trial: Math.min(u.trial, t), auto: false});
}
const count = () => cmd('SCARD', 'users').then(Number);

/* ---------- форматирование ---------- */
const fmtDate = ms => {
  const o = {timeZone: S.TZ, day: 'numeric', month: 'long'};
  if (new Date(ms).getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
  return new Date(ms).toLocaleDateString('ru-RU', o).replace(/\s?г\.$/, '');
};
const daysLeft = ms => Math.max(0, Math.ceil((ms - Date.now()) / DAY));
const who = u => (u.un ? '@' + u.un : (u.fn || 'без ника')) + ` (id ${u.id})`;
function describe(u) {
  const s = statusOf(u);
  return s === 'active' ? `✅ Подписка до ${fmtDate(u.until)} (осталось ${daysLeft(u.until)} дн.)`
    : s === 'trial' ? `🎁 Пробный период до ${fmtDate(u.trial)} (осталось ${daysLeft(u.trial)} дн.)`
    : s === 'free' ? '🆓 Приложение сейчас бесплатно для всех'
    : `⛔ Доступа нет (закончился ${fmtDate(endOf(u))})`;
}

module.exports = {DAY, PERIOD_DAYS, S, getUser, getUsers, findId, save, touch, extend, revoke, count, statusOf, hasAccess, endOf, fmtDate, daysLeft, who, describe};
