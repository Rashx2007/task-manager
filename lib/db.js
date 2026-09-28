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

const isDriverMissing = (err) => {
  const blob =
    (err && err.message ? err.message : "") +
    " " +
    (Array.isArray(err) ? err.map((x) => (x && x.message) || "").join(" ") : "") +
    " " +
    (err && err.sqlstate ? err.sqlstate : "");
  return /IM002|IM003|Datasourcenotfound|Drivernotfound|nodriver/i.test(blob);
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
          new Error("هیچ درایور SQL Server/ODBC مناسبی یافت نشد؛ لطفاً «ODBC Driver 17 for SQL Server» را نصب کنید."),
        );
      }
      const driver = candidates[i];
      sql.query(connStr(driver, database), text, params, (err, rows) => {
        if (err) {
          if (isDriverMissing(err)) return attempt(i + 1);
          return reject(err);
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

// ✅ تراکنش روی یک اتصال واحد (برای convert و هر عملیات چندمرحله‌ای)
export async function runTransaction(fn, database = DB) {
  const driver = cachedDriver || DRIVERS[0];
  const cs = connStr(driver, database);
  return new Promise((resolve, reject) => {
    sql.open(cs, (openErr, conn) => {
      if (openErr) {
        if (isDriverMissing(openErr)) {
          cachedDriver = null;
          return reject(new Error("درایور SQL Server یافت نشد؛ ODBC Driver 17 را نصب کنید."));
        }
        return reject(openErr);
      }
      cachedDriver = driver;
      const tx = (text, params = []) =>
        new Promise((res, rej) => {
          conn.query(text, params, (e, rows) => (e ? rej(e) : res(rows)));
        });
      const rollback = () => new Promise((res) => conn.query("ROLLBACK TRAN", [], () => res()));
      tx("BEGIN TRAN")
        .then(() => fn(tx))
        .then((result) => tx("COMMIT TRAN").then(() => result))
        .then(resolve)
        .catch(async (e) => {
          try { await rollback(); } catch {}
          reject(e);
        });
    });
  });
}

export default query;