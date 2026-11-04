import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const src = (await fs.readFile(new URL('../components/TaskForm.jsx', import.meta.url), 'utf8')).replace(/\r\n?/g, '\n');
const a = src.indexOf('const formFromTask ='), b = src.indexOf('\n\nimport TaskContextHeader', a);
const ea = src.indexOf('  useEffect(() => {\n    if (!initial) return;'), eb = src.indexOf('\n  }, [initial]);', ea);
assert.ok(a >= 0 && b > a && ea >= 0 && eb > ea);
const helper = src.slice(a, b), effect = src.slice(ea, eb + '\n  }, [initial]);'.length);
async function load(initial, {taskResponse, fail=false}={}) {
  const state = {form:null, reads:[], taskLoading:[], errors:[], functor:'', status:null};
  const c = vm.createContext({ initial, Number, String, Boolean,
    loadedStatusRef: {current:0}, setForm:v=>{state.form = typeof v === 'function' ? v(state.form) : v;},
    setReadingTask:v=>state.taskLoading.push(v), setReadError:v=>state.errors.push(v), setFunctorName:v=>state.functor=v,
    useEffect: fn=>fn(), fetch:async url=>{state.reads.push(url); if(fail) throw Error('offline');return {ok:true,json:async()=>url.startsWith('/api/applicant-functor')?{success:true,exists:false}:{success:true,data:taskResponse}};}
  });
  vm.runInContext(helper+'\n'+effect,c); await new Promise(r=>setTimeout(r,5));state.status=c.loadedStatusRef.current;return state;
}
const copy={TaskID:undefined,TaskTtl:'پمپ',Descriptions:'جزئیات',TDP:'بالا',tskType:'فنی',ResolvedAssetID:17,ApplicantName:'علی',Complited:0,FixedDueTime:0};
test('copy initializes supplied data without requesting undefined task or applicant',async()=>{const h=await load(copy);assert.equal(h.form.TaskTtl,'پمپ');assert.equal(h.form.Descriptions,'جزئیات');assert.equal(h.form.AssetID,'17');assert.equal(h.form.Priorities,'بالا');assert.equal(h.form.ApplicantName,'علی');assert.deepEqual(h.reads,[]);assert.deepEqual(h.errors,[]);});
test('copy retains cleared status, planned times and request identifiers',async()=>{const h=await load(copy);assert.equal(h.form.Complited,0);assert.equal(h.form.FixedDueTime,false);for(const k of ['DueDateTime','EndDateTime','RequestNumber','RegisterNumber','RequestDate'])assert.equal(h.form[k],'');});
test('existing task still loads fresh details and applicant',async()=>{const h=await load({TaskID:42},{taskResponse:{TaskTtl:'از سرور',Complited:1,RequestNumber:23}});assert.deepEqual(h.reads,['/api/tasks/42','/api/applicant-functor?taskId=42']);assert.equal(h.form.TaskTtl,'از سرور');assert.equal(h.form.RequestNumber,'23');assert.equal(h.status,1);assert.deepEqual(h.taskLoading,[true,false]);});
test('existing task read failure remains an error and never seeds incomplete data',async()=>{const h=await load({TaskID:42,TaskTtl:'stale'},{fail:true});assert.equal(h.form,null);assert.deepEqual(h.errors,['دریافت اطلاعات کار ناموفق بود.']);assert.deepEqual(h.taskLoading,[true,false]);});
test('new blank form does not fetch a task',async()=>{const h=await load(null);assert.deepEqual(h.reads,[]);assert.equal(h.form,null);});
test('initial loading uses task ID, submit continues to distinguish new from existing',()=>{assert.match(src,/useState\(Boolean\(initial\?\.TaskID\)\)/);assert.match(src,/const wasNew = !currentTaskId/);assert.match(src,/fetch\("\/api\/tasks", \{\s*method: "POST"/);});
