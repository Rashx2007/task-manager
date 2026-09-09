'use client';

export default function TaskTable({ tasks, onRowClick, onComplete, onEdit, selectedTask }) {
  const fmtFa = (v) => (v ? new Date(v).toLocaleString('fa-IR') : '-');
  if (!tasks || tasks.length === 0) return <div className="text-center py-12 text-gray-500">کاری یافت نشد</div>;

  return (
    <div className="overflow-x-auto overscroll-contain rounded-lg shadow-lg" dir="rtl">
      <table className="task-table w-full min-w-[1400px]">
        <thead>
          <tr>
            <th>ردیف</th><th>کد کار</th><th>دستگاه/مجموعه</th><th>شماره</th><th>ساختمان</th>
            <th>قسمت</th><th>موضوع</th><th>توضیحات</th><th>اولویت</th><th>وضعیت</th>
            <th>زمان شروع</th><th>زمان اتمام</th><th>عملیات</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t, i) => (
            <tr key={t.TaskID}
                onClick={() => onRowClick(t)}
                onDoubleClick={() => onEdit && onEdit(t)}
                title="دابل‌کلیک: باز کردن فرم ویرایش"
                className={selectedTask?.TaskID === t.TaskID ? 'bg-[#FC7470]' : ''}>
              <td>{i + 1}</td>
              <td>{t.TaskID}</td>
              <td>{t.AssetName || '-'}</td>
              <td>{t.AssetNumber ?? '-'}</td>
              <td>{t.Building || '-'}</td>
              <td>{t.Location || '-'}</td>
              <td>{t.TaskTtl}</td>
              <td>{t.Descriptions || '-'}</td>
              <td>{t.Priorities || '-'}</td>
              <td>{Number(t.Complited) === 1 ? 'اتمام' : 'جاری'}</td>
              <td>{fmtFa(t.DueDateTime)}</td>
              <td>{fmtFa(t.EndDateTime)}</td>
              <td>{Number(t.Complited) !== 1 && (
                <button onClick={(e)=>{e.stopPropagation(); onComplete(t.TaskID);}} className="btn-success text-xs">اتمام</button>
              )}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}