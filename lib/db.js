// lib/db.js
import sql from "msnodesqlv8";

const SERVER = process.env.DB_SERVER || ".";
const DB = process.env.DB_NAME || "WorkDB";

const DRIVERS = [
  "ODBC Driver 18 for SQL Server",
  "ODBC Driver 17 for SQL Server",
  "SQL Server Native Client 11.0",
  "SQL Server",
];

const connStr = (driver, database) =>
  `Driver={${driver}};Server=${SERVER};Database=${database};Trusted_Connection=Yes;` +
  (driver.startsWith("ODBC Driver 18") ? "Encrypt=Yes;TrustServerCertificate=Yes;" : "");

// ✅ فقط این کدها یعنی «درایور/DSN وجود ندارد»؛ بقیهٔ خطاها (مثل SINGLE_USER) باید همان‌طور برگردند
const isDriverMissing = (err) => {
  const blob =
    (err && err.message ? err.message : "") +
    " " +
    (Array.isArray(err) ? err.map((x) => (x && x.message) || "").join(" ") : "") +
    " " +
    (err && err.sqlstate ? err.sqlstate : "");
  return /IM002|IM003|Data source name not found|Driver not found|no driver/i.test(blob);
};

let cachedDriver = null;

function run(database, text, params) {
  return new Promise((resolve, reject) => {
    const candidates = cachedDriver
      ? [cachedDriver, ...DRIVERS.filter((d) => d !== cachedDriver)]
      : DRIVERS;
    const attempt = (i) => {
      if (i >= candidates.length) {
        return reject(
          new Error(
            "هیچ درایور SQL Server/ODBC مناسبی یافت نشد؛ لطفاً «ODBC Driver 17 for SQL Server» را نصب کنید.",
          ),
        );
      }
      const driver = candidates[i];
      sql.query(connStr(driver, database), text, params, (err, rows) => {
        if (err) {
          if (isDriverMissing(err)) return attempt(i + 1);
          return reject(err); // ✅ خطای واقعی (مثل SINGLE_USER) بدون پوشاندن برگردد
        }
        cachedDriver = driver;
        resolve(rows);
      });
    };
    attempt(0);
  });
}

export const query = (text, params = []) => run(DB, text, params);
export const queryMaster = (text, params = []) => run("master", text, params);
export default query;