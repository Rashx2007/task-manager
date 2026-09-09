import sql from 'msnodesqlv8';

// فهرست درایورهای رایج؛ اولین درایورِ موجود به‌صورت خودکار انتخاب و کش می‌شود
const DRIVERS = [
  'ODBC Driver 17 for SQL Server',
  'ODBC Driver 18 for SQL Server',
  'SQL Server Native Client 11.0',
  'SQL Server',
];

const connStr = (driver) =>
  driver.includes('ODBC Driver 18')
    ? `Driver={${driver}};Server=.;Database=WorkDB;Trusted_Connection=yes;Encrypt=yes;TrustServerCertificate=yes;`
    : `Driver={${driver}};Server=.;Database=WorkDB;Trusted_Connection=yes;`;

let ready = null;
function detectDriver() {
  if (!ready) {
    ready = new Promise((resolve, reject) => {
      const tryIdx = (i) => {
        if (i >= DRIVERS.length) {
          return reject(new Error('هیچ درایور SQL Server/ODBC مناسبی یافت نشد؛ لطفاً «ODBC Driver 17 for SQL Server» را نصب کنید.'));
        }
        const con = connStr(DRIVERS[i]);
        sql.query(con, 'SELECT 1 AS ok', (err) => (err ? tryIdx(i + 1) : resolve(con)));
      };
      tryIdx(0);
    });
  }
  return ready;
}

export async function query(text, params = []) {
  const con = await detectDriver();
  return new Promise((resolve, reject) => {
    sql.query(con, text, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}