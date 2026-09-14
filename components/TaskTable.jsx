'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Tip from './Tip';

const assetSpec = (t) =>
  t.AssetName
    ? `${t.AssetName}، قسمت: ${t.Location || '-'} (ساختمان ${t.Building || '-'}، بلوک: ${t.Block || '-'}، طبقه: ${t.Floor ?? '-'}، ورودی: ${t.Entrance || '-'}) شماره: ${t.AssetNumber ?? '-'} [کد:${t.AssetID}]`
    : '';

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const COLUMNS = [
  { key: 'row',          label: 'ردیف',          sortable: false, filterable: false },
  { key: 'TaskID',       label: 'کد کار',        sortable: true,  filterable: true  },
  { key: 'AssetName',    label: 'دستگاه/مجموعه', sortable: true,  filterable: true,  assignable: true, source: 'asset' },
  { key: 'AssetNumber',  label: 'شماره',         sortable: true,  filterable: true,  source: 'asset' },
  { key: 'Building',     label: 'ساختمان',       sortable: true,  filterable: true,  assignable: true, source: 'asset' },
  { key: 'Location',     label: 'قسمت',          sortable: true,  filterable: true,  assignable: true, source: 'asset' },
  { key: 'TaskTtl',      label: 'موضوع',         sortable: true,  filterable: true,  assignable: true, source: 'task' },
  { key: 'Descriptions', label: 'توضیحات',       sortable: false, filterable: false, source: 'task' },
  { key: 'Priorities',   label: 'اولویت',        sortable: true,  filterable: true,  assignable: true, source: 'task' },
  { key: 'status',       label: 'وضعیت',         sortable: true,  filterable: true  },
  { key: 'DueDateTime',  label: 'زمان شروع',     sortable: true,  filterable: false },
  { key: 'EndDateTime',  label: 'زمان پایان',    sortable: true,  filterable: false },
  { key: 'attachments',  label: 'ضمائم',         sortable: false, filterable: false },
  { key: 'actions',      label: 'عملیات',        sortable: false, filterable: false },
];

