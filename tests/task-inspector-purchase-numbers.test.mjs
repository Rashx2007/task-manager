// SQL/HTTP are mocked; no live database or Explorer is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
const routeSource = await fs.readFile(new URL('../app/api/task-inspector/route.js', import.meta.url), 'utf8');
async function load(requests) {
  const calls=[], context=vm.createContext({URL});
  const module=new vm.SourceTextModule(routeSource,{context});
  await module.link(spec=>{
    const exports=spec==='next/server'?{NextResponse:{json:(body,options)=>({body,...options})}}:spec==='@/lib/task-inspection'?{parseTaskId:value=>/^\d+$/.test(String(value))&&Number(value)>0?Number(value):null}:{query:async(sql,params)=>{calls.push({sql,params});if(sql.includes('FROM Tsk_tbl'))return[{TaskID:202,RequestID:9999}];if(sql.includes('FROM Purchase_Request_tbl'))return requests;if(sql.includes('FROM Follow_tbl'))return[];throw Error('unexpected SQL');}};
    return new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{context});
  });await module.evaluate();const response=await module.namespace.GET({url:'http://test/api/task-inspector?taskId=202&details=1'});return{response,calls,api:module.namespace};
}
test('Request and purchase numbers are returned together, never substituted with internal IDs',async()=>{
  const {response}=await load([{RequestNumber:4671,RegisterNumber:'2734'}]);
  assert.equal(response.status,200);assert.equal(response.body.data.task.RequestNumber,'4671');assert.equal(response.body.data.task.RegisterNumber,'2734');
});
test('All three purchase-number segments and leading zeroes are preserved verbatim',async()=>{
  const {response}=await load([{RequestNumber:4671,RegisterNumber:'002734-0012-0009'}]);assert.equal(response.body.data.task.RegisterNumber,'002734-0012-0009');
});
test('Existing slash separators are not converted or reversed',async()=>{
  const {response}=await load([{RequestNumber:4671,RegisterNumber:'2734/12/9'}]);assert.equal(response.body.data.task.RegisterNumber,'2734/12/9');
});
test('Multiple registered values are retained without repeating identical numbers',async()=>{
  const {response}=await load([{RequestNumber:11,RegisterNumber:'001-2-3'},{RequestNumber:11,RegisterNumber:'001-2-3'},{RequestNumber:12,RegisterNumber:'004-5-6'}]);assert.equal(response.body.data.task.RequestNumber,'11، 12');assert.equal(response.body.data.task.RegisterNumber,'001-2-3، 004-5-6');
});
test('Missing purchase numbers are null, while zero remains a registered value',async()=>{
  for(const value of [null,undefined,'','  ']){const {response}=await load([{RequestNumber:4671,RegisterNumber:value}]);assert.equal(response.body.data.task.RegisterNumber,null);assert.equal(response.body.data.task.RequestNumber,'4671');}
  const {response}=await load([{RequestNumber:0,RegisterNumber:0}]);assert.equal(response.body.data.task.RegisterNumber,'0');assert.equal(response.body.data.task.RequestNumber,'0');
});
test('Numbers are read for the selected task using parameterized, read-only SQL',async()=>{
  const {calls,response,api}=await load([]);const query=calls.find(row=>row.sql.includes('Purchase_Request_tbl'));assert.ok(query.sql.includes('SELECT RequestNumber, RegisterNumber'));assert.ok(query.sql.includes('WHERE TaskID = ?'));assert.deepEqual(Array.from(query.params),[202]);for(const row of calls)assert.ok(!/\b(UPDATE|INSERT|DELETE)\b/.test(row.sql));assert.equal(response.headers['Cache-Control'],'no-store');assert.deepEqual(Object.keys(api),['GET']);
});
test('Inspector retains attachments and renders both number rows with isolated LTR text',async()=>{
  const source=await fs.readFile(new URL('../components/TaskInspector.jsx',import.meta.url),'utf8');assert.ok(source.includes("['شماره درخواست کار', task.RequestNumber]"));assert.ok(source.includes("['شماره خرید', task.RegisterNumber]"));assert.ok(source.includes("label === 'شماره خرید' || label === 'شماره درخواست کار' ? 'ltr'"));assert.ok(source.includes("unicodeBidi: 'isolate'"));assert.ok(source.includes('onClick={openAttachments}'));assert.ok(source.includes("'ثبت نشده' : value"));
});
