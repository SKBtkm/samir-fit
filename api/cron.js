/* GET /api/cron — раз в день (см. vercel.json) напоминает об окончании доступа */
const {tg, appUrl} = require('./_lib/tg');
const {cmd} = require('./_lib/redis');
const C = require('./_lib/core');
const S = C.S;

module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).send('no');
  if (!S.PAYWALL) return res.status(200).json({ok: true, skipped: 'paywall off'});
  const now = Date.now(), url = appUrl(req), sent = {};
  const btn = text => ({inline_keyboard: [[{text, web_app: {url}}]]});
  const windows = S.REMIND_DAYS.map(d => [d, now + (d - 1) * C.DAY, now + d * C.DAY]).concat([[0, now - C.DAY, now]]);
  for (const [d, from, to] of windows) {
    const ids = await cmd('ZRANGEBYSCORE', 'ends', `(${from}`, to);
    const users = await C.getUsers(ids || []);
    sent[d] = 0;
    for (const u of users) {
      const paid = u.until >= u.trial, end = C.endOf(u);
      let text, b;
      if (d === 0) {
        text = paid ? `⏳ Подписка на ${S.APP_NAME} закончилась.\n\nТренировки и питание закрыты, прогресс сохранён. Продли за ${S.PRICE_STARS} ⭐ — и продолжаем 💪`
          : `⏳ Пробный период ${S.APP_NAME} закончился.\n\nНадеемся, тебе понравилось! Тренировки и питание теперь по подписке — ${S.PRICE_STARS} ⭐ в месяц. Прогресс, вода и вес остаются бесплатно.`;
        b = btn('⭐ Оформить подписку');
      } else if (!paid) {
        text = `🎁 Пробный период ${S.APP_NAME} закончится через ${d} ${d === 1 ? 'день' : 'дня'} — ${C.fmtDate(end)}.\n\nЧтобы тренировки и питание остались доступны, оформи подписку: ${S.PRICE_STARS} ⭐ за 30 дней.`;
        b = btn('⭐ Оформить подписку');
      } else if (u.auto) {
        text = `🔁 Через ${d} ${d === 1 ? 'день' : 'дня'} (${C.fmtDate(end)}) заканчивается оплаченный период ${S.APP_NAME}.\n\nЕсли автопродление включено — ${S.PRICE_STARS} ⭐ спишутся автоматически, ничего делать не нужно. Управлять подпиской: Настройки Telegram → Мои звёзды.`;
        b = btn(`💪 Открыть ${S.APP_NAME}`);
      } else {
        text = `⏰ Доступ к ${S.APP_NAME} заканчивается через ${d} ${d === 1 ? 'день' : 'дня'} — ${C.fmtDate(end)}.\n\nПродли подписку, чтобы не потерять доступ к тренировкам и питанию.`;
        b = btn('⭐ Продлить подписку');
      }
      try { await tg('sendMessage', {chat_id: u.id, text, reply_markup: b}); sent[d]++; } catch (e) { /* пользователь не писал боту или заблокировал его */ }
    }
  }
  res.status(200).json({ok: true, sent});
};
