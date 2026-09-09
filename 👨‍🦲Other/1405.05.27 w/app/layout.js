import './globals.css';

export const metadata = {
  title: 'سیستم مدیریت کارها',
  description: 'مدیریت و پیگیری کارهای تعمیراتی و نگهداری',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fa" dir="rtl">
      <body className="min-h-screen bg-[#CCE6DF]">
        {children}
      </body>
    </html>
  );
}