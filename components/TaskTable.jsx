'use client';
import { useState, useRef, useEffect } from 'react';
import Tip from './Tip';

const assetSpec = (t) =>
  t.AssetName
    ? `${t.AssetName}، قسمت: ${t.Location || '-'} (ساختمان ${t.Building || '-'}، بلوک: ${t.Block || '-'}، طبقه: ${t.Floor ?? '-'}، ورودی: ${t.Entrance || '-'}) شماره: ${t.AssetNumber ?? '-'} [کد:${t.AssetID}]`
    : '';

const COLUMNS = [
  { key: 'row',         label: 'ردیف',          sortable: false, filterable: false },
  { key: 'TaskID',      label: 'کد کار',        sortable: true,  filterable: true  },
  { key: 'AssetName',   label: 'دستگاه/مجموعه', sortable: true,  filterable: true  },
  { key: 'AssetNumber', label: 'شماره',         sortable: true,  filterable: true  },
  { key: 'Building',    label: 'ساختمان',       sortable: true,  filterable: true  },
  { key: 'Location',    label: 'قسمت',          sortable: true,  filterable: true  },
  { key: 'TaskTtl',     label: 'موضوع',         sortable: true,  filterable: true  },
  { key: 'Descriptions',label: 'توضیحات',       sortable: false, filterable: false },
  { key: 'Priorities',  label: 'اولویت',        sortable: true,  filterable: true  },
  { key: 'status',      label: 'وضعیت',         sortable: true,  filterable: true  },
  { key: 'DueDateTime', label: 'زمان شروع',     sortable: true,  filterable: false },
  { key: 'EndDateTime', label: 'زمان پایان',    sortable: true,  filterable: false },
  { key: 'attachments', label: 'ضمائم',         sortable: false, filterable: false },
  { key: 'actions',     label: 'عملیات',        sortable: false, filterable: false },
];

export default function TaskTable({ tasks, startNumber = 0, onRowClick, onComplete, onEdit, onFolder, selectedTask }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [filters, setFilters] = useState({});   // { key: Set([...values]) }
  const [activeMenu, setActiveMenu] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) && !e.target.closest('.col-menu-btn')) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fmtFa = (v) => (v ? new Date(v).toLocaleString('fa-IR', { timeZone: 'UTC' }) : '-');

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

  const filtered = (tasks || []).filter((t) => {
    for (const key of Object.keys(filters)) {
      const allowed = filters[key];
      if (!allowed || allowed.size === 0) continue;
      const v = key === 'status'
        ? (Number(t.Complited) === 1 ? 'اتمام' : 'جاری')
        : String(t[key] ?? '');
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
    if (typeof av === 'number' && typeof bv === 'number') {
      return sortDir === 'asc' ? av - bv : bv - av;
    }
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
      if (cur.has(value)) cur.delete(value);
      else cur.add(value);
      return { ...prev, [key]: cur };
    });
  };

  const setFilterAll = (key) => setFilters((prev) => ({ ...prev, [key]: new Set(uniqueValues(key)) }));
  const clearFilter = (key) => setFilters((prev) => { const n = { ...prev }; delete n[key]; return n; });
  const clearAllFilters = () => setFilters({});

  const hasAnyFilter = Object.keys(filters).some((k) => filters[k] && filters[k].size > 0);

  if (!tasks || tasks.length === 0)
    return (
      <div className="h-full flex items-center justify-center text-gray-600 bg-[#b4a9b0] rounded-lg shadow-lg">
        کاری یافت نشد
      </div>
    );

  return (
    <div className="h-full overflow-auto overscroll-contain rounded-lg shadow-lg bg-[#b4a9b0]">
      <table className="task-table w-full min-w-[1300px]">
        <thead>
          <tr>
            {COLUMNS.map((col) => {
              const isActive = activeMenu === col.key;
              const isFiltered = filters[col.key] && filters[col.key].size > 0;
              const isSorted = sortKey === col.key;
              return (
                <th key={col.key} style={{ position: 'relative' }}>
                  <div className="flex items-center justify-between gap-1">
                    <span>{col.label}</span>
                    {(col.sortable || col.filterable) && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setActiveMenu(isActive ? null : col.key); }}
                        className={`col-menu-btn ${isFiltered || isSorted || isActive ? 'active' : ''}`}
                        title="مرتب‌سازی / فیلتر"
                      >
                        {isSorted ? (sortDir === 'asc' ? '▲' : '▼') : (isFiltered ? '🔽' : '⋮')}
                      </button>
                    )}
                  </div>
                  {isActive && (
                    <div ref={menuRef} className="col-menu" onClick={(e) => e.stopPropagation()}>
                      {col.sortable && (
                        <div className="col-menu-section">
                          <div className="col-menu-title">مرتب‌سازی</div>
                          <button type="button" onClick={() => { toggleSort(col.key); }}>
                            {sortKey === col.key && sortDir === 'asc' ? '✓ ' : '   '}صعودی
                          </button>
                          <button type="button" onClick={() => { setSortKey(col.key); setSortDir('desc'); }}>
                            {sortKey === col.key && sortDir === 'desc' ? '✓ ' : '   '}نزولی
                          </button>
                          {isSorted && (
                            <button type="button" onClick={() => { setSortKey(null); setSortDir('asc'); }}>
                              حذف مرتب‌سازی
                            </button>
                          )}
                        </div>
                      )}
                      {col.filterable && (
                        <div className="col-menu-section">
                          <div className="col-menu-title">فیلتر ({uniqueValues(col.key).length} مقدار)</div>
                          <div className="col-menu-actions">
                            <button type="button" onClick={() => setFilterAll(col.key)}>انتخاب همه</button>
                            <button type="button" onClick={() => clearFilter(col.key)}>حذف فیلتر</button>
                          </div>
                          <div className="col-menu-list">
                            {uniqueValues(col.key).map((v) => (
                              <label key={v} className="col-menu-item">
                                <input
                                  type="checkbox"
                                  checked={!filters[col.key] || filters[col.key].has(v)}
                                  onChange={() => toggleFilterValue(col.key, v)}
                                />
                                <span className="truncate">{v}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="col-menu-section" style={{ borderBottom: 'none' }}>
                        <button type="button" onClick={() => setActiveMenu(null)} style={{ background: '#e5e7eb' }}>
                          بستن
                        </button>
                      </div>
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} style={{ textAlign: 'center', padding: '20px' }}>
                هیچ کاری با این فیلترها یافت نشد
                {hasAnyFilter && (
                  <button type="button" onClick={clearAllFilters} className="btn-danger px-2 py-1 text-xs mr-2">
                    حذف همه فیلترها
                  </button>
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
              <td>
                <button className="btn-primary px-2 py-1 text-xs" onClick={(e) => { e.stopPropagation(); onFolder && onFolder(t); }}>📁</button>
              </td>
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
    </div>
  );
}