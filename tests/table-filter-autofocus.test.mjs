// Executes the actual focus effect with a fake ref; browser interaction is checked separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../components/TaskTable.jsx',import.meta.url),'utf8');
const match=source.match(/useEffect\(\(\) => \{\s*(if \(!menu \|\| menuLoading\) return;\s*menuSearchRef\.current\?\.focus\(\{ preventScroll: true \}\);)\s*\}, \[menu\?\.key, menuLoading, draftActive\]\);/);
const execute=(menu,menuLoading,present=true)=>{assert.ok(match,'expected focus effect missing');const calls=[];const context={menu,menuLoading,menuSearchRef:{current:present?{focus:options=>calls.push(options)}:null}};vm.runInNewContext(`(function(){${match[1]}})()`,context);return calls;};
test('Closed menu does not steal focus',()=>{assert.equal(execute(null,false).length,0);});
test('Loading filter waits until its disabled text input is enabled',()=>{assert.equal(execute({key:'Block'},true).length,0);});
test('Ready filter focuses text input without scrolling the table',()=>{const calls=execute({key:'Block'},false);assert.equal(calls.length,1);assert.equal(calls[0].preventScroll,true);});
test('A menu without a searchable input is harmless',()=>{assert.equal(execute({key:'Priorities'},false,false).length,0);});
test('Normal filter and draft-selection filter both attach the focus ref',()=>{assert.equal((source.match(/ref=\{menuSearchRef\}/g)||[]).length,2);assert.equal((source.match(/className="col-menu-search"/g)||[]).length,2);assert.ok(match);assert.ok(!match[0].includes('menuQuery'));});
test('Independent-inspection filter retains its existing automatic focus',async()=>{const text=await fs.readFile(new URL('../components/TaskInspectionTable.jsx',import.meta.url),'utf8');assert.ok(text.includes('inputRef.current?.focus()'));assert.ok(text.includes('<input ref={inputRef}'));});
