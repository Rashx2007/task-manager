import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
const src=await fs.readFile(new URL('../app/api/task-groups/create/route.js',import.meta.url),'utf8');
async function load(opts={}){
  const mk=opts.mkFail;
  const calls=[];
  class TaskGroupError extends Error{constructor(c,m,s){super(m);this.code=c;this.status=s;}}
  const mod={exports:{}};
  const code=src.replace(/^import .*$/gm,'').replace(/export const /g,'exports.').replace(/export async function (\w+)/g,'exports.$1 = async function $1');
  const ctx=vm.createContext({exports:mod.exports,
    NextResponse:{json:(body,init)=>({body,status:init?.status??200})},
    previewGroupCreation:async b=>{calls.push(['preview',b]);if(opts.fail)throw(typeof opts.fail==='function'?opts.fail(TaskGroupError):opts.fail);return{ready:true};},
    createTaskGroup:async b=>{calls.push(['create',b]);if(opts.fail)throw(typeof opts.fail==='function'?opts.fail(TaskGroupError):opts.fail);return{groupId:1};},
    TaskGroupError});
  vm.runInContext(code,ctx);
  return{api:mod.exports,calls,TaskGroupError};
}
const req=b=>({json:async()=>{if(b===undefined)throw Error('x');return b;}});
test('preview delegates only to preview without mode',async()=>{const h=await load();const r=await h.api.POST(req({mode:'preview',selectedTaskIds:[1,2],referenceTaskId:1}));assert.equal(r.status,200);assert.equal(JSON.stringify(h.calls),JSON.stringify([['preview',{selectedTaskIds:[1,2],referenceTaskId:1}]]));});
test('create delegates only to create',async()=>{const h=await load();const r=await h.api.POST(req({mode:'create',title:'t'}));assert.equal(r.body.data.groupId,1);assert.equal(h.calls[0][0],'create');});
test('invalid mode and bad JSON never reach services',async()=>{const h=await load();assert.equal((await h.api.POST(req({mode:'x'}))).status,400);assert.equal((await h.api.POST(req())).status,400);assert.equal(h.calls.length,0);});
test('controlled errors keep code/status; unknown errors are hidden',async()=>{let h=await load({fail:E=>new E('GROUP_PREVIEW_CHANGED','m',409)});let r=await h.api.POST(req({mode:'create'}));assert.equal(r.status,409);assert.equal(r.body.code,'GROUP_PREVIEW_CHANGED');h=await load({fail:Error('private SQL')});r=await h.api.POST(req({mode:'create'}));assert.equal(r.status,500);assert.ok(!JSON.stringify(r.body).includes('private'));});
test('only POST is exported',async()=>{const h=await load();assert.equal(Object.keys(h.api).filter(k=>/^[A-Z]+$/.test(k)).join(),'POST');});
