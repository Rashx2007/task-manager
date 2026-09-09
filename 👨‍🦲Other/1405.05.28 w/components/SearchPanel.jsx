'use client';

import { useState, useEffect } from 'react';
export default function SearchPanel({ onSearch, onClose }) {
  const [formData, setFormData] = useState({
    taskID: '',
    requestNumber: '',
    propertyCode: '',
  });


  // بستن با ESC
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch(formData);
  };

  return (
    <div className="bg-[#5F7470] p-4 mx-4 mt-2 rounded-lg shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold text-lg">جستجو</h3>
        <button onClick={onClose} className="text-white hover:text-red-300 text-xl">✕</button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-white text-sm mb-1">کد کار</label>
          <input
            type="text"
            name="taskID"
            value={formData.taskID}
            onChange={handleChange}
            className="search-input w-full"
            placeholder="کد کار..."
          />
        </div>

        <div>
          <label className="block text-white text-sm mb-1">شماره درخواست</label>
          <input
            type="text"
            name="requestNumber"
            value={formData.requestNumber}
            onChange={handleChange}
            className="search-input w-full"
            placeholder="شماره درخواست..."
          />
        </div>

        <div>
          <label className="block text-white text-sm mb-1">شماره اموال</label>
          <input
            type="text"
            name="propertyCode"
            value={formData.propertyCode}
            onChange={handleChange}
            className="search-input w-full"
            placeholder="شماره اموال..."
          />
        </div>

        <div className="flex items-end gap-2">
          <button type="submit" className="btn-primary flex-1">
            جستجو
          </button>
          <button
            type="button"
            onClick={() => {
              setFormData({ taskID: '', requestNumber: '', propertyCode: '' });
            }}
            className="btn-danger"
          >
            پاک‌کردن
          </button>
        </div>
      </form>
    </div>
  );
}