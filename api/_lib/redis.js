/* Upstash Redis через REST (без зависимостей). Переменные окружения
   создаются автоматически, когда подключаете Upstash в Vercel → Storage. */
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function cmd(...args) {
  if (!URL_ || !TOKEN) throw new Error('База данных не подключена (нет KV_REST_API_URL / KV_REST_API_TOKEN)');
  const r = await fetch(URL_, {method: 'POST', headers: {Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json'}, body: JSON.stringify(args.map(String))});
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

async function pipe(cmds) {
  if (!cmds.length) return [];
  if (!URL_ || !TOKEN) throw new Error('База данных не подключена');
  const r = await fetch(URL_.replace(/\/$/, '') + '/pipeline', {method: 'POST', headers: {Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json'}, body: JSON.stringify(cmds.map(c => c.map(String)))});
  const j = await r.json();
  return j.map(x => x.result);
}

const toObj = arr => { const o = {}; if (Array.isArray(arr)) for (let i = 0; i < arr.length; i += 2) o[arr[i]] = arr[i + 1]; return o; };

module.exports = {cmd, pipe, toObj};
