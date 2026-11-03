// Tests the actual route with mocked NextResponse and SQL; no SQL Server is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
async function loadRoute(query) {
  const context = vm.createContext({ URL });
  const route = new vm.SourceTextModule(await fs.readFile(new URL('../app/api/folder/route.js', import.meta.url), 'utf8'), { context });
  const next = new vm.SyntheticModule(['NextResponse'], function () {
    this.setExport('NextResponse', { json: (body, options) => ({ body, status: options?.status ?? 200 }) });
  }, { context });
  const db = new vm.SyntheticModule(['query'], function () { this.setExport('query', query); }, { context });
  await route.link(specifier => specifier === 'next/server' ? next : db);
  await route.evaluate(); return route.namespace;
}
const payload = { taskId: 49906, FileName: 'D:\\private\\folder\\file.pdf', FolderPath: 'D:\\private\\folder', AllowedToCopyFiles: 1 };
const request = (body = payload) => ({ json: async () => body });
const details = "[Microsoft][ODBC Driver 17 for SQL Server][SQL Server]String or binary data would be truncated in table 'WorkDB.dbo.Folder_tbl', column 'FileName'. Truncated value: 'D:\\private\\folder\\file.pdf'.";

for (const existing of [false, true]) test(`FileName truncation during ${existing ? 'UPDATE' : 'INSERT'} is actionable and hides SQL details`, async () => {
  const calls = [], route = await loadRoute(async (sql, params) => { calls.push({sql, params}); if (calls.length === 1) return existing ? [{FolderID:1}] : []; throw Error(details); });
  const response = await route.POST(request());
  assert.equal(response.status, 400); assert.equal(response.body.success, false); assert.equal(response.body.code, 'FILE_NAME_TOO_LONG');
  assert.match(response.body.error, /ذخیره انجام نشد/); assert.match(response.body.error, /نام یا مسیر فایل/); assert.match(response.body.error, /کوتاه‌تر/);
  assert.doesNotMatch(JSON.stringify(response.body), /WorkDB|Folder_tbl|SQL Server|D:\\\\private|Truncated/i);
  assert.match(calls[1].sql, existing ? /^UPDATE Folder_tbl/ : /^INSERT INTO Folder_tbl/);
  assert.equal(calls[1].params.length, 4); assert.equal((calls[1].sql.match(/\?/g) || []).length, 4);
  assert.ok(calls[1].params.includes(payload.FileName)); assert.ok(calls[1].params.includes(payload.FolderPath));
});

test('FolderPath truncation has a distinct safe message', async () => {
  const route=await loadRoute(async sql => { if (/^SELECT/.test(sql)) return []; throw Error(details.replace("'FileName'", "'FolderPath'")); });
  const r=await route.POST(request()); assert.equal(r.body.code,'FOLDER_PATH_TOO_LONG'); assert.match(r.body.error,/مسیر پوشه/); assert.doesNotMatch(r.body.error,/WorkDB|private/);
});

test('SQL 8152 without column, SQLSTATE 22001 and nested SQL 2628 get generic safe message', async () => {
  for(const failure of [{number:8152,message:'sensitive SQL text'}, {sqlstate:'22001',message:'D:\\private'}, {originalError:{number:2628,message:'confidential'}}]) {
    const route=await loadRoute(async sql => { if (/^SELECT/.test(sql)) return []; throw failure; });
    const r=await route.POST(request()); assert.equal(r.status,400); assert.equal(r.body.code,'FOLDER_VALUE_TOO_LONG'); assert.doesNotMatch(JSON.stringify(r.body),/private|confidential|sensitive/i);
  }
});

test('nested driver errors and arrays identify column without leaking nested details', async () => {
  const route=await loadRoute(async sql => { if (/^SELECT/.test(sql)) return []; throw {errors:[{message:details}]}; });
  const r=await route.POST(request()); assert.equal(r.body.code,'FILE_NAME_TOO_LONG'); assert.doesNotMatch(JSON.stringify(r.body),/WorkDB|private/i);
});

test('unrelated write failures return safe generic error rather than raw data', async () => {
  const route=await loadRoute(async sql => { if (/^SELECT/.test(sql)) return []; throw Error('password and secret SQL detail'); });
  const r=await route.POST(request()); assert.equal(r.status,500); assert.equal(r.body.code,'FOLDER_SAVE_FAILED'); assert.doesNotMatch(JSON.stringify(r.body),/password|secret|SQL/);
});

test('read failure also hides private database details', async () => {
  const route=await loadRoute(async () => { throw Error('sensitive SQL D:\\private'); });
  const r=await route.GET({url:'http://localhost/api/folder?taskId=1'}); assert.equal(r.status,500); assert.equal(r.body.code,'FOLDER_READ_FAILED'); assert.doesNotMatch(JSON.stringify(r.body),/private|SQL/);
});

test('successful insert and update preserve original paths and behavior', async () => {
  for(const existing of [false,true]) { const calls=[];const route=await loadRoute(async(sql,params)=>{calls.push({sql,params});return calls.length===1&&existing?[{FolderID:1}]:[];});const r=await route.POST(request());assert.equal(r.status,200);assert.equal(r.body.success,true);assert.equal(calls[1].params.includes(payload.FileName),true);assert.equal(calls[1].params.includes(payload.FolderPath),true); }
});

test('modal shows the returned friendly save message and only closes after success', async () => {
  const text=await fs.readFile(new URL('../components/FolderModal.jsx',import.meta.url),'utf8');
  assert.match(text,/if \(d\.success\) \{[\s\S]*?onClose\(\);\s*\} else showToast\(d\.error \|\| 'ذخیرهٔ اطلاعات پوشه انجام نشد؛ دوباره تلاش کنید\.', 'error'\)/);
  assert.match(text,/FileName: fileName, fileName/); assert.match(text,/FolderPath: folderPath, folderPath/);
});
