// Execute the actual submit handler with UI/SQL calls mocked; no browser or SQL Server.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source = (await fs.readFile(new URL('../components/TaskForm.jsx', import.meta.url), 'utf8')).replace(/\r\n?/g, '\n');
const start = source.indexOf('  const handleSubmit = async'), end = source.indexOf('\n  const inp', start);
assert.ok(start >= 0 && end > start, 'actual submit handler must be found');
const handler = source.slice(start, end);
async function submit({loaded=0,chosen=1,serverStatus=chosen,putOk=true,putSuccess=true,networkError=false,completionOk=true,done=false,clickedTimes=false,clickedPeople=false,noClose=false}={}) {
  const calls=[], notices=[], events=[];
  const state={saved:0,refreshed:0,closed:0,asks:0,times:0,people:0,saving:null,form:{TaskTtl:'test',Descriptions:'draft',Priorities:'زمان انجام ثابت',FixedDueTime:true,Complited:chosen,AssetID:'',RequestNumber:'',RegisterNumber:'',RequestDate:''}};
  const loadedStatusRef={current:loaded}, timeDateClickedRef={current:clickedTimes}, autoTimeDateRef={current:false}, pendingCloseAskRef={current:false};
  const context=vm.createContext({form:state.form,currentTaskId:202,loadedStatusRef,
    showToast:(...args)=>{notices.push(args);events.push('toast');},alert:()=>events.push('alert'),setSaving:v=>{state.saving=v;},setForm:fn=>{state.form=fn(state.form);},setCurrentTaskId:()=>{},markSaved:()=>{state.saved++;events.push('saved');},
    onSaved:()=>{state.refreshed++;events.push('refresh');},onClose:noClose?null:()=>{state.closed++;events.push('close');},askComplete:async()=>{state.asks++;events.push('ask');return done;},
    applicantClickedRef:{current:clickedPeople},timeDateClickedRef,autoTimeDateRef,pendingCloseAskRef,setShowTimeDate:()=>{state.times++;events.push('time');},setShowAFModal:()=>{state.people++;events.push('people');},confirm:()=>false,
    fetch:async(url,options)=>{calls.push({url,options});if(networkError)throw Error('network');if(url==='/api/complete')return{ok:completionOk,json:async()=>({success:completionOk,error:'safe error'})};return{ok:putOk,json:async()=>({success:putSuccess,Complited:serverStatus,error:'safe error'})};}});
  vm.runInContext(handler+'\nthis.submit=handleSubmit;',context); await context.submit({preventDefault(){}});
  return {state,calls,notices,events,loadedStatusRef,timeDateClickedRef,autoTimeDateRef,pendingCloseAskRef};
}
test('explicit completion closes on first successful edit, without a second request or question',async()=>{
  const h=await submit();const b=JSON.parse(h.calls[0].options.body);assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,'/api/tasks/202');assert.equal(b.statusIntent,'change');assert.equal(b.expectedStatus,0);assert.equal(b.Complited,1);assert.equal(h.loadedStatusRef.current,1);assert.equal(h.state.closed,1);assert.equal(h.state.refreshed,1);assert.equal(h.state.asks,0);assert.ok(h.events.indexOf('refresh')<h.events.indexOf('close'));assert.equal(h.state.saving,false);
});
test('editing an already completed task also closes once on success',async()=>{const h=await submit({loaded:1,chosen:1,serverStatus:1});assert.equal(h.state.closed,1);assert.equal(h.state.asks,0);assert.equal(JSON.parse(h.calls[0].options.body).statusIntent,'preserve');});
test('reopening asks immediately; a no answer proceeds to time and priority without a second PUT',async()=>{
  const h=await submit({loaded:1,chosen:0,serverStatus:0,done:false});const b=JSON.parse(h.calls[0].options.body);assert.equal(b.statusIntent,'change');assert.equal(b.expectedStatus,1);assert.equal(b.Complited,0);assert.equal(h.calls.length,1);assert.equal(h.state.asks,1);assert.equal(h.state.times,1);assert.equal(h.state.closed,0);assert.equal(h.loadedStatusRef.current,0);assert.equal(h.timeDateClickedRef.current,true);assert.equal(h.autoTimeDateRef.current,true);
});
test('when time was already addressed a no answer proceeds to performer',async()=>{const h=await submit({loaded:1,chosen:0,serverStatus:0,done:false,clickedTimes:true});assert.equal(h.state.asks,1);assert.equal(h.state.times,0);assert.equal(h.state.people,1);assert.equal(h.pendingCloseAskRef.current,true);assert.equal(h.calls.length,1);});
test('reopening then explicitly answering yes completes through audited API and opens performer step',async()=>{const h=await submit({loaded:1,chosen:0,serverStatus:0,done:true});assert.equal(h.state.asks,1);assert.equal(h.calls.length,2);assert.equal(h.calls[1].url,'/api/complete');assert.deepEqual(JSON.parse(h.calls[1].options.body),{taskId:202});assert.equal(h.loadedStatusRef.current,1);assert.equal(h.state.people,1);assert.equal(h.pendingCloseAskRef.current,true);});
test('failed follow-up completion preserves the reopened state and keeps the form open',async()=>{const h=await submit({loaded:1,chosen:0,serverStatus:0,done:true,completionOk:false});assert.equal(h.state.closed,0);assert.equal(h.loadedStatusRef.current,0);assert.ok(h.notices.some(n=>n[1]==='error'));assert.equal(h.state.saving,false);});
test('failed edit and network failure neither close nor start the next steps',async()=>{for(const x of [{putOk:false},{putSuccess:false},{networkError:true}]){const h=await submit(x);assert.equal(h.state.saved,0);assert.equal(h.state.refreshed,0);assert.equal(h.state.closed,0);assert.equal(h.state.asks,0);assert.ok(h.notices.some(n=>n[1]==='error'));assert.equal(h.state.saving,false);}});
test('stale in-progress form receiving completed state neither closes nor prompts',async()=>{const h=await submit({loaded:0,chosen:0,serverStatus:1});assert.equal(h.state.closed,0);assert.equal(h.state.asks,0);assert.equal(h.loadedStatusRef.current,1);assert.equal(JSON.parse(h.calls[0].options.body).statusIntent,'preserve');});
test('a mismatched saved status shows an error without closing or starting another status request',async()=>{for(const x of [{loaded:0,chosen:1,serverStatus:0},{loaded:1,chosen:0,serverStatus:1}]){const h=await submit(x);assert.equal(h.state.closed,0);assert.equal(h.state.asks,0);assert.equal(h.calls.length,1);assert.equal(h.state.saved,1);assert.equal(h.state.refreshed,1);assert.ok(h.notices.some(n=>n[1]==='error'));}});
test('a missing close callback does not turn a successful edit into an error',async()=>{const h=await submit({noClose:true});assert.equal(h.state.saved,1);assert.equal(h.state.refreshed,1);assert.ok(!h.notices.some(n=>n[1]==='error'));});