export default function TaskTable({
  tasks, startNumber = 0, onRowClick, onComplete, onEdit, onFolder, selectedTask,
  draft, onDraftChange, onDraftAssign, onDraftSave, onDraftFinish, onDraftCancel, onDraftDeviceMissing,
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [filters, setFilters] = useState({});
  const [menu, setMenu] = useState(null);          // { key, y, right }
  const [menuValues, setMenuValues] = useState(null);
  const [menuLoading, setMenuLoading] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('.col-menu') && !e.target.closest('.col-menu-btn') && !e.target.closest('.draft-input')) setMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fmtFa = (v) => (v ? new Date(v).toLocaleString('fa-IR', { timeZone: 'UTC' }) : '-');
  const draftActive = draft != null;

  // ✅ خواندن گزینه‌ها از کل دیتابیس (با فیلتر آبشاری در حالت پیش‌نویس)
  const loadMenuValues = async (col) => {
    setMenuLoading(true);
    setMenuValues(null);
    if (col.key === 'status') { setMenuValues(['جاری', 'اتمام']); setMenuLoading(false); return; }
    let constraints = {};
    if (draftActive) {
      constraints = {
        AssetName: draft.AssetName, AssetNumber: draft.AssetNumber, Building: draft.Building,
        Location: draft.Location, TaskTtl: draft.TaskTtl, Priorities: draft.Priorities,
      };
      delete constraints[col.key];
      constraints = Object.fromEntries(Object.entries(constraints).filter(([, v]) => norm(v) !== ''));
    }
    try {
      const res = await fetch('/api/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    setMenu(next);
    if (next && col.filterable) loadMenuValues(col);
  };

  // ✅ بررسی وجود دستگاه در دیتابیس هنگام خروج از خانهٔ دستگاه
  const checkDeviceExists = async () => {
    const name = norm(draft?.AssetName);
    if (!name) return;
    try {
      const res = await fetch('/api/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'AssetName', source: 'asset', constraints: {} }),
      });
      const d = await res.json();
      const list = d.success ? d.values : [];
      if (!list.some((v) => norm(v) === name)) onDraftDeviceMissing && onDraftDeviceMissing(name);
    } catch {}
  };

  const filtered = draftActive
    ? (tasks || [])
    : (tasks || []).filter((t) => {
        for (const key of Object.keys(filters)) {
          const allowed = filters[key];
          if (!allowed || allowed.size === 0) continue;
          const v = key === 'status' ? (Number(t.Complited) === 1 ? 'اتمام' : 'جاری') : String(t[key] ?? '');
          if (!allowed.has(v)) return false;
        }
        return true;
      });

  const sorted = [...filtered].sort((a, b) => {
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

  const toggleSort = (key) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey(null); setSortDir('asc'); }
    } else { setSortKey(key); setSortDir('asc'); }
  };

  const toggleFilterValue = (key, value) => {
    setFilters((prev) => {
      const cur = new Set(prev[key] || []);
      if (cur.has(value)) cur.delete(value); else cur.add(value);
      return { ...prev, [key]: cur };
    });
  };
  const setFilterAll = (key) => setFilters((prev) => ({ ...prev, [key]: new Set(menuValues || []) }));
  const clearFilter = (key) => setFilters((prev) => { const n = { ...prev }; delete n[key]; return n; });
  const clearAllFilters = () => setFilters({});
  const hasAnyFilter = !draftActive && Object.keys(filters).some((k) => filters[k] && filters[k].size > 0);

  // ✅ خانهٔ قابل‌کلیک سطر پیش‌نویس (placeholder هم‌نام سرستون)
  const draftCell = (key, ph) => (
    <td className="draft-cell">
      <div className="draft-cell-wrap">
        <input
          className="draft-input"
          value={draft[key] || ''}
          placeholder={ph}
          onChange={(e) => onDraftChange(key, e.target.value)}
          onClick={(e) => { const col = COLUMNS.find((c) => c.key === key); if (col) openMenu(e, col); }}
          onBlur={() => { if (key === 'AssetName') checkDeviceExists(); }}
        />
        <button
          type="button"
          className="col-menu-btn"
          title="گزینه‌ها از کل دیتابیس"
          onClick={(e) => { const col = COLUMNS.find((c) => c.key === key); if (col) openMenu(e, col); }}
        >▾</button>
      </div>
    </td>
  );

  if (!tasks || tasks.length === 0)
    return (
      <div className="h-full flex items-center justify-center text-gray-600 bg-[#b4a9b0] rounded-lg shadow-lg">
        کاری یافت نشد
      </div>
    );

  const menuCol = menu ? COLUMNS.find((c) => c.key === menu.key) : null;

  return (
    <div className="h-full overflow-auto overscroll-contain rounded-lg shadow-lg bg-[#b4a9b0]">
      <table className="task-table w-full min-w-[1300px]">
        <thead>
          <tr>
            {COLUMNS.map((col) => {
              const isFiltered = !draftActive && filters[col.key] && filters[col.key].size > 0;
              const isSorted = sortKey === col.key;
              const isOpen = menu && menu.key === col.key;
              return (
                <th key={col.key}>
                  <div className="flex items-center justify-between gap-1">
                    <span>{col.label}</span>
                    {(col.sortable || col.filterable) && (
                      <button
                        type="button"
                        onClick={(e) => openMenu(e, col)}
                        className={`col-menu-btn ${isFiltered || isSorted || isOpen ? 'active' : ''}`}
                        title={draftActive ? 'انتخاب برای کار جدید' : 'مرتب‌سازی / فیلتر'}
                      >
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
              {draftCell('Priorities', 'اولویت')}
              <td>پیش‌نویس</td>
              <td>-</td>
              <td>-</td>
              <td>-</td>
              <td>
                <div className="draft-actions">
                  <button type="button" className="btn-success" onClick={(e) => { e.stopPropagation(); onDraftSave(); }}>ذخیره موقت</button>
                  <button type="button" className="btn-primary" onClick={(e) => { e.stopPropagation(); onDraftFinish(); }}>تکمیل ثبت</button>
                  <button type="button" className="btn-danger" onClick={(e) => { e.stopPropagation(); onDraftCancel(); }}>✕</button>
                </div>
              </td>
            </tr>
          )}
          {sorted.length === 0 && !draftActive && (
            <tr>
              <td colSpan={COLUMNS.length} style={{ textAlign: 'center', padding: '20px' }}>
                هیچ کاری با این فیلترها یافت نشد
                {hasAnyFilter && (
                  <button type="button" onClick={clearAllFilters} className="btn-danger px-2 py-1 text-xs mr-2">حذف همه فیلترها</button>
                )}
              </td>
            </tr>
          )}
          {sorted.map((t, i) => (
            <tr
              key={t.TaskID}
              onClick={() => onRowClick(t)}
              onDoubleClick={() => onEdit && onEdit(t)}
              className={selectedTask?.TaskID === t.TaskID ? 'task-row-selected' : ''}
              style={{ cursor: 'pointer' }}
            >
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
          {Object.keys(filters).filter((k) => filters[k] && filters[k].size > 0).map((k) => {
            const col = COLUMNS.find((c) => c.key === k);
            return (
              <span key={k} className="filter-chip">
                {col.label}: {filters[k].size} مورد
                <button type="button" onClick={() => clearFilter(k)}>✕</button>
              </span>
            );
          })}
          <button type="button" onClick={clearAllFilters} className="btn-danger px-2 py-1 text-xs">حذف همه</button>
        </div>
      )}

      {menu && menuCol && createPortal(
        <div className="col-menu" style={{ top: menu.y, right: menu.right }} onClick={(e) => e.stopPropagation()}>
          {draftActive ? (
            <div className="col-menu-section">
              <div className="col-menu-title">
                {menuCol.assignable || menuCol.filterable ? `انتخاب «${menuCol.label}» از کل دیتابیس` : 'این ستون برای پیش‌نویس قابل انتخاب نیست'}
              </div>
              {menuLoading && <div className="col-menu-empty">در حال خواندن گزینه‌ها…</div>}
              {!menuLoading && menuValues && menuValues.length === 0 && <div className="col-menu-empty">گزینه‌ای یافت نشد</div>}
              {!menuLoading && menuValues && menuValues.length > 0 && (
                <div className="col-menu-list">
                  {menuValues.map((v) => (
                    <button key={v} type="button" onClick={() => { onDraftAssign(menuCol.key, v); setMenu(null); }}>
                      {v}
                    </button>
                  ))}
                </div>
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
                  <div className="col-menu-title">فیلتر از کل دیتابیس{menuValues ? ` (${menuValues.length} مقدار)` : ''}</div>
                  <div className="col-menu-actions">
                    <button type="button" onClick={() => setFilterAll(menuCol.key)}>انتخاب همه</button>
                    <button type="button" onClick={() => clearFilter(menuCol.key)}>حذف فیلتر</button>
                  </div>
                  {menuLoading && <div className="col-menu-empty">در حال خواندن گزینه‌ها…</div>}
                  {!menuLoading && menuValues && (
                    <div className="col-menu-list">
                      {menuValues.map((v) => (
                        <label key={v} className="col-menu-item">
                          <input
                            type="checkbox"
                            checked={!filters[menuCol.key] || filters[menuCol.key].has(v)}
                            onChange={() => toggleFilterValue(menuCol.key, v)}
                          />
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