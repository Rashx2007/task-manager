import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const src=(await fs.readFile(new URL('../app/page.js',import.meta.url),'utf8')).replace(/\r\n?/g,'\n');
const a=src.indexOf('  // The ref and revision protect the draft'), b=src.indexOf('\n\n',src.indexOf('  const cancelDraft =',a));
assert.ok(a>=0&&b>a);
const program=src.slice(a,b)+'\nthis.api={updateDraft,changeDraft,saveDraft,finishDraft,cancelDraft,handleAssetSavedFromDraft,acceptDraftAsset};';
function setup(response={found:true,matches:[{AssetID:42}]}) {
 const out={draft:null,storage:null,notices:[],matches:null,confirm:null,edit:null,showForm:false,assetPreset:null,showAssets:false,requests:[]};
 let stateIndex=0;
 const c=vm.createContext({String,Number,JSON,Object,Array,console,
  useState(initial){const key=['draft','matches','assetPreset'][stateIndex++];return [initial,(value)=>{out[key]=value;}];},
  useRef(v){return {current:v}},useEffect(){},
  setEditTask:v=>out.edit=v,setShowTaskForm:v=>out.showForm=v,setShowAssets:v=>out.showAssets=v,
  placeRules:()=>({central:true}),showToast:(...v)=>out.notices.push(v),showConfirm:(m,o)=>{out.confirm={message:m,options:o}},
  localStorage:{setItem:(k,v)=>{out.storage=JSON.parse(v)},removeItem:()=>{out.storage=null}},
  fetch:async(url,opt)=>{out.requests.push({url,body:JSON.parse(opt.body)});if(typeof response==='function')return response();return {ok:response.ok!==false,json:async()=>response}},
 });vm.runInContext(program,c);return {out,api:c.api};
}
const device={AssetName:'پمپ',Building:'مرکزی',AssetNumber:'2',TaskTtl:'موضوع'};
test('temporary save puts resolved device in both active draft and storage',async()=>{let h=setup();h.api.updateDraft(device);await h.api.saveDraft();assert.equal(h.out.draft.AssetID,42);assert.equal(h.out.storage.AssetID,42);assert.equal(h.out.requests.length,1);assert.equal(h.out.showForm,false);});
test('finish resolves and opens the actual task form even without prior temporary save',async()=>{let h=setup();h.api.updateDraft({...device,TaskTtl:''});await h.api.finishDraft();assert.equal(h.out.edit.AssetID,42);assert.equal(h.out.edit.TaskTtl,'');assert.equal(h.out.showForm,true);});
test('a genuine no-match asks to register and carries preset to device form',async()=>{let h=setup({found:false,matches:[]});h.api.updateDraft(device);await h.api.saveDraft();assert.ok(h.out.confirm.message.includes('ثبت'));assert.equal(h.out.storage.AssetName,'پمپ');h.out.confirm.options.onConfirm();assert.equal(h.out.showAssets,true);assert.equal(h.out.assetPreset.AssetName,'پمپ');h.api.handleAssetSavedFromDraft(77,{...device,Location:'اتاق'});assert.equal(h.out.draft.AssetID,77);assert.equal(h.out.storage.AssetID,77);assert.equal(h.out.draft.TaskTtl,'موضوع');});
test('server errors do not pretend the device is missing',async()=>{let h=setup({ok:false,success:false,error:'secret sql'});h.api.updateDraft(device);await h.api.finishDraft();assert.equal(h.out.confirm,null);assert.equal(h.out.showForm,false);assert.ok(h.out.notices.some(n=>n[1]==='error'&&!n[0].includes('secret')));});
test('multiple matches require choice and chosen identity is stored',async()=>{let h=setup({found:true,matches:[{AssetID:10},{AssetID:11}]});h.api.updateDraft(device);await h.api.finishDraft();assert.equal(h.out.showForm,false);assert.equal(h.out.matches.matches.length,2);h.api.acceptDraftAsset(h.out.matches.matches[1],h.out.matches.version,h.out.matches.mode);assert.equal(h.out.edit.AssetID,11);assert.equal(h.out.storage.AssetID,11);});
test('already selected identity is retained only when among returned matches',async()=>{let h=setup({found:true,matches:[{AssetID:10},{AssetID:11}]});h.api.updateDraft({...device,AssetID:11});await h.api.finishDraft();assert.equal(h.out.edit.AssetID,11);assert.equal(h.out.matches,null);});
test('editing device criteria clears stale ID; changing subject does not',()=>{let h=setup();h.api.updateDraft({...device,AssetID:42});h.api.changeDraft('TaskTtl','جدید');assert.equal(h.out.draft.AssetID,42);h.api.changeDraft('Floor','3');assert.equal(h.out.draft.AssetID,null);});
test('incomplete device details are saved temporarily but never silently dropped at finish',async()=>{let h=setup();h.api.updateDraft({AssetName:'پمپ'});await h.api.saveDraft();assert.equal(h.out.storage.AssetName,'پمپ');await h.api.finishDraft();assert.equal(h.out.showForm,false);assert.equal(h.out.requests.length,0);assert.ok(h.out.notices.some(n=>n[1]==='warn'));});
test('blank device is allowed and no lookup is made',async()=>{let h=setup();h.api.updateDraft({TaskTtl:'موضوع'});await h.api.finishDraft();assert.equal(h.out.showForm,true);assert.equal(h.out.requests.length,0);});
test('late lookup after editing or cancel never overwrites the newer draft',async()=>{for(const cancel of [false,true]){let release;let h=setup(()=>new Promise(r=>{release=r}));h.api.updateDraft(device);const pending=h.api.finishDraft();if(cancel)h.api.cancelDraft();else h.api.changeDraft('AssetName','جدید');release({ok:true,json:async()=>({found:true,matches:[{AssetID:42}]})});await pending;assert.equal(h.out.showForm,false);assert.equal(h.out.draft?.AssetID,cancel?undefined:null);}});
test('stale registration confirmation cannot open the asset form',async()=>{let h=setup({found:false,matches:[]});h.api.updateDraft(device);await h.api.saveDraft();h.api.changeDraft('AssetName','جدید');h.out.confirm.options.onConfirm();assert.equal(h.out.showAssets,false);});
test('concurrent finish clicks issue only one device check',async()=>{let release;const h=setup(()=>new Promise(r=>{release=r}));h.api.updateDraft(device);const first=h.api.finishDraft();await h.api.finishDraft();assert.equal(h.out.requests.length,1);release({ok:true,json:async()=>({found:true,matches:[{AssetID:42}]})});await first;assert.equal(h.out.edit.AssetID,42);});
