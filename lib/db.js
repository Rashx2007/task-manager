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

// ✅ فقط این کدها یعنی «درایور/DSN وجود ندارد»؛ بقیهٔ خطاها باید همان‌طور برگردند
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
          new Error(
            "هیچ درایور SQL Server/ODBC مناسبی یافت نشد؛ لطفاً «ODBC Driver 17 for SQL Server» را نصب کنید.",
          ),
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

/**
 * ✅ اجرای یک سری کوئری در یک Transaction واحد روی یک Connection.
 * الگوی استفاده:
 *   await runTransaction(async (tx) => {
 *     await tx(`DELETE FROM MapText_tbl WHERE MapID=?`, [mapId]);
 *     for (const t of texts) await tx(`INSERT ...`, [...]);
 *     await tx(`UPDATE Map_tbl SET ...`, [...]);
 *   });
 * در صورت خطا، ROLLBACK به‌صورت خودکار انجام می‌شود.
 */
export async function runTransaction(fn, database = DB) {
  const driver = cachedDriver || DRIVERS[0];
  const cs = connStr(driver, database);

  return new Promise((resolve, reject) => {
    sql.open(cs, (openErr, conn) => {
      if (openErr) {
        if (isDriverMissing(openErr)) {
          cachedDriver = null;
          return reject(
            new Error("درایور SQL Server یافت نشد. لطفاً ODBC Driver 17 را نصب کنید."),
          );
        }
        return reject(openErr);
      }

      cachedDriver = driver;

      const txQuery = (text, params = []) =>
        new Promise((res, rej) => {
          conn.query(text, params, (e, rows) => {
            if (e) rej(e);
            else res(rows);
          });
        });

      const rollback = () =>
        new Promise((res) => {
          conn.query("ROLLBACK TRAN", [], () => res());
        });

      txQuery("BEGIN TRAN")
        .then(() => fn(txQuery))
        .then((result) =>
          txQuery("COMMIT TRAN")
            .then(() => result)
            .catch((e) => rollback().then(() => Promise.reject(e))),
        )
        .then((result) => {
          resolve(result);
        })
        .catch(async (e) => {
          try {
            await rollback();
          } catch {}
          reject(e);
        });
    });
  });
}

export default query;