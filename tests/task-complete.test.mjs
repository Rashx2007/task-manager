// Route services and browser APIs are mocked. No real database writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const routeText=await fs.readFile(new URL('../app/api/complete/route.js',import.meta.url),'utf8');
const pageText=await fs.readFile(new URL('../app/page.js',import.meta.url),'utf8');
const normalizeDigits=v=>String(v??'').replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c));
async function wrapped({failure=false}={}) {
 const calls=[],context=vm.createContext({});const module=new vm.SourceTextModule(routeText,{context});
 await module.link(name=>{const ex=name==='next/server'?{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}}:{completeTask:async id=>{calls.push(id);if(failure)throw Error('mock');return{taskId:id,Complited:1,statusChanged:true,historyId:'1'};},statusFailure:()=>({status:503,body:{success:false,code:'STATUS_HISTORY_NOT_READY',error:'safe'}})};return new vm.SyntheticModule(Object.keys(ex),function(){for(const[k,v]of Object.entries(ex))this.setExport(k,v);},{context});});await module.evaluate();return{api:module.namespace,calls};
}
test('Complete route delegates to audited service and keeps success contract',async()=>{const h=await wrapped();const r=await h.api.POST({json:async()=>({taskId:202})});assert.equal(r.status,200);assert.equal(r.body.success,true);assert.equal(r.body.historyId,'1');assert.deepEqual(h.calls,[202]);});
test('Malformed completion JSON fails before invoking service',async()=>{const h=await wrapped();const r=await h.api.POST({json:async()=>{throw Error('bad');}});assert.equal(r.status,400);assert.equal(h.calls.length,0);});
test('Audited completion error and status are propagated without SQL details',async()=>{const h=await wrapped({failure:true});const r=await h.api.POST({json:async()=>({taskId:202})});assert.equal(r.status,503);assert.equal(r.body.code,'STATUS_HISTORY_NOT_READY');});
const a=pageText.indexOf('  const handleComplete = '),b=pageText.indexOf('\n  const handleDelete',a),handler=pageText.slice(a,b);
function browser({response={success:true},ok=true,networkError=false}={}){
 const state={pending:{current:false},confirms:[],toasts:[],fetches:[],reloads:0};
 const context=vm.createContext({completionPendingRef:state.pending,normalizeDigits,showConfirm:(message,options)=>state.confirms.push({message,options}),showToast:(...args)=>state.toasts.push(args),fetch:async(url,options)=>{state.fetches.push({url,options});if(networkError)throw Error('network');return{ok,json:async()=>response};},setReloadKey:fn=>{state.reloads=fn(state.reloads);}});vm.runInContext(handler+'\nthis.handle=handleComplete;',context);return{state,handle:context.handle};
}
test('Confirmation toast captures task ID and cancellation performs no request',()=>{const h=browser();h.handle(202);assert.ok(h.state.confirms[0].message.includes('202'));assert.equal(h.state.fetches.length,0);h.state.confirms[0].options.onCancel();assert.equal(h.state.pending.current,false);assert.equal(h.state.fetches.length,0);});
test('Confirm sends the captured task ID and reloads only after successful response',async()=>{const h=browser();h.handle(202);await h.state.confirms[0].options.onConfirm();assert.deepEqual(JSON.parse(h.state.fetches[0].options.body),{taskId:202});assert.equal(h.state.fetches[0].url,'/api/complete');assert.equal(h.state.reloads,1);assert.equal(h.state.toasts[0][1],'success');assert.equal(h.state.pending.current,false);});
test('Repeated row clicks and double confirm do not submit duplicate requests',async()=>{const h=browser();h.handle(202);h.handle(303);assert.equal(h.state.confirms.length,1);const callback=h.state.confirms[0].options.onConfirm;await Promise.all([callback(),callback()]);assert.equal(h.state.fetches.length,1);});
test('Server failure uses error toast, does not reload and releases the guard',async()=>{const h=browser({response:{success:false,error:'safe error'},ok:false});h.handle(202);await h.state.confirms[0].options.onConfirm();assert.equal(h.state.reloads,0);assert.equal(h.state.toasts[0][1],'error');h.handle(202);assert.equal(h.state.confirms.length,2);});
test('Network failure uses error toast and releases the guard',async()=>{const h=browser({networkError:true});h.handle(202);await h.state.confirms[0].options.onConfirm();assert.equal(h.state.pending.current,false);assert.equal(h.state.reloads,0);assert.equal(h.state.toasts[0][1],'error');});
test('Already-completed result is informative rather than an error',async()=>{const h=browser({response:{success:true,alreadyCompleted:true}});h.handle(202);await h.state.confirms[0].options.onConfirm();assert.equal(h.state.toasts[0][1],'info');assert.equal(h.state.reloads,1);});
test('Invalid browser task ID does not open confirmation or submit',()=>{const h=browser();h.handle('bad');assert.equal(h.state.confirms.length,0);assert.equal(h.state.fetches.length,0);assert.equal(h.state.toasts[0][1],'warn');});
test('Completion handler contains no native confirm or alert; toolbar shares it',()=>{assert.ok(!/\b(?:confirm|alert)\s*\(/.test(handler));assert.ok(pageText.includes('onComplete={handleComplete}'));assert.ok(pageText.includes('handleComplete(selectedTask.TaskID)'));assert.ok(pageText.includes('showToast("ابتدا یک کار را انتخاب کنید.", "warn")'));});
