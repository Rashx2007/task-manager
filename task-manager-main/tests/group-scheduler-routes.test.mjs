// Route-contract tests use mocked NextResponse/services; no live HTTP or database.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
const routes = [
  ['reschedule','rescheduleTasks','count'], ['move-fixed','moveFixedTaskSchedules','rescheduled'],
  ['correct-priorities','correctTaskPriorities','corrected'], ['priority-increase','increaseTaskPriorities','changed'],
  ['timedate','saveTaskSchedule',null], ['update-schedule','updateTaskSchedule','updated'],
];
async function load(route, name, failure = false) {
  const calls=[], ctx=vm.createContext({Date, console});
  const source=await fs.readFile(new URL(`../app/api/${route}/route.js`,import.meta.url),'utf8');
  const module=new vm.SourceTextModule(source,{context:ctx});
  await module.link(spec=>{
    const values=spec==='next/server'?{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}}:
      spec==='@/lib/db'?{query:()=>{throw Error('standalone SQL forbidden');}}:{
        [name]:async arg=>{calls.push(arg);if(failure)throw Error('mock failure');return route==='timedate'?{success:true,due:'2026-10-26 08:00:00',end:'2026-10-26 09:00:00'}:5;},
        schedulerFailure:()=>({status:409,body:{success:false,error:'safe',code:'GROUP_CHANGED'}}),
      };
    return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context:ctx});
  });await module.evaluate();return{api:module.namespace,calls};
}
for(const[route,name,key]of routes) {
  test(`${route} preserves its successful JSON contract and delegates arguments`,async()=>{
    const h=await load(route,name),body={minutes:15,taskId:1,priority:'3.متوسط',hours:1};
    const r=await h.api.POST({json:async()=>body});assert.equal(r.status,200);assert.equal(r.body.success,true);assert.equal(h.calls.length,1);
    if(key)assert.equal(r.body[key],5);else assert.equal(r.body.due,'2026-10-26 08:00:00');
    if(route==='timedate')assert.equal(h.calls[0],body);if(route==='move-fixed')assert.equal(h.calls[0],15);if(route==='update-schedule')assert.equal(typeof h.calls[0],'function');
  });
  test(`${route} returns the service's safe error and status`,async()=>{
    const h=await load(route,name,true);const r=await h.api.POST({json:async()=>({})});assert.equal(r.status,409);assert.equal(r.body.code,'GROUP_CHANGED');
  });
}
test('Secondary update-schedule callback uses only its transaction executor',async()=>{
  const h=await load('update-schedule','updateTaskSchedule');await h.api.POST();const calls=[];
  const result=await h.calls[0](async(sql,params)=>{calls.push({sql,params});if(sql.includes('SELECT StartWorkTime'))return[{StartWorkTime:'07:30',restTimeStart:'12:00',restTimeEnd:'13:00',EndWorkTime:'16:00'}];if(sql.includes('SELECT tsk.TaskID AS ID'))return[{ID:1,fix:0,pr:'3.متوسط',Due:new Date('2026-10-26T08:00:00Z'),Endd:new Date('2026-10-26T09:00:00Z')}];return[];});
  assert.equal(result,1);assert.equal(calls.filter(r=>r.sql.includes('UPDATE ')).length,2);for(const r of calls.filter(r=>r.params))assert.equal((r.sql.match(/\?/g)||[]).length,r.params.length);
});
