'use client';
import Tip from './Tip';

const assetSpec = (t) =>
  t.AssetName
    ? `${t.AssetName}، قسمت: ${t.Location || '-'} (ساختمان ${t.Building || '-'}، بلوک: ${t.Block || '-'}، طبقه: ${t.Floor ?? '-'}، ورودی: ${t.Entrance || '-'}) شماره: ${t.AssetNumber ?? '-'} [کد:${t.AssetID}]`
    : '';

export default function TaskTable({ tasks, onRowClick, onComplete, onEdit, onFolder, selectedTask }) {
  const fmtFa = (v) => (v ? new Date(v).toLocaleString('fa-IR', { timeZone: 'UTC' }) : '-');
  if (!tasks || tasks.length === 0) return <div className="text-center py-12 text-gray-600">کاری یافت نشد</div>;

  return (
    <div className="overflow-auto overscroll-contain rounded-lg shadow-lg" style={{ maxHeight: 'calc(100vh - 210px)' }}>
      <table className="task-table w-full min-w-[1200px]">
        <thead>
          <tr>
            <th>ردیف</th><th>کد کار</th><th>دستگاه/مجموعه</th><th>شماره</th><th>ساختمان</th><th>قسمت</th>
            <th>موضوع</th><th>توضیحات</th><th>اولویت</th><th>وضعیت</th><th>زمان شروع</th><th>ضمائم</th><th>عملیات</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t, i) => (
            <tr key={t.TaskID} onClick={() => onRowClick(t)} onDoubleClick={() => onEdit && onEdit(t)}
                className={selectedTask?.TaskID === t.TaskID ? 'task-row-selected' : ''} style={{ cursor: 'pointer' }}>
              <td>{i + 1}</td>
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
              <td><button className="btn-primary px-2 py-1 text-xs" onClick={(e) => { e.stopPropagation(); onFolder && onFolder(t); }}>📁</button></td>
              <td>{Number(t.Complited) !== 1 && (
                <button className="btn-success px-2 py-1 text-xs" onClick={(e) => { e.stopPropagation(); onComplete(t.TaskID); }}>اتمام</button>
              )}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}