// Static source-contract checks ONLY. This does NOT execute or parse SQL on SQL Server.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const sql=await fs.readFile(new URL('../database/migrations/20261030_001_task_status_history.sql',import.meta.url),'utf8');
const clean=sql.replace(/--[^\r\n]*/g,'');
test('Migration targets WorkDB and refuses ambient/implicit transactions',()=>{
 for(const token of ['USE [WorkDB]','DB_NAME() <>','@@TRANCOUNT <> 0','(@@OPTIONS & 2) = 2','compatibility_level'])assert.ok(clean.includes(token),token);
 assert.ok(clean.indexOf('@@TRANCOUNT <> 0')<clean.indexOf('BEGIN TRANSACTION'));
});
test('Schema install is explicitly transactional and serialized',()=>{
 for(const token of ['SET XACT_ABORT ON','BEGIN TRY','BEGIN TRANSACTION','sys.sp_getapplock',"@LockOwner = N'Transaction'",'IF @LockResult < 0','COMMIT TRANSACTION','BEGIN CATCH','IF XACT_STATE() <> 0 ROLLBACK TRANSACTION','THROW;'])assert.ok(clean.includes(token),token);
});
test('Foundation creates only one history table and never writes existing work data',()=>{
 assert.equal((clean.match(/CREATE TABLE dbo\./g)||[]).length,1);
 assert.ok(!/\b(?:UPDATE|DELETE|TRUNCATE|DROP|MERGE)\b/i.test(clean));
 assert.ok(!/\b(?:INSERT\s+(?:INTO\s+)?|ALTER\s+TABLE\s+)(?:dbo\.)?(?:Tsk_tbl|TimeDate_tbl|Follow_tbl)\b/i.test(clean));
 assert.ok(!/dbo\.(?:Tsk_tbl|TimeDate_tbl|Follow_tbl|TaskGroup\w*)\b/.test(clean));
 assert.ok(!/INSERT\s+(?:INTO\s+)?dbo\.TaskStatusHistory/i.test(clean));
});
test('Snapshots, operation identity and old/new status are mandatory',()=>{
 for(const token of ['OperationID uniqueidentifier NOT NULL','BeforeStatus bit NOT NULL','AfterStatus bit NOT NULL','BeforeState nvarchar(max) NOT NULL','AfterState nvarchar(max) NOT NULL','ISJSON(BeforeState) = 1','ISJSON(AfterState) = 1','UQ_TaskStatusHistory_Operation UNIQUE (OperationID)'])assert.ok(clean.includes(token),token);
});
test('Complete/reopen transitions are constrained; restoration points to the same task',()=>{
 for(const token of ["Action = N'COMPLETE' AND BeforeStatus = 0 AND AfterStatus = 1","Action = N'REOPEN' AND BeforeStatus = 1 AND AfterStatus = 0","Action = N'RESTORE'",'FOREIGN KEY (RestoresHistoryID, TaskID)','REFERENCES dbo.TaskStatusHistory(HistoryID, TaskID)','UNIQUE (HistoryID, TaskID)'])assert.ok(clean.includes(token),token);
 assert.ok(!/ON DELETE CASCADE/i.test(clean));
});
test('UTC timestamp, app wall clock and SQL login have distinct meanings',()=>{
 for(const token of ['CreatedAtUTC datetime2(3)','DEFAULT SYSUTCDATETIME()','OccurredAtWall datetime2(0) NOT NULL','DatabaseLogin nvarchar(128)','DEFAULT ORIGINAL_LOGIN()','AppActor nvarchar(128) NULL','Source nvarchar(100) NOT NULL'])assert.ok(clean.includes(token),token);
});
test('Rerun requires known schema version and active trusted constraints; no automatic repair',()=>{
 for(const token of ["IF OBJECT_ID(N'dbo.TaskStatusHistory', N'U') IS NULL",'TaskStatusHistorySchemaVersion','20261030_001_status_history','sys.columns','c.is_identity <> e.IsIdentity','sys.check_constraints','is_disabled = 0 AND is_not_trusted = 0','sys.foreign_keys','sys.indexes','sys.default_constraints'])assert.ok(clean.includes(token),token);
 assert.ok(!/\bALTER TABLE\b/i.test(clean));
});
test('Expected column inventory matches all 14 declared history fields',()=>{
 const columns=['HistoryID','OperationID','TaskID','Action','BeforeStatus','AfterStatus','BeforeState','AfterState','CreatedAtUTC','OccurredAtWall','Source','DatabaseLogin','AppActor','RestoresHistoryID'];
 for(const col of columns)assert.ok(clean.includes("(N'"+col+"', N'"),col);
 assert.ok(clean.includes('WHERE object_id = @ObjectID) <> 14'));
});
