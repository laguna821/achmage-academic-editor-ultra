import test from 'node:test';
import assert from 'node:assert/strict';
import {createJournalProject} from '../src/journal/project';
import {manuscriptProperties,updateWordProperties,fieldForSelection,manuscriptPropertySource} from '../src/journal/manuscriptFields';
import {sidebarItems} from '../src/journal/articleFurniture';
import {exportReadiness} from '../src/journal/exportReadiness';
import {reviewTitle} from '../src/journal/missingContent';
import type {LayoutResult} from '../src/journal/types';
test('Word guided metadata preserves rich abstract and unrelated editorial data',()=>{
  const p=createJournalProject();p.document.abstract=[{id:'abstract-1',kind:'paragraph',content:[{text:'Summary',italic:true}]}];
  updateWordProperties(p,{'aaeu-title':'New title','aaeu-corresponding-name':'Editor','aaeu-corresponding-email':'editor@example.org'});
  assert.equal(p.document.title,'New title');assert.deepEqual(p.document.abstract[0].content,[{text:'Summary',italic:true}]);
  assert.match(sidebarItems(p).find(s=>s.id==='correspondence')!.text,/editor@example.org/);
  assert.equal(manuscriptProperties(p)['aaeu-corresponding-name'],'Editor');
  updateWordProperties(p,{'aaeu-corresponding-name':'Changed'});assert.match(sidebarItems(p).find(s=>s.id==='correspondence')!.text,/Changed\nEmail: editor@example.org/);
});
test('Word repeating entries can be added empty and removed completely',()=>{
  const p=createJournalProject();updateWordProperties(p,{'aaeu-author-1-name':'','aaeu-affiliation-1-text':''});
  assert.equal(p.document.authors.length,1);assert.equal(p.document.affiliations.length,1);
  updateWordProperties(p,{'aaeu-author-1-name':'Author','aaeu-affiliation-1-text':'University','aaeu-author-1-affiliations':['1']});
  assert.deepEqual(p.document.authors[0].affiliations,['1']);
  updateWordProperties(p,{'aaeu-author-1-name':undefined,'aaeu-author-1-affiliations':undefined,'aaeu-affiliation-1-text':undefined});
  assert.equal(p.document.authors.length,0);assert.equal(p.document.affiliations.length,0);
});
test('empty optional output has no placeholder; issues remain available for final override',()=>{
  const p=createJournalProject();assert.equal(reviewTitle(p.document),'');assert.ok(!sidebarItems(p).some(s=>s.id==='correspondence'));
  p.issues=[{id:'missing',code:'missing',severity:'error',message:'Missing metadata'}];
  const result={pageCount:1,issues:[]} as unknown as LayoutResult;
  assert.ok(exportReadiness(p,result).some(i=>i.id==='missing'));assert.ok(exportReadiness(p,result).some(i=>i.code==='publication-unreviewed'));
  assert.deepEqual(p.acknowledgements,{});
});
test('proof regions map to exact metadata keys without assuming a source line',()=>{
  const p=createJournalProject();assert.equal(fieldForSelection(p,'publication:correspondence'),'aaeu-corresponding-name');assert.equal(fieldForSelection(p,'abstract'),'aaeu-abstract');assert.equal(fieldForSelection(p,'publication:header-odd'),'aaeu-header-odd-text');
});
test('guided fields resolve legacy YAML and body metadata without making duplicate properties',()=>{
  const p=createJournalProject();p.document.abstract=[{id:'a',kind:'paragraph',content:[{text:'A body abstract',italic:true}],origin:{sourceId:'md',path:'markdown/lines[7:7]/paragraph'}}];
  assert.deepEqual(manuscriptPropertySource(p,'aaeu-abstract',{}),{kind:'body',key:'aaeu-abstract',line:6,value:'A body abstract'});
  assert.deepEqual(manuscriptPropertySource(p,'aaeu-abstract',{abstract:'Legacy'}),{kind:'yaml',key:'abstract',value:'Legacy'});
  assert.equal(manuscriptPropertySource(p,'aaeu-abstract',{'aaeu-abstract':'Explicit',abstract:'Legacy'}).value,'Explicit');
  assert.equal(manuscriptPropertySource(p,'aaeu-running-title',{runningTitle:'Legacy running'}).key,'runningTitle');
});
