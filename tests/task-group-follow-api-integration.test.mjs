// Actual API + reader + service module graph; SQL/NextResponse are doubles.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import vm from 'node:vm';import {fileURLToPath} from 'node:url';import {createHash,randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
async function setup(){
 const calls=[];const execute=async(sql,params=[])=>{
  calls.push({sql,params});
  if(sql.includes('AS Ready'))return[{Ready:1}];if(sql.includes('SELECT MigrationKey'))return[{MigrationKey:'20261025_001_task_groups'}];if(sql.includes('AS IndexCount'))return[{IndexCount:2,ForeignKeyCount:7}];
  if(sql.includes('SELECT TaskID FROM dbo.Tsk_tbl'))return[{TaskID:params[0]}];
  if(sql.includes('SELECT GroupID FROM dbo.TaskGroupMember'))return[];
  if(sql.includes('group-follow-context:mark'))return[];if(sql.includes('group-follow-context:final'))return[];
  if(sql.includes('group-follow-context:rows'))return[{FollowID:41,TaskID:101,Description:'test',DueDateTime:'2026-11-01T12:15:00Z',EndDateTime:'2026-11-01T12:20:00Z',Duration:'00:05:00',Priorities:null,LastPriority:null,BatchID:null,LinkedTaskID:null,BatchGroupID:null,BatchOriginTaskID:null}];
  if(sql.includes('sp_getapplock'))return[{LockResult:0}];if(sql.includes('group-follow:operation'))return[];if(sql.includes('group-follow:group'))return[];
  throw Error('Unexpected SQL, including any write: '+sql);
 };
 const db={query:execute,runTransaction:async fn=>fn(execute)};
 const context=vm.createContext({URL,Date});const modules=new Map();
 function synthetic(key,values){if(!modules.has(key))modules.set(key,new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v)},{context,identifier:key}));return modules.get(key);}
 async function get(file){if(modules.has(file))return modules.get(file);const pending=fs.readFile(file,'utf8').then(s=>new vm.SourceTextModule(s,{context,identifier:file}));modules.set(file,pending);return pending;}
 const route=await get(path.join(root,'app/api/task-groups/follow/route.js'));
 await route.link(async(name,ref)=>{if(name==='server-only')return synthetic(name,{});if(name==='node:crypto')return synthetic(name,{createHash,randomUUID});if(name==='next/server')return synthetic(name,{NextResponse:{json:(body,options)=>({body,...options})}});const file=name.startsWith('@/')?path.join(root,name.slice(2)+'.js'):path.resolve(path.dirname(ref.identifier),name+'.js');if(file===path.join(root,'lib/db.js'))return synthetic(file,db);return get(file);});await route.evaluate();return{api:route.namespace,calls};
}
const payload=extra=>({groupId:1,taskId:101,expectedGroupVersion:'0000000000000001',requestId:'11111111-1111-4111-8111-111111111111',recipientTaskIds:[101],description:'test',dueDateTime:'2026-11-01 12:15:00',endDateTime:'2026-11-01 12:20:00',updateDescription:false,...extra});
test('Real GET module graph returns independent context using SELECT only',async()=>{const h=await setup(),r=await h.api.GET({url:'http://local/api/task-groups/follow?taskId=101'});assert.equal(r.status,200);assert.equal(r.body.success,true);assert.equal(r.body.data.taskId,101);assert.equal(r.body.data.group,null);assert.equal(r.body.data.follows[0].CanEditIndependent,true);assert.ok(h.calls.every(c=>!/^\s*(?:\/\*.*?\*\/\s*)?(?:UPDATE|INSERT|DELETE)/.test(c.sql)));});
test('Real API rejects missing request ID with a safe 400 and zero SQL',async()=>{const h=await setup(),r=await h.api.POST({json:async()=>payload({requestId:undefined})});assert.equal(r.status,400);assert.equal(r.body.code,'INVALID_OPERATION_ID');assert.equal(h.calls.length,0);});
test('Real API rejects invalid wall calendar before opening transaction',async()=>{const h=await setup(),r=await h.api.POST({json:async()=>payload({dueDateTime:'2026-02-29 12:00:00'})});assert.equal(r.status,400);assert.equal(r.body.code,'INVALID_TIME');assert.equal(h.calls.length,0);});
test('Existing helper error identity is shared: absent group produces 409, not leaked SQL or false success',async()=>{const h=await setup(),r=await h.api.POST({json:async()=>payload()});assert.equal(r.status,409);assert.equal(r.body.success,false);assert.equal(r.body.code,'GROUP_INACTIVE');assert.ok(!JSON.stringify(r).includes('Unexpected SQL'));assert.ok(h.calls.every(c=>!/^\s*(?:\/\*.*?\*\/\s*)?(?:UPDATE|INSERT|DELETE)/.test(c.sql)));});
test('Independent PUT body cannot silently become a group update without BatchID',async()=>{const h=await setup(),r=await h.api.PUT({json:async()=>payload({followId:41})});assert.equal(r.status,400);assert.equal(r.body.code,'INVALID_OPERATION_ID');assert.equal(h.calls.length,0);});
