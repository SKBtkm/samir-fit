/* POST /api/bot — вебхук Telegram-бота.
   Оплата звёздами (подписка), команды пользователя и администратора. */
const {tg, appUrl} = require('./_lib/tg');
const {cmd} = require('./_lib/redis');
const C = require('./_lib/core');
const S = C.S;

const h = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]));
const isAdmin = from => (process.env.ADMIN_ID && String(from.id) === String(process.env.ADMIN_ID)) ||
  (from.username && from.username.toLowerCase() === S.ADMIN_USERNAME.toLowerCase());
async function adminId() { return process.env.ADMIN_ID || await cmd('GET', 'admin_id'); }
async function notifyAdmin(text) { try { const id = await adminId(); if (id) await send(id, text); } catch (e) { console.error('notifyAdmin', e.message); } }
const openBtn = url => ({inline_keyboard: [[{text: `💪 Открыть ${S.APP_NAME}`, web_app: {url}}]]});
const send = (chat_id, text, extra = {}) => tg('sendMessage', Object.assign({chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true}, extra));

const USER_CMDS = [
  {command: 'start', description: 'Открыть приложение'},
  {command: 'status', description: 'Мой доступ и подписка'},
  {command: 'paysupport', description: 'Помощь с оплатой'},
  {command: 'terms', description: 'Условия подписки'},
];
const ADMIN_CMDS = USER_CMDS.concat([
  {command: 'give', description: '@ник дни — выдать/продлить доступ'},
  {command: 'revoke', description: '@ник — закрыть доступ'},
  {command: 'info', description: '@ник — статус пользователя'},
  {command: 'list', description: 'Активные подписчики'},
  {command: 'refund', description: '@ник — вернуть звёзды'},
  {command: 'stats', description: 'Статистика'},
  {command: 'help', description: 'Команды администратора'},
]);

const ADMIN_HELP = `<b>Команды администратора</b>

/give @ник 30 — выдать или продлить доступ на N дней
/revoke @ник — закрыть доступ (и отменить автопродление)
/info @ник — статус и дата окончания
/list — активные подписчики
/refund @ник — вернуть звёзды за последнюю оплату и закрыть доступ
/stats — сколько всего пользователей, подписчиков и на пробном

Вместо @ника можно писать числовой id. Человек должен хотя бы раз открыть приложение или бота.`;

const TERMS = `<b>Условия подписки ${h(S.APP_NAME)}</b>

• Новым пользователям — ${S.TRIAL_DAYS} дней полного доступа бесплатно.
• Подписка — ${S.PRICE_STARS} ⭐ за 30 дней, продлевается автоматически каждые 30 дней.
• Отменить автопродление можно в любой момент: Настройки Telegram → Мои звёзды → подписка ${h(S.APP_NAME)}. Доступ сохранится до конца оплаченного периода.
• Подписка открывает тренировки и питание. Прогресс, вода, вес и профиль доступны всегда.
• Вопросы по оплате: /paysupport`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('ok');
  if (process.env.CRON_SECRET && req.headers['x-telegram-bot-api-secret-token'] !== process.env.CRON_SECRET) return res.status(401).send('no');
  const upd = req.body || {};
  try {
    if (upd.pre_checkout_query) await onPreCheckout(upd.pre_checkout_query);
    else if (upd.message && upd.message.successful_payment) await onPaid(upd.message, req);
    else if (upd.message && upd.message.text && upd.message.chat.type === 'private') await onText(upd.message, req);
  } catch (e) { console.error(e); }
  res.status(200).send('ok');
};

async function onPreCheckout(q) {
  const ok = q.currency === 'XTR' && String(q.invoice_payload || '').startsWith('sub');
  await tg('answerPreCheckoutQuery', ok ? {pre_checkout_query_id: q.id, ok: true} : {pre_checkout_query_id: q.id, ok: false, error_message: 'Счёт устарел. Откройте приложение и нажмите «Оплатить» ещё раз.'});
}

async function onPaid(m, req) {
  const p = m.successful_payment, u = await C.touch(m.from);
  const extra = {last: p.telegram_payment_charge_id, paid: u.paid + 1};
  if (p.is_recurring || p.subscription_expiration_date) { extra.auto = true; if (p.is_first_recurring || !u.sub) extra.sub = p.telegram_payment_charge_id; }
  const renewal = p.is_recurring && !p.is_first_recurring;
  await C.extend(u, C.PERIOD_DAYS, extra);
  await send(m.chat.id, `✅ <b>${renewal ? 'Подписка продлена' : 'Оплата прошла!'}</b>\n\nДоступ открыт до <b>${C.fmtDate(u.until)}</b>.\nПодписка продлевается автоматически каждые 30 дней. Отменить можно в Настройках Telegram → Мои звёзды.\n\nСпасибо, что ты с нами 💪`, {reply_markup: openBtn(appUrl(req))});
  await notifyAdmin(`💰 <b>${renewal ? 'Продление' : 'Новая оплата'}</b>: ${p.total_amount} ⭐\n${h(C.who(u))} ${h(u.fn)}\nДоступ до ${C.fmtDate(u.until)}`);
}

