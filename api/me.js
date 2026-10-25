/* POST /api/me {initData} — регистрирует пользователя и возвращает статус доступа.
   Платные программы (направления) отдаются только при активном доступе. */
const {checkInitData} = require('./_lib/tg');
const C = require('./_lib/core');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ok: false});
  try {
    const from = checkInitData((req.body || {}).initData);
    if (!from) return res.status(401).json({ok: false, error: 'auth'});
    const u = await C.touch(from);
    const status = C.statusOf(u);
    const out = {ok: true, status, trialEnd: u.trial, until: u.until, end: C.endOf(u), auto: u.auto, isNew: !!u.isNew,
      price: C.S.PRICE_STARS, trialDays: C.S.TRIAL_DAYS, support: C.S.SUPPORT_USERNAME, count: await C.count(), now: Date.now()};
    if (C.hasAccess(status)) out.dirs = require('./_lib/programs');
    res.status(200).json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ok: false, error: 'server'});
  }
};
