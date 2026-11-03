// Executes the real page loader with fake fetch/React setters. No SQL or browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const page=(await fs.readFile(new URL('../app/page.js',import.meta.url),'utf8')).replace(/\r\n?/g,'\n');
const panel=(await fs.readFile(new URL('../components/SearchPanel.jsx',import.meta.url),'utf8')).replace(/\r\n?/g,'\n');
const start=page.indexOf('  const loadTasks = useCallback(async'),end=page.indexOf('\n  useEffect',start);
assert.ok(start>=0&&end>start,'real loader found');
const loader=page.slice(start,end);
const payload={taskID:'202',requestNumber:'',propertyCode:''};
const row=(id,status,extra={})=>({TaskID:id,Complited:status,TaskTtl:'task '+id,...extra});
const response=(data,ok=true)=>({ok,json:async()=>data});
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function setup(fetch,{dirty=true,source={kind:'simple',payload},type='search',rows=[row(202,0)]}={}){
 const state={tasks:[],total:-1,error:'',loading:false,selected:row(202,0),nextSwitch:null};
 const refs={loadRequestRef:{current:0},loadTypeRef:{current:type},searchSourceRef:{current:source},searchRowsRef:{current:rows},searchNeedsRefreshRef:{current:dirty}};
 const set=(key,value)=>state[key]=typeof value==='function'?value(state[key]):value;
 const context=vm.createContext({...refs,fetch,useCallback:fn=>fn,PAGE_SIZE:10,
  setTasksLoading:v=>set('loading',v),setLoadError:v=>set('error',v),setTasks:v=>set('tasks',v),setTotalFiltered:v=>set('total',v),setSelectedTask:v=>set('selected',v),setNextSwitch:v=>set('nextSwitch',v),
  normalizeDigits:v=>String(v??''),sortSearchRows:rows=>[...rows].sort((a,b)=>b.TaskID-a.TaskID),applyClientFilters:(rows,filters)=>rows.filter(r=>!filters.status||filters.status.includes(Number(r.Complited)===1?'اتمام':'جاری'))});
 vm.runInContext(loader+'\nthis.load=loadTasks;',context);return{load:context.load,state,refs};
}
test('successful refresh repeats the exact submitted simple-search payload and updates status and selected row',async()=>{
 const calls=[],h=setup(async(url,opts)=>{calls.push({url,opts});return response({success:true,data:[row(202,1),row(101,0)]});});await h.load({},1);
 assert.equal(calls[0].url,'/api/search');assert.deepEqual(JSON.parse(calls[0].opts.body),payload);assert.equal(h.state.tasks[0].Complited,1);assert.equal(h.state.selected.Complited,1);assert.equal(h.state.total,2);assert.equal(h.refs.searchNeedsRefreshRef.current,false);assert.equal(h.state.loading,false);
});
test('current column filters and paging apply to newly refreshed data',async()=>{const h=setup(async()=>response({success:true,data:[row(202,1),row(101,0)]}));await h.load({status:['جاری']},1);assert.equal(h.state.total,1);assert.equal(h.state.tasks[0].TaskID,101);});
test('normal paging without a pending refresh reuses cache and does not fetch',async()=>{let calls=0;const h=setup(async()=>{calls++;},{dirty:false});await h.load({},1);assert.equal(calls,0);assert.equal(h.state.tasks[0].Complited,0);});
test('failed or malformed refresh retains dirty flag and does not silently install an empty result',async()=>{for(const reply of [response({success:false,error:'private'},false),response({success:true,data:null})]){const h=setup(async()=>reply);await h.load({},1);assert.equal(h.refs.searchNeedsRefreshRef.current,true);assert.equal(h.refs.searchRowsRef.current[0].Complited,0);assert.match(h.state.error,/بازخوانی/);assert.doesNotMatch(h.state.error,/private/);assert.equal(h.state.loading,false);}});
test('network failure leaves the refresh pending',async()=>{const h=setup(async()=>{throw Error('offline');});await h.load({},1);assert.equal(h.refs.searchNeedsRefreshRef.current,true);assert.notEqual(h.state.error,'');assert.equal(h.state.loading,false);});
test('superseded refresh cannot overwrite a newer refresh result',async()=>{const one=defer(),two=defer();let n=0;const h=setup(async()=>++n===1?one.promise:two.promise);const first=h.load({},1),second=h.load({},1);two.resolve(response({success:true,data:[row(202,1)]}));await second;one.resolve(response({success:true,data:[row(202,0)]}));await first;assert.equal(h.state.tasks[0].Complited,1);assert.equal(h.state.selected.Complited,1);assert.equal(h.state.loading,false);});
test('a newer search result invalidates an in-flight old refresh',async()=>{const wait=defer(),h=setup(()=>wait.promise);const old=h.load({},1);h.refs.loadRequestRef.current++;h.refs.searchSourceRef.current={kind:'simple',payload:{taskID:'404',requestNumber:'',propertyCode:''}};h.refs.searchRowsRef.current=[row(404,0)];h.refs.searchNeedsRefreshRef.current=false;wait.resolve(response({success:true,data:[row(202,1)]}));await old;assert.equal(h.refs.searchRowsRef.current[0].TaskID,404);});
test('source without a simple-search payload does not accidentally rerun an old query',async()=>{let calls=0;const h=setup(async()=>{calls++;},{source:null});await h.load({},1);assert.equal(calls,0);assert.equal(h.state.tasks[0].TaskID,202);});
test('the form save marks the simple search dirty before the reload, and errors offer retry',()=>{assert.match(page,/searchNeedsRefreshRef\.current = true;\s*setTasksLoading\(true\);\s*\}\s*setReloadKey/);assert.match(page,/observedReloadKeyRef\.current !== reloadKey/);assert.match(page,/searchNeedsRefreshRef\.current && searchSourceRef\.current\?\.kind === "simple" \? "تلاش دوباره"/);});
test('submitted criteria are captured per request and passed with the corresponding result',()=>{assert.match(panel,/const payload = \{ taskID, requestNumber, propertyCode \};/);assert.match(panel,/JSON\.stringify\(payload\)/);assert.match(panel,/onResult\(d\.data \|\| \[\], \{ kind: 'simple', payload \}\)/);});