async function onText(m, req) {
  const from = m.from, admin = isAdmin(from);
  const [raw, ...args] = m.text.trim().split(/\s+/);
  const c = raw.toLowerCase().replace(/@.*$/, '');
  if (admin) {
    const known = await cmd('GET', 'admin_id');
    if (String(known) !== String(from.id)) {
      await cmd('SET', 'admin_id', from.id);
      try { await tg('setMyCommands', {commands: ADMIN_CMDS, scope: {type: 'chat', chat_id: from.id}}); } catch (e) {}
    }
  }
  const reply = (t, x) => send(m.chat.id, t, x);

  if (c === '/start') {
    const u = await C.touch(from);
    return reply(`Привет, ${h(from.first_name || 'атлет')}! 👋\n\n<b>${h(S.APP_NAME)}</b> — тренировки, питание и прогресс прямо в Telegram.\n\n${C.describe(u)}\n\nНажми кнопку ниже, чтобы открыть приложение.${admin ? '\n\n<i>Вы администратор — список команд: /help</i>' : ''}`, {reply_markup: openBtn(appUrl(req))});
  }
  if (c === '/status') {
    const u = await C.touch(from);
    return reply(`${C.describe(u)}${u.auto && u.until > Date.now() ? '\nАвтопродление: включено' : ''}`, {reply_markup: openBtn(appUrl(req))});
  }
  if (c === '/paysupport') return reply(`По вопросам оплаты и подписки напишите @${h(S.SUPPORT_USERNAME)} — ответим и поможем.`);
  if (c === '/terms') return reply(TERMS);

  if (!admin) return reply('Нажми кнопку ниже, чтобы открыть приложение 👇', {reply_markup: openBtn(appUrl(req))});

  /* ---------- администратор ---------- */
  if (c === '/help') return reply(ADMIN_HELP);
  if (c === '/stats') return reply(await stats());
  if (c === '/list') { for (const part of await list()) await reply(part); return; }
  if (['/give', '/revoke', '/info', '/refund'].includes(c)) {
    if (!args[0]) return reply(`Укажите пользователя: <code>${c} @ник${c === '/give' ? ' 30' : ''}</code>`);
    const id = await C.findId(args[0]);
    const u = id && await C.getUser(id);
    if (!u) return reply(`Не нашёл ${h(args[0])}. Пользователь должен хотя бы раз открыть приложение или бота. Если ник менялся — используйте числовой id.`);

    if (c === '/info') {
      return reply(`👤 <b>${h(C.who(u))}</b> ${h(u.fn)}\n${C.describe(u)}\nАвтопродление: ${u.auto && u.until > Date.now() ? 'да' : 'нет'}\nОплат звёздами: ${u.paid}\nПервый вход: ${C.fmtDate(u.first)}`);
    }
    if (c === '/give') {
      const days = parseInt(args[1] || '30', 10);
      if (!(days >= 1 && days <= 3650)) return reply('Количество дней — число от 1 до 3650. Пример: <code>/give @ник 30</code>');
      await C.extend(u, days);
      try { await send(u.id, `🎁 Вам открыт доступ к ${h(S.APP_NAME)} до <b>${C.fmtDate(u.until)}</b>!`, {reply_markup: openBtn(appUrl(req))}); } catch (e) {}
      return reply(`✅ ${h(C.who(u))}: +${days} дн.\nДоступ до ${C.fmtDate(u.until)}`);
    }
    if (c === '/revoke') {
      const note = await cancelSub(u);
      await C.revoke(u);
      return reply(`⛔ Доступ ${h(C.who(u))} закрыт.${note}`);
    }
    if (c === '/refund') {
      if (!u.last) return reply(`У ${h(C.who(u))} нет оплат звёздами.`);
      try { await tg('refundStarPayment', {user_id: +u.id, telegram_payment_charge_id: u.last}); }
      catch (e) { return reply(`Не получилось вернуть звёзды: ${h(e.message)}`); }
      const note = await cancelSub(u);
      await C.revoke(u); await C.save(u, {last: ''});
      try { await send(u.id, `↩️ Звёзды за подписку ${h(S.APP_NAME)} возвращены. Доступ закрыт.`); } catch (e) {}
      return reply(`↩️ Звёзды возвращены ${h(C.who(u))}, доступ закрыт.${note}`);
    }
  }
  return reply('Неизвестная команда. Список команд: /help');
}

async function cancelSub(u) {
  if (!u.sub || !u.auto) return '';
  try { await tg('editUserStarSubscription', {user_id: +u.id, telegram_payment_charge_id: u.sub, is_canceled: true}); return '\nАвтопродление отменено.'; }
  catch (e) { return `\n(Автопродление отменить не удалось: ${h(e.message)})`; }
}

async function stats() {
  const now = Date.now(), total = await C.count();
  const ids = await cmd('ZRANGEBYSCORE', 'ends', now, '+inf');
  const users = await C.getUsers(ids || []);
  const paid = users.filter(u => u.until > now).length, trial = users.filter(u => u.until <= now && u.trial > now).length;
  return `📊 <b>Статистика</b>\n\nВсего пользователей: <b>${total}</b>\nС подпиской: <b>${paid}</b>\nНа пробном периоде: <b>${trial}</b>\nБез доступа: <b>${Math.max(0, total - paid - trial)}</b>`;
}

async function list() {
  const now = Date.now();
  const ids = await cmd('ZRANGEBYSCORE', 'ends', now, '+inf');
  const users = (await C.getUsers(ids || [])).filter(u => u.until > now).sort((a, b) => a.until - b.until);
  if (!users.length) return ['Активных подписчиков пока нет.'];
  const lines = users.map((u, i) => `${i + 1}. ${h(u.un ? '@' + u.un : u.fn || u.id)} — до ${C.fmtDate(u.until)}${u.auto ? ' 🔁' : ''}`);
  const parts = []; let cur = `<b>Подписчики: ${users.length}</b>\n🔁 — автопродление\n\n`;
  for (const l of lines) { if (cur.length + l.length > 3800) { parts.push(cur); cur = ''; } cur += l + '\n'; }
  parts.push(cur);
  return parts;
}
