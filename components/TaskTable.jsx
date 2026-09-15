'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { isCentral } from '@/lib/assetRules';
import Tip from './Tip';

const assetSpec = (t) =>
  t.AssetName
    ? `${t.AssetName}، قسمت: ${t.Location || '-'} (ساختمان ${t.Building || '-'}، بلوک: ${t.Block || '-'}، طبقه: ${t.Floor ?? '-'}، ورودی: ${t.Entrance || '-'}) شماره: ${t.AssetNumber ?? '-'} [کد:${t.AssetID}]`
    : '';

const COLUMNS = [
  { key: 'row',          label: 'ردیف',          sortable: false, filterable: false },
  { key: 'TaskID',       label: 'کد کار',        sortable: true,  filterable: true,  source: 'task' },
  { key: 'AssetName',    label: 'دستگاه/مجموعه', sortable: true,  filterable: true,  assignable: true, source: 'asset' },
  { key: 'AssetNumber',  label: 'شماره',         sortable: true,  filterable: true,  source: 'asset' },
  { key: 'Building',     label: 'ساختمان',       sortable: true,  filterable: true,  assignable: true, source: 'asset' },
  { key: 'Location',     label: 'قسمت',          sortable: true,  filterable: true,  assignable: true, source: 'asset' },
  { key: 'TaskTtl',      label: 'موضوع',         sortable: true,  filterable: true,  assignable: true, source: 'task' },
  { key: 'Descriptions', label: 'توضیحات',       sortable: false, filterable: false, source: 'task' },
  { key: 'Priorities',   label: 'اولویت',        sortable: true,  filterable: true,  source: 'task' },
  { key: 'status',       label: 'وضعیت',         sortable: true,  filterable: true,  source: 'task' },
  { key: 'DueDateTime',  label: 'زمان شروع',     sortable: true,  filterable: false },
  { key: 'EndDateTime',  label: 'زمان پایان',    sortable: true,  filterable: false },
  { key: 'attachments',  label: 'ضمائم',         sortable: false, filterable: false },
  { key: 'actions',      label: 'عملیات',        sortable: false, filterable: false },
];

const PLACE_COLS = [
  { key: 'Block', label: 'بلوک', source: 'asset', assignable: true },
  { key: 'Floor', label: 'طبقه', source: 'asset', assignable: true },
  { key: 'Entrance', label: 'ورودی', source: 'asset', assignable: true },
  { key: 'MechSystem', label: 'سیستم', source: 'asset', assignable: true },
];

