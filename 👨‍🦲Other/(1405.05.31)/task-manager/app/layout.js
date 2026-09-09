import './globals.css';
import 'vazirmatn/Vazirmatn-font-face.css';

export const metadata = {
  title: 'سیستم مدیریت کارها (امور)',
  description: 'سامانهٔ مدیریت و پیگیری کارها',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}