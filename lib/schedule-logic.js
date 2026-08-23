import { query } from './db';
const p2 = (n) => String(n).padStart(2, '0');

// Date خام msnodesqlv8 (مولفه‌های UTC = ساعت دیواری) -> رشته "YYYY-MM-DD HH:mm:ss"
export function dbToWall(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
}
// رشته ساعت دیواری -> Date با مولفه‌های UTC (برای محاسبات سرور)
export function wallToDate(s) {
  const m = String(s || '').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return new Date(NaN);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
}
export function nowWall() {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), n.getMinutes(), n.getSeconds()));
}
export function formatSqlDateTime(d) {
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
}
export const timeStr = (d) => `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
const parseTime = (v, def) => {
  if (v instanceof Date) return new Date(Date.UTC(1970, 0, 1, v.getUTCHours(), v.getUTCMinutes()));
  let s = v; if (!s) s = def;
  const m = String(s).match(/(\d{1,2}):(\d{2})/);
  return new Date(Date.UTC(1970, 0, 1, m ? +m[1] : 7, m ? +m[2] : 30));
};
export async function loadWorkHoursFromSettings() {
  const rows = await query(`SELECT StartWorkTime, restTimeStart, restTimeEnd, EndWorkTime FROM Set_tbl WHERE SetID = 1001`);
  const r = rows[0] || {};
  return {
    startWork: parseTime(r.StartWorkTime, '07:30'), restStart: parseTime(r.restTimeStart, '12:00'),
    restEnd: parseTime(r.restTimeEnd, '13:00'), endWork: parseTime(r.EndWorkTime, '16:00'),
  };
}