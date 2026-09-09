'use client';

import { useState, useEffect } from 'react';

export default function StatusBar({ rowCount }) {
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('fa-IR'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bg-gray-700 text-white px-4 py-2 flex justify-between items-center text-sm">
      <span>{currentTime}</span>
      <span>تعداد سطرها: {rowCount}</span>
    </div>
  );
}