export default function TaskTable({
  tasks, startNumber = 0, onRowClick, onComplete, onEdit, onFolder, selectedTask,
  draft, onDraftChange, onDraftAssign, onDraftSave, onDraftFinish, onDraftCancel, onDraftDeviceMissing,
  activeFilters = {}, onFiltersChange,
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [filters, setFilters] = useState(() => {
    // تبدیل activeFilters از page.js به فرمت داخلی
    const f = {};
    for (const [k, v] of Object.entries(activeFilters)) {
      f[k] = new Set(v);
    }
    return f;
  });
  const [menu, setMenu] = useState(null);
  const [menuValues, setMenuValues] = useState(null);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuQuery, setMenuQuery] = useState('');

  // ✅ همگام‌سازی فیلترها با page.js
  useEffect(() => {
    if (onFiltersChange) onFiltersChange(filters);
  }, [filters, onFiltersChange]);

  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('.col-menu') && !e.target.closest('.col-menu-btn')) setMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fmtFa = (v) => (v ? new Date(v).toLocaleString('fa-IR', { timeZone: 'UTC' }) : '-');
  const draftActive = draft != null;
  const centralDraft = isCentral(draft?.Building);

  const loadMenuValues = async (col) => {
    setMenuLoading(true);
    setMenuValues(null);
    if (col.key === 'status') { setMenuValues(['جاری', 'اتمام']); setMenuLoading(false); return; }
    let constraints = {};
    if (draftActive) {
      constraints = {
        AssetName: draft.AssetName, AssetNumber: draft.AssetNumber, Building: draft.Building,
        Block: draft.Block, Floor: draft.Floor, Entrance: draft.Entrance, Location: draft.Location,
        MechSystem: draft.MechSystem, TaskTtl: draft.TaskTtl, Priorities: draft.Priorities,
      };
      delete constraints[col.key];
      constraints = Object.fromEntries(Object.entries(constraints).filter(([, v]) => String(v ?? '').trim() !== ''));
    } else {
      // ✅ فیلتر آبشاری: محدودکردن گزینه‌ها بر اساس فیلترهای فعال دیگر
      for (const [k, v] of Object.entries(filters)) {
        if (v === null || v.size === 0 || k === col.key) continue;
        const vals = Array.from(v);
        if (vals.length === 1) constraints[k] = vals[0];
      }
    }
    try {
      const res = await fetch('/api/options', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: col.key, source: col.source || 'task', constraints }),
      });
      const d = await res.json();
      setMenuValues(d.success ? d.values : []);
    } catch { setMenuValues([]); }
    setMenuLoading(false);
  };

  const openMenu = (e, col) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const next = (menu && menu.key === col.key) ? null : { key: col.key, y: Math.min(r.bottom + 2, window.innerHeight - 340), right: window.innerWidth - r.right };
    setMenuQuery('');
    setMenu(next);
    if (next && (col.filterable || col.assignable)) loadMenuValues(col);
  };

  const toggleSort = (key) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey(null); setSortDir('asc'); }
    } else { setSortKey(key); setSortDir('asc'); }
  };

  const isChecked = (key, v) => filters[key] == null || filters[key].has(v);
  const allChecked = (key) => filters[key] == null;
  const toggleFilterValue = (key, value) => {
    setFilters((prev) => {
      let cur = prev[key];
      if (cur == null) cur = new Set(menuValues || []);
      const next = new Set(cur);
      if (next.has(value)) next.delete(value); else next.add(value);
      return { ...prev, [key]: next };
    });
  };
  const setAllChecked = (key, checked) => setFilters((prev) => ({ ...prev, [key]: checked ? null : new Set() }));
  const clearFilter = (key) => setFilters((prev) => ({ ...prev, [key]: null }));

  // ✅ مرتب‌سازی فقط روی نتایج فعلی صفحه
  const sorted = [...(tasks || [])].sort((a, b) => {
    if (!sortKey) return 0;
    let av, bv;
    if (sortKey === 'status') { av = Number(a.Complited); bv = Number(b.Complited); }
    else { av = a[sortKey]; bv = b[sortKey]; }
    if (av == null) av = '';
    if (bv == null) bv = '';
    if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
    const cmp = String(av).localeCompare(String(bv), 'fa', { numeric: true });
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const hasAnyFilter = !draftActive && Object.values(filters).some((s) => s != null && s.size > 0);

  const draftCell = (key, ph) => (
    <td className="draft-cell">
      <div className="draft-cell-wrap">
        <input className="draft-input" value={draft[key] != null ? String(draft[key]) : ''} placeholder={ph}
          onChange={(e) => onDraftChange(key, e.target.value)}
          onClick={(e) => { const col = COLUMNS.find((c) => c.key === key); if (col) openMenu(e, col); }} />
        <button type="button" className="col-menu-btn" title="گزینه‌ها از کل دیتابیس"
          onClick={(e) => { const col = COLUMNS.find((c) => c.key === key); if (col) openMenu(e, col); }}>▾</button>
      </div>
    </td>
  );

  const draftPlaceCell = (col) => {
    const disabled = (col.key === 'Block' || col.key === 'Entrance') ? !centralDraft : false;
    return (
      <td className="draft-cell">
        <div className="draft-cell-wrap">
          <input className="draft-input" value={draft[col.key] != null ? String(draft[col.key]) : ''} placeholder={col.label} disabled={disabled}
            onChange={(e) => onDraftChange(col.key, e.target.value)}
            onClick={(e) => { if (!disabled) openMenu(e, col); }} />
          {!disabled && (
            <button type="button" className="col-menu-btn" title="گزینه‌ها از کل دیتابیس" onClick={(e) => openMenu(e, col)}>▾</button>
          )}
        </div>
      </td>
    );
  };

  if (!tasks || tasks.length === 0)
    return (
      <div className="h-full flex items-center justify-center text-gray-600 bg-[#b4a9b0] rounded-lg shadow-lg">
        کاری یافت نشد
      </div>
    );

  const menuCol = menu ? (COLUMNS.find((c) => c.key === menu.key) || PLACE_COLS.find((c) => c.key === menu.key)) : null;
  const shownValues = (menuValues || []).filter((v) => !menuQuery || String(v).includes(menuQuery));

  return (
    <div className="h-full overflow-auto overscroll-contain rounded-lg shadow-lg bg-[#b4a9b0]">
      <table className="task-table w-full min-w-[1300px]">
        <thead>
          <tr>
            {COLUMNS.map((col) => {
              const isFiltered = !draftActive && filters[col.key] != null && filters[col.key].size > 0;
              const isSorted = sortKey === col.key;
              const isOpen = menu && menu.key === col.key;
              return (
                <th key={col.key}>
                  <div className="flex items-center justify-between gap-1">
                    <span>{col.label}</span>
                    {(col.sortable || col.filterable) && (
                      <button type="button" onClick={(e) => openMenu(e, col)}
                        className={`col-menu-btn ${isFiltered || isSorted || isOpen ? 'active' : ''}`}
                        title={draftActive ? 'انتخاب برای کار جدید' : 'مرتب‌سازی / فیلتر'}>
                        {isSorted ? (sortDir === 'asc' ? '▲' : '▼') : (isFiltered ? '🔽' : '⋮')}
                      </button>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {draftActive && (
            <tr className="draft-row">
              <td>—</td>
              <td><span className="draft-badge">پیش‌نویس</span></td>
              {draftCell('AssetName', 'دستگاه/مجموعه')}
              {draftCell('AssetNumber', 'شماره')}
              {draftCell('Building', 'ساختمان')}
              {draftCell('Location', 'قسمت')}
              {draftCell('TaskTtl', 'موضوع')}
              {draftCell('Descriptions', 'توضیحات')}
              <td>-</td>
              <td>پیش‌نویس</td>
              <td>-</td>
              <td>-</td>
              <td>-</td>
              <td>
                <div className="draft-actions">
                  <button type="button" className="btn-success" onClick={(e) => { e.stopPropagation(); onDraftSave(); }}>ذخیره موقت</button>
                  <button type="button" className="btn-primary" onClick={(e) => { e.stopPropagation(); onDraftFinish(); }}>تکمیل</button>
                  <button type="button" className="btn-danger" onClick={(e) => { e.stopPropagation(); onDraftCancel(); }}>✕</button>
                </div>
              </td>
            </tr>
          )}
          {draftActive && (
            <tr className="draft-row draft-row-place">
              <td colSpan={2}><span className="draft-badge">مشخصات مکانی دستگاه</span></td>
              {draftPlaceCell(PLACE_COLS[0])}
              {draftPlaceCell(PLACE_COLS[1])}
              {draftPlaceCell(PLACE_COLS[2])}
              {draftPlaceCell(PLACE_COLS[3])}
              <td colSpan={8} className="draft-place-note">
                {centralDraft
                  ? '🏢 ساختمان مرکزی: بلوک، طبقه و ورودی را تایپ یا از ▾ انتخاب کنید.'
                  : '🏢 ساختمان غیرمرکزی: بلوک و ورودی «-» خودکار؛ «طبقه» را تایپ یا از ▾ انتخاب کنید.'}
              </td>
            </tr>
          )}
          {sorted.length === 0 && !draftActive && (
            <tr>
              <td colSpan={COLUMNS.length} style={{ textAlign: 'center', padding: '20px' }}>
                هیچ کاری با این فیلترها یافت نشد
                {hasAnyFilter && (
                  <button type="button" onClick={() => setFilters({})} className="btn-danger px-2 py-1 text-xs mr-2">حذف همه فیلترها</button>
                )}
              </td>
            </tr>
          )}
          {sorted.map((t, i) => (
            <tr key={t.TaskID} onClick={() => onRowClick(t)} onDoubleClick={() => onEdit && onEdit(t)}
              className={selectedTask?.TaskID === t.TaskID ? 'task-row-selected' : ''} style={{ cursor: 'pointer' }}>
              <td>{startNumber + i + 1}</td>
              <td><Tip tip={`ثبت: ${fmtFa(t.Submit_Date)}\nاولویت: ${t.Priorities || '-'}`}>{t.TaskID}</Tip></td>
              <td><Tip tip={assetSpec(t)}>{t.AssetName || '-'}</Tip></td>
              <td>{t.AssetNumber ?? '-'}</td>
              <td>{t.Building || '-'}</td>
              <td>{t.Location || '-'}</td>
              <td className="max-w-[220px]"><Tip tip={t.TaskTtl} block><div className="truncate">{t.TaskTtl}</div></Tip></td>
              <td className="max-w-[320px]"><Tip tip={t.Descriptions} block><div className="line-clamp-2">{t.Descriptions || '-'}</div></Tip></td>
              <td>{t.Priorities || '-'}</td>
              <td>{Number(t.Complited) === 1 ? 'اتمام' : 'جاری'}</td>
              <td>{fmtFa(t.DueDateTime)}</td>
              <td>{fmtFa(t.EndDateTime)}</td>
              <td><button className="btn-primary px-2 py-1 text-xs" onClick={(e) => { e.stopPropagation(); onFolder && onFolder(t); }}>📁</button></td>
              <td>
                {Number(t.Complited) !== 1 && (
                  <button className="btn-success px-2 py-1 text-xs" onClick={(e) => { e.stopPropagation(); onComplete(t.TaskID); }}>اتمام</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {hasAnyFilter && (
        <div className="filter-summary">
          <span style={{ fontWeight: 'bold' }}>فیلترهای فعال:</span>
          {Object.entries(filters).filter(([, s]) => s != null && s.size > 0).map(([k, s]) => {
            const col = COLUMNS.find((c) => c.key === k);
            return (
              <span key={k} className="filter-chip">
                {col ? col.label : k}: {s.size} انتخاب
                <button type="button" onClick={() => clearFilter(k)}>✕</button>
              </span>
            );
          })}
          <button type="button" onClick={() => setFilters({})} className="btn-danger px-2 py-1 text-xs">حذف همه</button>
        </div>
      )}

      {menu && menuCol && createPortal(
        <div className="col-menu" style={{ top: menu.y, right: menu.right }} onClick={(e) => e.stopPropagation()}>
          {draftActive ? (
            <div className="col-menu-section">
              <div className="col-menu-title">
                {menuCol.assignable ? `انتخاب «${menuCol.label}» از کل دیتابیس` : 'این ستون برای پیش‌نویس قابل انتخاب نیست'}
              </div>
              {menuCol.assignable ? (
                <>
                  <input className="col-menu-search" placeholder="تایپ برای جستجو در گزینه‌ها…" value={menuQuery} onChange={(e) => setMenuQuery(e.target.value)} />
                  {menuLoading && <div className="col-menu-empty">در حال خواندن گزینه‌ها…</div>}
                  {!menuLoading && shownValues.length === 0 && <div className="col-menu-empty">گزینه‌ای یافت نشد</div>}
                  {!menuLoading && (
                    <div className="col-menu-list">
                      {shownValues.map((v) => (
                        <button key={v} type="button" onClick={() => { onDraftAssign(menuCol.key, v); setMenu(null); }}>{v}</button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="col-menu-empty">الویت پس از ثبت کار (تکمیل ثبت) تنظیم می‌شود.</div>
              )}
            </div>
          ) : (
            <>
              {menuCol.sortable && (
                <div className="col-menu-section">
                  <div className="col-menu-title">مرتب‌سازی</div>
                  <button type="button" onClick={() => toggleSort(menuCol.key)}>
                    {sortKey === menuCol.key && sortDir === 'asc' ? '✓ ' : '   '}صعودی
                  </button>
                  <button type="button" onClick={() => { setSortKey(menuCol.key); setSortDir('desc'); }}>
                    {sortKey === menuCol.key && sortDir === 'desc' ? '✓ ' : '   '}نزولی
                  </button>
                  {sortKey === menuCol.key && (
                    <button type="button" onClick={() => { setSortKey(null); setSortDir('asc'); }}>حذف مرتب‌سازی</button>
                  )}
                </div>
              )}
              {menuCol.filterable && (
                <div className="col-menu-section">
                  <div className="col-menu-title">فیلتر از کل دیتابیس ({menuValues ? menuValues.length : 0} مقدار)</div>
                  <input className="col-menu-search" placeholder="تایپ برای جستجو در گزینه‌ها…" value={menuQuery} onChange={(e) => setMenuQuery(e.target.value)} />
                  <label className="col-menu-item col-menu-selectall">
                    <input type="checkbox" checked={allChecked(menuCol.key)} onChange={(e) => setAllChecked(menuCol.key, e.target.checked)} />
                    <span>(انتخاب همه)</span>
                  </label>
                  {menuLoading && <div className="col-menu-empty">در حال خواندن گزینه‌ها…</div>}
                  {!menuLoading && (
                    <div className="col-menu-list">
                      {shownValues.map((v) => (
                        <label key={v} className="col-menu-item">
                          <input type="checkbox" checked={isChecked(menuCol.key, v)} onChange={() => toggleFilterValue(menuCol.key, v)} />
                          <span className="truncate">{v}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          <div className="col-menu-section" style={{ borderBottom: 'none' }}>
            <button type="button" onClick={() => setMenu(null)} style={{ background: '#e5e7eb' }}>بستن</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}