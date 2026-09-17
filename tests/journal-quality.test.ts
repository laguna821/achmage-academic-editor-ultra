import test from 'node:test';
import assert from 'node:assert/strict';
import {createJournalProject,validateProject} from '../src/journal/project';
import {compositionQuality,anchorFloats,typographyCandidates,boundedSearch,SEARCH_LIMITS} from '../src/journal/quality';
import {auditComposition} from '../src/journal/coverage';
import {balanceTerminalBand} from '../src/journal/balance';
import {bibliographyOrder} from '../src/journal/bibliography';
import {type Paragraph,type LayoutBox,type FigureNode} from '../src/journal/types';

const p=(id:string,text:string):Paragraph=>({id,kind:'paragraph',content:[{text}]});
const fig=(id:string,number:string):FigureNode=>({id,kind:'figure',assetId:id,width:'auto',caption:{number,title:[{text:'Figure title'}],notes:[]}});
test('saved legacy projects remain opt-out; bounded settings and per-node exclusions round trip',()=>{
  const project=createJournalProject();assert.equal(compositionQuality(project).enabled,true);
  delete project.preset.compositionQuality;assert.equal(compositionQuality(validateProject(project)).enabled,false);
  project.preset.compositionQuality={...compositionQuality(project),enabled:true,horizontalScaleLimit:.02};assert.throws(()=>validateProject(project));
  project.preset.compositionQuality.horizontalScaleLimit=.01;project.preset.compositionQuality.disabledNodes=['p'];
  assert.equal(typographyCandidates(compositionQuality(validateProject(project)),p('p','body')).length,1);
  assert.equal(typographyCandidates(compositionQuality(project),{...p('q','x²'),content:[{text:'2',superscript:true}]}).length,1);
  assert.equal(typographyCandidates(compositionQuality(project),p('q','body')).length,25);
});
test('float anchoring preserves body order, hard breaks and attached heading chains',()=>{
  const project=createJournalProject();project.document.blocks=[p('a','See Figure 2.'),p('b','See Figure 1.'),fig('f1','1'),fig('f2','2'),{id:'break',kind:'break',target:'page'},fig('f3','3'),p('c','Figure 3 is described here.')];
  const result=anchorFloats(project);assert.deepEqual(result.nodes.map(n=>n.id),['a','f2','b','f1','break','c','f3']);
  assert.deepEqual(result.nodes.filter(n=>n.kind==='paragraph').map(n=>n.id),['a','b','c']);
  project.document.blocks.splice(3,0,{id:'heading',kind:'heading',level:1,content:[{text:'Figures'}]});
  const attached=anchorFloats(project);assert.equal(attached.nodes.findIndex(n=>n.id==='f2'),attached.nodes.findIndex(n=>n.id==='heading')+1);
});
test('coverage starts from expected content: omission, duplication and changed fragments fail',()=>{
  const project=createJournalProject();project.document.blocks=[p('p','Every source word.'),fig('f','1')];
  const box=(id:string,kind:string,text?:string):LayoutBox=>({id,nodeId:id,kind,text,page:1,x:0,y:0,width:100,height:12});
  const boxes=[box('p','paragraph','Every source word.'),box('f','figure'),{...box('f:caption','caption'),nodeId:'f'}];
  assert.equal(auditComposition(project,boxes).complete,true);
  assert.equal(auditComposition(project,boxes.filter(b=>b.kind!=='figure')).complete,false);
  assert.equal(auditComposition(project,[...boxes,box('f','figure')]).complete,false);
  assert.equal(auditComposition(project,boxes.map(b=>b.nodeId==='p'?{...b,text:'Every word.'}:b)).complete,false);
});
test('beam uses lexicographic penalties, rejects constraints, and has a fixed work budget',()=>{
  const steps=Array.from({length:6},()=>Array.from({length:25},(_,n)=>({key:String(n).padStart(2,'0'),value:n,cost:[n===3?0:1,Math.abs(n-3)]})));
  const one=boundedSearch(steps,values=>values.length<3||values[2]!==3),two=boundedSearch(steps,values=>values.length<3||values[2]!==3);
  assert.deepEqual(one,two);assert.equal(one.values.length,6);assert.notEqual(one.values[2],3);assert.ok(one.expansions<=SEARCH_LIMITS.expansions);
});
test('terminal balancing keeps reference entries indivisible and achieves matching columns',async()=>{
  const items=Array.from({length:6},(_,i)=>({nodeId:'ref'+i,kind:'reference',fragment:0,offset:0}));
  const result=await balanceTerminalBand({page:2,left:0,right:120,width:100,top:0,bottom:200,line:12,leadingLimit:.2,spaceLimit:1,items,check(){},async part(item,available){if(available<24)return null;return {box:{nodeId:item.nodeId,kind:item.kind,content:'reference',height:24,contentHeight:24},rest:null};}});
  assert.ok(result);assert.equal(result.difference,0);assert.deepEqual(result.boxes.map(b=>b.nodeId),items.map(i=>i.nodeId));assert.equal(result.boxes.filter(b=>b.x===0).length,3);
});
test('APA bibliography order comes from engine output and ambiguous duplicates remain reviewable',()=>{
  const project=createJournalProject();const refs=['b','a'].map(id=>({id,raw:'',type:'book' as const,title:id,author:[],confirmed:true,provenance:[]}));
  const result=bibliographyOrder(refs,[{kind:'reference-run',key:'a',text:'Alpha.'},{kind:'reference-run',key:'b',text:'Beta.'},{kind:'reference-run',key:'__bibliography__',text:'Alpha.Beta.'}]);
  assert.deepEqual(result.references.map(r=>r.id),['a','b']);assert.equal(result.ambiguous,false);
  assert.equal(bibliographyOrder(refs,[]).ambiguous,true);assert.ok(project);
});
