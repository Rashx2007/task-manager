// VM/SQL doubles only; not a real SQL Server or HTTP test.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
const getSource=async p=>(await fs.readFile(new URL(`../${p}`,import.meta.url),'utf8')).replace(/\r\n?/g,'\n');
async function harness(options={}) {
  const events=[],updates=[]; let active=false, waiters=[];
  const ctx=vm.createContext({console,Date});
  async function acquire(){if(active) await new Promise(resolve=>waiters.push(resolve)); active=true;}
  function release(){active=false;const next=waiters.shift();if(next) next();}
  const query=async sql=>{events.push('get');return options.empty?[]:[{StartWorkTime:'07:30:00',restTimeStart:'12:00:00',restTimeEnd:'13:00:00',EndWorkTime:'16:00:00',IgnoreTimeSettings:1}];};
  const runTransaction=async work=>{
    events.push('begin');let locked=false;
    const tx=async(sql,params=[])=>{
      if(sql.includes('AS LockResult')) {events.push('lock-request');assert.equal(params[0],'task-manager:schedule');if(options.busy)return [{LockResult:-1}];await acquire();locked=true;events.push('locked');return [{LockResult:0}];}
      if(sql.includes('UPDATE Set_tbl')){events.push('update');if(options.sqlError)throw Error('secret SQL details');assert.equal(locked,true);assert.equal((sql.match(/\?/g)||[]).length,params.length);if(options.onUpdate)await options.onUpdate();updates.push(Array.from(params));return [];}
      throw Error('unexpected SQL');
    };
    try {const result=await work(tx);events.push('commit');return result;}catch(e){events.push('rollback');throw e;}finally{if(locked)release();}
  };
  const cache=new Map();
  async function module(spec){
    if(cache.has(spec))return cache.get(spec);
    let m;
    if(spec==='next/server') m=new vm.SyntheticModule(['NextResponse'],function(){this.setExport('NextResponse',{json:(body,opts={})=>({body,status:opts.status||200})});},{context:ctx});
    else if(spec==='@/lib/db'||spec==='./db')m=new vm.SyntheticModule(['query','runTransaction'],function(){this.setExport('query',query);this.setExport('runTransaction',runTransaction);},{context:ctx});
    else if(spec==='server-only')m=new vm.SyntheticModule([],function(){},{context:ctx});
    else if(spec==='./assetRules')m=new vm.SyntheticModule(['normalizeDigits'],function(){this.setExport('normalizeDigits',String);},{context:ctx});
    else if(spec==='@/lib/task-groups')m=new vm.SourceTextModule(await getSource('lib/task-groups.js'),{context:ctx,identifier:spec});
    else throw Error('unexpected import '+spec);
    cache.set(spec,m);return m;
  }
  const route=new vm.SourceTextModule(await getSource('app/api/settings/route.js'),{context:ctx});await route.link(module);await route.evaluate();
  return {api:route.namespace,events,updates};
}
const request=(body={startWork:'07:30',restStart:'12:00',restEnd:'13:00',endWork:'16:00',ignore:true})=>({json:async()=>body});
test('settings POST acquires the actual schedule app-lock on the same transaction before parameterized UPDATE',async()=>{
  const h=await harness(),r=await h.api.POST(request());assert.equal(r.status,200);assert.equal(r.body.success,true);assert.deepEqual(h.events,['begin','lock-request','locked','update','commit']);assert.deepEqual(h.updates[0],['07:30:00','12:00:00','13:00:00','16:00:00',1]);
});
test('settings lock timeout fails closed and gives a safe 409 response',async()=>{
  const h=await harness({busy:true}),r=await h.api.POST(request());assert.equal(r.status,409);assert.equal(r.body.code,'GROUP_BUSY');assert.equal(r.body.success,false);assert.equal(h.updates.length,0);assert.deepEqual(h.events,['begin','lock-request','rollback']);
});
test('SQL failure rolls back and hides SQL detail',async()=>{
  const h=await harness({sqlError:true}),r=await h.api.POST(request());assert.equal(r.status,500);assert.equal(r.body.success,false);assert.ok(!JSON.stringify(r).includes('secret'));assert.equal(h.updates.length,0);assert.equal(h.events.at(-1),'rollback');
});
test('concurrent settings saves serialize until first transaction ends',async()=>{
  let release,started;const hold=new Promise(r=>release=r), entered=new Promise(r=>started=r);let calls=0;
  const h=await harness({onUpdate:async()=>{if(++calls===1){started();await hold;}}});const a=h.api.POST(request());await entered;const b=h.api.POST(request({startWork:'08:00',restStart:'12:00',restEnd:'13:00',endWork:'17:00',ignore:false}));
  await new Promise(r=>setTimeout(r,10));assert.equal(h.events.filter(x=>x==='update').length,1);release();assert.equal((await a).status,200);assert.equal((await b).status,200);assert.deepEqual(h.updates.map(x=>x[0]),['07:30:00','08:00:00']);assert.equal(h.updates[1][4],0);
  assert.ok(h.events.indexOf('commit')<h.events.lastIndexOf('locked'));
});
test('GET retains successful response contract and does not start a transaction',async()=>{
  const h=await harness(),r=await h.api.GET();assert.equal(r.status,200);assert.equal(r.body.data.startWork,'07:30');assert.equal(r.body.data.ignore,true);assert.deepEqual(h.events,['get']);
});
test('GET retains 404 when settings row is absent',async()=>{const h=await harness({empty:true}),r=await h.api.GET();assert.equal(r.status,404);assert.equal(r.body.success,false);});
test('settings write never requires group migration schema',async()=>{const s=await getSource('app/api/settings/route.js');assert.ok(!s.includes('assertTaskGroupSchema'));assert.ok(!s.includes('TaskGroupMember'));});
