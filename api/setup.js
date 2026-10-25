/* GET /api/setup?key=<CRON_SECRET> — одноразовая настройка бота:
   вебхук, меню команд, кнопка «Открыть» внизу чата. Можно запускать повторно. */
const {tg, appUrl} = require('./_lib/tg');
const {cmd} = require('./_lib/redis');
const S = require('./_lib/settings');

module.exports = async (req, res) => {
  const key = (req.query || {}).key;
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) return res.status(401).send('Неверный ключ. Откройте /api/setup?key=ВАШ_CRON_SECRET');
  const host = req.headers['x-forwarded-host'] || req.headers.host, url = appUrl(req), report = {};
  const step = async (name, fn) => { try { report[name] = await fn() || 'ok'; } catch (e) { report[name] = 'ОШИБКА: ' + e.message; } };
  await step('База данных', async () => { await cmd('PING'); return 'подключена'; });
  await step('Вебхук', () => tg('setWebhook', {url: `https://${host}/api/bot`, secret_token: process.env.CRON_SECRET, allowed_updates: ['message', 'pre_checkout_query']}).then(() => `https://${host}/api/bot`));
  await step('Команды', () => tg('setMyCommands', {commands: [
    {command: 'start', description: 'Открыть приложение'}, {command: 'status', description: 'Мой доступ и подписка'},
    {command: 'paysupport', description: 'Помощь с оплатой'}, {command: 'terms', description: 'Условия подписки'}]}));
  await step('Кнопка меню', () => tg('setChatMenuButton', {menu_button: {type: 'web_app', text: 'Открыть', web_app: {url}}}).then(() => url));
  await step('Бот', () => tg('getMe').then(b => '@' + b.username));
  const ok = Object.values(report).every(v => !String(v).startsWith('ОШИБКА'));
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:16px system-ui;padding:20px;background:#0A0A0B;color:#F5F5F7">
    <h2>${ok ? '✅ Бот настроен' : '⚠️ Есть ошибки'}</h2>${Object.entries(report).map(([k, v]) => `<p><b>${k}:</b> ${String(v).replace(/</g, '&lt;')}</p>`).join('')}
    <p style="color:#8E8E93">Теперь отправьте боту /start со своего аккаунта @${S.ADMIN_USERNAME} — он запомнит вас как администратора.</p></body>`);
};
