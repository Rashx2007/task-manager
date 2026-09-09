import sql from 'msnodesqlv8';

// معادل دقیق همان کانکشن استرینگ برنامه ویندوزی:
// Data Source=.;Initial Catalog=WorkDB;Integrated security=true
const connectionString =
  'Driver={SQL Server};Server=(local);Database=WorkDB;Trusted_Connection=Yes;';

// اگر SQL Server شما Named Instance است، خط بالا را این‌گونه بنویسید:
// 'Driver={SQL Server};Server=.\\SQL2019;Database=WorkDB;Trusted_Connection=Yes;'

export function query(q, params = []) {
  return new Promise((resolve, reject) => {
    sql.query(connectionString, q, params, (err, rows) => {
      if (err) {
        console.error('❌ Database error:', err);
        return reject(err);
      }
      resolve(rows);
    });
  });
}

export default sql;