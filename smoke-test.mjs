const BASE = 'http://localhost:3000';
const get = async (p) => { const r = await fetch(BASE + p); return { r, j: await r.json().catch(() => null) }; };
const post = async (p, body) => { const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { r, j: await r.json().catch(() => null) }; };
const out = [];
const check = (n, c, x = '') => out.push(`${c ? '✅' : '❌'} ${n} ${x}`);
try {
  let { r, j } = await get('/api/load-data?type=daily');
  check('load-data daily', r.status === 200 && j?.success === true, `(ردیف: ${(j?.data || []).length})`);
  ({ r, j } = await get('/api/assets')); check('assets', r.status === 200 && j?.success === true, `(تعداد: ${(j?.data || []).length})`);
  ({ r, j } = await get('/api/persons')); check('persons', r.status === 200 && j?.success === true);
  ({ r, j } = await get('/api/base-info')); check('base-info', r.status === 200 && j?.success === true);
  ({ r, j } = await get('/api/settings')); check('settings', r.status === 200 && j?.success === true);
  ({ r, j } = await post('/api/search', { taskID: '1' })); check('search by id', r.status === 200 && j?.success === true);
  ({ r, j } = await get('/api/reports?type=tasks_list')); check('reports', r.status === 200 && j?.success === true);
  const qs = new URLSearchParams({ taskId: '1', preview: '1', priority: '3.متوسط', hours: '0', minutes: '30' });
  ({ r, j } = await get('/api/timedate?' + qs)); check('timedate preview', r.status === 200 && j?.success === true);
} catch (e) { out.push('❌ خطای کلی: ' + e.message); }
console.log(out.join('\n'));
console.log(out.some((x) => x.startsWith('❌')) ? '\n⚠️ برخی تست‌ها ناموفق بودند' : '\n🎉 همهٔ تست‌ها موفق');