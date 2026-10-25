/* POST /api/invoice {initData} — ссылка на оплату подписки звёздами (автопродление каждые 30 дней) */
const {tg, checkInitData} = require('./_lib/tg');
const {cmd} = require('./_lib/redis');
const C = require('./_lib/core');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ok: false});
  try {
    const from = checkInitData((req.body || {}).initData);
    if (!from) return res.status(401).json({ok: false, error: 'auth'});
    const u = await C.touch(from);
    if (u.auto && u.until > Date.now()) return res.status(200).json({ok: false, error: 'already', until: u.until});
    // ссылка одна на всех: кто оплатил — определяет Telegram (message.from)
    const key = 'invoice:' + C.S.PRICE_STARS;
    let link = await cmd('GET', key);
    if (!link) {
      link = await tg('createInvoiceLink', {
        title: `${C.S.APP_NAME} — подписка`,
        description: `Полный доступ к тренировкам и питанию на 30 дней. Продлевается автоматически каждые 30 дней, отменить можно в любой момент.`,
        payload: 'sub1', currency: 'XTR',
        prices: [{label: 'Подписка на 30 дней', amount: C.S.PRICE_STARS}],
        subscription_period: C.PERIOD_DAYS * 86400,
      });
      await cmd('SET', key, link);
    }
    res.status(200).json({ok: true, link});
  } catch (e) {
    console.error(e);
    res.status(500).json({ok: false, error: 'server'});
  }
};
