'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { INSPECTION_COLUMNS, inspectionSearchText, readInspectionSearch } from '@/lib/task-inspector-filters';
import { formatWallTime, parseTaskId } from '@/lib/task-inspection';

function ColumnFilter({ column, filters, onApply, onClose }) {
  const [values, setValues] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const visible = values.filter((value) => inspectionSearchText(value).includes(inspectionSearchText(text)));
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    readInspectionSearch({ mode: 'options', field: column.key, filters }, controller.signal).then((data) => {
      if (!active) return;
      if (!Array.isArray(data.values) || data.values.some((value) => typeof value !== 'string')) throw new Error('پاسخ گزینه‌های فیلتر معتبر نیست.');
      const options = [...new Set(data.values)]; setValues(options);
      setPicked(new Set(filters[column.key] ?? options));
    }).catch((reason) => { if (active && reason.name !== 'AbortError') setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    inputRef.current?.focus();
    return () => { active = false; controller.abort(); };
  }, []);
  const apply = (event) => {
    event.preventDefault(); event.stopPropagation();
    if (loading || error) return;
    const selected = visible.filter((value) => picked.has(value));
    // تنها «همهٔ گزینه‌ها بدون متن جستجو» به معنی حذف فیلتر است؛ صفر تطبیق یعنی نتیجهٔ خالی.
    onApply(!inspectionSearchText(text) && selected.length === values.length && values.length ? null : selected);
  };
  return <div className="fixed inset-0 flex items-center justify-center p-3" style={{ zIndex: 100060 }}
    onMouseDown={(event) => { event.stopPropagation(); if (event.button === 0 && event.target === event.currentTarget) onClose(); }}
    onClick={(event) => event.stopPropagation()}>
    <form onSubmit={apply} role="dialog" aria-label={`فیلتر ${column.label}`} dir="rtl"
      className="rounded-lg shadow-2xl border border-teal-700 bg-white p-3 text-sm"
      style={{ width: 350, maxWidth: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', color: '#134e4a' }}>
      <div className="flex justify-between items-center gap-2 mb-2"><strong>فیلتر {column.label}</strong>
        <button type="button" aria-label="بستن فیلتر" onClick={onClose}>✕</button></div>
      <input ref={inputRef} className="search-input w-full" aria-label={`جستجو در ${column.label}`} value={text}
        onChange={(event) => {
          const next = event.target.value; setText(next);
          setPicked(new Set(values.filter((value) => inspectionSearchText(value).includes(inspectionSearchText(next)))));
        }} placeholder="بنویسید و Enter یا اعمال فیلتر را بزنید" />
      {loading ? <p role="status" className="p-2">دریافت گزینه‌ها…</p> : error ? <p role="alert" className="p-2 text-red-800">{error}</p> : <>
        <label className="flex gap-2 p-2"><input type="checkbox" aria-label="انتخاب همهٔ نتایج فیلتر"
          checked={visible.length > 0 && visible.every((value) => picked.has(value))}
          onChange={(event) => setPicked((previous) => {
            const next = new Set(previous); visible.forEach((value) => event.target.checked ? next.add(value) : next.delete(value)); return next;
          })} /> (انتخاب همه) — {visible.length} گزینه</label>
        <div className="overflow-auto border rounded p-2" style={{ minHeight: 80, maxHeight: '40vh' }}>
          {!visible.length && <p>گزینه‌ای مطابق متن پیدا نشد.</p>}
          {visible.map((value) => <label key={value} className="flex items-start gap-2 py-1 break-words">
            <input type="checkbox" checked={picked.has(value)} onChange={() => setPicked((previous) => {
              const next = new Set(previous); next.has(value) ? next.delete(value) : next.add(value); return next;
            })} /><span style={{ overflowWrap: 'anywhere' }}>{value}</span></label>)}
        </div></>}
      <div className="flex flex-wrap gap-2 mt-3">
        <button type="submit" className="btn-success" disabled={loading || !!error}>اعمال فیلتر</button>
        <button type="button" className="btn-primary" onClick={() => onApply(null)}>حذف فیلتر ستون</button>
        <button type="button" className="btn-danger" onClick={onClose}>انصراف</button>
      </div>
    </form>
  </div>;
}

const TaskInspectionTable = forwardRef(function TaskInspectionTable({ onSelect, onResultsChange, selectedId }, ref) {
  const [filters, setFilters] = useState({});
  const [started, setStarted] = useState(false);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ rows: [], total: 0, page: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(null);
  const menuRef = useRef(null), generationRef = useRef(0), abortRef = useRef(null);
  const invalidate = () => { generationRef.current++; abortRef.current?.abort(); abortRef.current = null; };
  const closeMenu = () => { const wasOpen = !!menuRef.current; menuRef.current = null; setMenu(null); return wasOpen; };
  useImperativeHandle(ref, () => ({ closeFilter: closeMenu }), []);
  useEffect(() => {
    if (!started) return;
    const token = ++generationRef.current;
    const controller = new AbortController(); abortRef.current = controller;
    setLoading(true); setError(''); setResult({ rows: [], total: 0, page });
    readInspectionSearch({ mode: 'rows', filters, page, pageSize: 20 }, controller.signal).then((data) => {
      if (token !== generationRef.current) return;
      if (!Array.isArray(data.rows) || !Number.isSafeInteger(data.total) || data.total < 0 || !Number.isSafeInteger(data.page) || data.page < 1 || data.rows.some((row) => !parseTaskId(row.TaskID)) || data.rows.some((row, i) => i && Number(data.rows[i - 1].TaskID) <= Number(row.TaskID))) throw new Error('پاسخ جدول جستجو معتبر نیست.');
      setResult({ rows: data.rows, total: data.total, page: data.page });
    }).catch((reason) => { if (token === generationRef.current && reason.name !== 'AbortError') setError(reason.message); })
      .finally(() => { if (token === generationRef.current) setLoading(false); });
    return () => { generationRef.current++; controller.abort(); };
  }, [filters, page, started]);
  const change = (next, nextStarted = true) => {
    invalidate(); onResultsChange(); closeMenu(); setFilters(next); setPage(1); setStarted(nextStarted);
    setResult({ rows: [], total: 0, page: 1 }); setError(''); setLoading(false);
  };
  const turnPage = (next) => { invalidate(); onResultsChange(); setPage(next); };
  const pages = Math.max(1, Math.ceil(result.total / 20));
  const cell = (row, key) => {
    if (key === 'status') return Number(row.Complited) === 1 ? 'اتمام' : 'جاری';
    if (key === 'DueDateTime' || key === 'EndDateTime') return formatWallTime(row[key]);
    return row[key] == null || row[key] === '' ? '—' : String(row[key]);
  };
  return <section aria-label="جستجوی مستقل کارها" className="mb-5">
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <button type="button" className="btn-primary" onClick={() => change({})}>نمایش همهٔ کارها</button>
      <button type="button" className="btn-danger" onClick={() => change({}, false)}>پاک‌کردن جستجو</button>
      <span className="text-xs">سرستون را بزنید؛ نتایج در تمام صفحات با کد کار نزولی مرتب می‌شوند.</span>
    </div>
    {Object.keys(filters).length > 0 && <div className="flex flex-wrap gap-2 mb-2" aria-label="فیلترهای فعال">
      {Object.entries(filters).map(([key, values]) => <button key={key} type="button" className="rounded bg-teal-800 text-white px-2 py-1 text-xs"
        onClick={() => { const next = { ...filters }; delete next[key]; change(next); }}>
        {INSPECTION_COLUMNS.find((column) => column.key === key)?.label}: {values.length ? values.join('، ') : 'بدون تطبیق'} ×
      </button>)}
    </div>}
    <div className="overflow-auto rounded border border-teal-700/30" style={{ maxHeight: '42vh' }}>
      <table className="border-collapse text-sm w-full" style={{ minWidth: 1600 }} aria-label="نتایج جستجوی کارها">
        <thead className="bg-teal-800 text-white sticky top-0"><tr>
          <th scope="col" className="p-2">ردیف</th>
          {INSPECTION_COLUMNS.map((column) => <th scope="col" key={column.key} className="border border-teal-600 p-2 whitespace-nowrap text-right">
            {column.filterable ? <button type="button" className="w-full text-right" aria-label={`فیلتر ${column.label}`} aria-haspopup="dialog"
              onClick={() => { menuRef.current = column.key; setMenu(column); }}>{column.label} {Object.hasOwn(filters, column.key) ? '●' : '▾'}</button> : column.label}
          </th>)}
        </tr></thead>
        <tbody>{result.rows.map((row, index) => <tr key={row.TaskID} className={Number(selectedId) === Number(row.TaskID) ? 'bg-teal-200' : index % 2 ? 'bg-teal-50' : 'bg-white/90'}
          style={{ cursor: 'pointer' }} onClick={() => onSelect(row.TaskID)}>
          <td className="border border-teal-700/20 p-2">{(result.page - 1) * 20 + index + 1}</td>
          {INSPECTION_COLUMNS.map((column) => <td key={column.key} className="border border-teal-700/20 p-2" style={{ maxWidth: 300, overflowWrap: 'anywhere' }}>
            {column.key === 'TaskID' ? <button type="button" aria-label={`مشاهدهٔ کار ${row.TaskID}`} className="underline font-bold"
              onClick={(event) => { event.stopPropagation(); onSelect(row.TaskID); }}>{row.TaskID}</button> : cell(row, column.key)}
          </td>)}
        </tr>)}
        {!result.rows.length && <tr><td colSpan={INSPECTION_COLUMNS.length + 1} className="bg-white/80 p-4">
          {loading ? 'در حال جستجو…' : error ? 'دریافت نتایج ناموفق بود.' : started ? 'کاری مطابق فیلترها پیدا نشد.' : 'برای پیدا کردن کار، از فیلتر سرستون‌ها استفاده کنید یا «نمایش همهٔ کارها» را بزنید.'}
        </td></tr>}
        </tbody>
      </table>
    </div>
    {error && <p role="alert" className="p-2 bg-red-100 text-red-900">{error}</p>}
    {loading && <p role="status" className="text-sm mt-2">در حال دریافت نتایج…</p>}
    {started && !loading && !error && <div className="flex items-center flex-wrap gap-3 mt-2 text-sm">
      <span>{result.total} کار — صفحهٔ {result.page} از {pages}</span>
      <button type="button" className="btn-primary" disabled={result.page <= 1} onClick={() => turnPage(result.page - 1)}>صفحهٔ قبل</button>
      <button type="button" className="btn-primary" disabled={result.page >= pages} onClick={() => turnPage(result.page + 1)}>صفحهٔ بعد</button>
    </div>}
    {menu && <ColumnFilter key={menu.key} column={menu} filters={filters} onClose={closeMenu} onApply={(values) => {
      const next = { ...filters }; if (values === null) delete next[menu.key]; else next[menu.key] = values; change(next);
    }} />}
  </section>;
});
export default TaskInspectionTable;
