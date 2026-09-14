'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Tip from './Tip';

const assetSpec = (t) =>
  t.AssetName
    ? `${t.AssetName}، قسمت: ${t.Location || '-'} (ساختمان ${t.Building || '-'}، بلوک: ${t.Block || '-'}، طبقه: ${t.Floor ?? '-'}، ورودی: ${t.Entrance || '-'}) شماره: ${t.AssetNumber ?? '-'} [کد:${t.AssetID}]`
    : '';

const COLUMNS = [
  { key: 'row',          label: 'ردیف',          sortable: false, filterable: false },
  { key: 'TaskID',       label: 'کد کار',        sortable: true,  filterable: true  },
  { key: 'AssetName',    label: 'دستگاه/مجموعه', sortable: true,  filterable: true,  assignable: true },
  { key: 'AssetNumber',  label: 'شماره',         sortable: true,  filterable: true  },
  { key: 'Building',     label: 'ساختمان',       sortable: true,  filterable: true,  assignable: true },
  { key: 'Location',     label: 'قسمت',          sortable: true,  filterable: true,  assignable: true },
  { key: 'TaskTtl',      label: 'موضوع',         sortable: true,  filterable: true,  assignable: true },
  { key: 'Descriptions', label: 'توضیحات',       sortable: false, filterable: false },
  { key: 'Priorities',   label: 'اولویت',        sortable: true,  filterable: true,  assignable: true },
  { key: 'status',       label: 'وضعیت',         sortable: true,  filterable: true  },
  { key: 'DueDateTime',  label: 'زمان شروع',     sortable: true,  filterable: false },
  { key: 'EndDateTime',  label: 'زمان پایان',    sortable: true,  filterable: false },
  { key: 'attachments',  label: 'ضمائم',         sortable: false, filterable: false },
  { key: 'actions',      label: 'عملیات',        sortable: false, filterable: false },
];

export default function TaskTable({
  tasks, startNumber = 0, onRowClick, onComplete, onEdit, onFolder, selectedTask,
  draft, onDraftChange, onDraftAssign, onDraftSave, onDraftFinish, onDraftCancel,
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [filters, setFilters] = useState({});
  const [menu, setMenu] = useState(null); // { key, y, right }

  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('.col-menu') && !e.target.closest('.col-menu-btn')) setMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fmtFa = (v) => (v ? new Date(v).toLocaleString('fa-IR', { timeZone: 'UTC' }) : '-');
  const draftActive = draft != null;

  const uniqueValues = (key) => {
    const set = new Set();
    (tasks || []).forEach((t) => {
      let v;
      if (key === 'status') v = Number(t.Complited) === 1 ? 'اتمام' : 'جاری';
      else v = t[key];
      if (v != null && String(v).trim() !== '') set.add(String(v));
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'fa', { numeric: true }));
  };

  // ✅ وقتی Draft فعال است، فیلترهای عادی غیرفعال‌اند
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

  const openMenu = (e, key) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setMenu((m) => (m && m.key === key ? null : { key, y: r.bottom + 2, right: window.innerWidth - r.right }));
  };

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
  const setFilterAll = (key) => setFilters((prev) => ({ ...prev, [key]: new Set(uniqueValues(key)) }));
  const clearFilter = (key) => setFilters((prev) => { const n = { ...prev }; delete n[key]; return n; });
  const clearAllFilters = () => setFilters({});
  const hasAnyFilter = !draftActive && Object.keys(filters).some((k) => filters[k] && filters[k].size > 0);

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
                        onClick={(e) => openMenu(e, col.key)}
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
              <td><input className="draft-input" value={draft.AssetName || ''} placeholder="دستگاه" onChange={(e) => onDraftChange('AssetName', e.target.value)} /></td>
              <td><input className="draft-input" value={draft.Building || ''} placeholder="ساختمان" onChange={(e) => onDraftChange('Building', e.target.value)} /></td>
              <td><input className="draft-input" value={draft.Location || ''} placeholder="قسمت" onChange={(e) => onDraftChange('Location', e.target.value)} /></td>
              <td><input className="draft-input" value={draft.TaskTtl || ''} placeholder="موضوع" onChange={(e) => onDraftChange('TaskTtl', e.target.value)} /></td>
              <td><input className="draft-input" value={draft.Descriptions || ''} placeholder="توضیحات" onChange={(e) => onDraftChange('Descriptions', e.target.value)} /></td>
              <td><input className="draft-input" value={draft.Priorities || ''} placeholder="اولویت" onChange={(e) => onDraftChange('Priorities', e.target.value)} /></td>
              <td>پیش‌نویس</td>
              <td>-</td>
              <td>-</td>
              <td colSpan={3} style={{ whiteSpace: 'nowrap' }}>
                <button type="button" className="btn-success px-2 py-1 text-xs" onClick={(e) => { e.stopPropagation(); onDraftSave(); }}>ذخیره موقت</button>
                <button type="button" className="btn-primary px-2 py-1 text-xs" onClick={(e) => { e.stopPropagation(); onDraftFinish(); }}>تکمیل ثبت</button>
                <button type="button" className="btn-danger px-2 py-1 text-xs" onClick={(e) => { e.stopPropagation(); onDraftCancel(); }}>✕</button>
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

      {/* ✅ منوی سرستون با Portal روی body — دیگر توسط overflow بریده نمی‌شود */}
      {menu && menuCol && createPortal(
        <div className="col-menu" style={{ top: menu.y, right: menu.right }} onClick={(e) => e.stopPropagation()}>
          {draftActive ? (
            <div className="col-menu-section">
              <div className="col-menu-title">
                {menuCol.assignable ? `انتخاب «${menuCol.label}» برای کار جدید` : 'این ستون برای پیش‌نویس قابل انتخاب نیست'}
              </div>
              {menuCol.assignable && (
                <div className="col-menu-list">
                  {uniqueValues(menuCol.key).map((v) => (
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
                  <div className="col-menu-title">فیلتر ({uniqueValues(menuCol.key).length} مقدار)</div>
                  <div className="col-menu-actions">
                    <button type="button" onClick={() => setFilterAll(menuCol.key)}>انتخاب همه</button>
                    <button type="button" onClick={() => clearFilter(menuCol.key)}>حذف فیلتر</button>
                  </div>
                  <div className="col-menu-list">
                    {uniqueValues(menuCol.key).map((v) => (
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