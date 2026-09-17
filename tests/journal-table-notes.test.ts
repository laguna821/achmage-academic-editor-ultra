import test from 'node:test';
import assert from 'node:assert/strict';
import {tableNoteGroups,tableNoteStyle,probabilityList} from '../src/journal/tableNotes';
import {createJournalProject,validateProject} from '../src/journal/project';
import {inlineText,type Paragraph} from '../src/journal/types';
import {auditTableReadability,statisticalUnits} from '../src/journal/tableReadability';
import {tableInlineContent} from '../src/journal/typst';
const para=(id:string,text:string):Paragraph=>({id,kind:'paragraph',content:[{text}]});
test('APA note display uses one general label and separate kinds, preserving source paragraphs and offsets',()=>{
  const notes=[para('prob','* p< 0.05; ** p< 0.01.'),para('g1','Note: Original explanation.'),para('g2','Notes. Second explanation.'),{...para('a',''),content:[{text:'a',superscript:true},{text:'First group.'}]}];
  const before=JSON.stringify(notes),groups=tableNoteGroups(notes,{changes:[]});
  assert.deepEqual(groups.map(g=>g.kind),['general','specific','probability']);
  assert.deepEqual(groups.map(g=>inlineText(g.paragraph.content)),['Note. Original explanation. Second explanation.','aFirst group.','*p\u00a0<\u00a0.05. **p\u00a0<\u00a0.01.']);
  assert.deepEqual(groups[0].sources,notes.slice(1,3).map(p=>({id:p.id,start:0,end:inlineText(p.content).length})));
  assert.equal(groups[0].paragraph.content[0].italic,true);
  assert.equal(groups[2].paragraph.content.find(r=>r.text==='p')?.italic,true);
  assert.equal(JSON.stringify(notes),before);
});
test('a probability-only tail is split with complete source coverage; qualified scientific prose stays intact',()=>{
  const source='Note. Original explanation. * p < .05. ** p < .01. *** p < .001.';
  const groups=tableNoteGroups([para('mixed',source)],{changes:[]});
  assert.deepEqual(groups.map(g=>g.kind),['general','probability']);
  assert.equal(groups.flatMap(g=>g.sources).map(s=>source.slice(s.start,s.end)).join(''),source);
  const scientific='Notes. + p < .10; *p < .05; **p < .01 (2-tailed); N = 245.';
  const retained=tableNoteGroups([para('qualified',scientific)],{changes:[]});
  assert.equal(retained.length,1);assert.equal(inlineText(retained[0].paragraph.content),'Note. '+scientific.slice(7));
  assert.equal(probabilityList('* p < .05 (one-tailed).'),undefined);
  assert.equal(probabilityList('* p < .05e-3.'),undefined);
  assert.equal(tableNoteGroups([para('sentence','Note. The criterion was *p < .05.')],{changes:[]}).length,1,'Do not tear a probability expression out of an explanatory sentence');
  const only=tableNoteGroups([para('only','Note: *p < .05.')],{changes:[]});
  assert.deepEqual(only.map(g=>g.kind),['probability']);assert.equal(inlineText(only[0].paragraph.content),'*p\u00a0<\u00a0.05.');
  assert.deepEqual(only[0].sources,[{id:'only',start:0,end:15}]);
});
test('formatting retains comparison, marker, decimal precision, explicit text styles and tracked-change decisions',()=>{
  const notes=[para('p','† p ≤ 0.050; ** p >= .010; + p = 1.00.'),{...para('g',''),content:[{text:'No'},{text:'tes: '},{text:'SE',italic:true},{text:' (old)',changeIds:['delete']},{text:' retained.'}]}];
  const groups=tableNoteGroups(notes,{changes:[{id:'delete',kind:'delete',author:'',date:'',decision:'accepted',sourceId:'s'}]});
  assert.equal(inlineText(groups[0].paragraph.content),'Note. SE retained.');assert.ok(groups[0].paragraph.content.some(r=>r.text==='SE'&&r.italic));
  assert.equal(inlineText(groups[1].paragraph.content),'†p\u00a0≤\u00a0.050. **p\u00a0>=\u00a0.010. +p\u00a0=\u00a01.00.');
});
test('journal and double-spaced note settings validate and calculate inter-paragraph leading',()=>{
  const project=createJournalProject();assert.equal(tableNoteStyle(project.preset).gapPt,5);
  project.preset.tableNotes={spacing:'double',groupGapPt:3};validateProject(project);
  const {style,gapPt}=tableNoteStyle(project.preset);assert.equal(style.font,project.preset.body.font);assert.equal(style.sizePt,project.preset.body.sizePt);assert.equal(style.leadingPt,2*style.sizePt);assert.equal(gapPt,style.sizePt);assert.equal(style.align,'left');
  project.preset.tableNotes.groupGapPt=-1;assert.throws(()=>validateProject(project),/주석/);
});
test('numeric units keep decimals, parentheses and significance markers intact across styled runs',()=>{
  const runs=[{text:'-0.06',bold:true},{text:'(0.02)'},{text:'**',superscript:true}];
  assert.deepEqual(statisticalUnits(runs),[{start:0,end:5},{start:5,end:13}]);
  assert.equal(statisticalUnits([{text:'1.2.3'}]),undefined);
  assert.equal(statisticalUnits([{text:'95% CI'}]),undefined);
  const source=tableInlineContent(runs,createJournalProject(),20);
  assert.match(source,/#box\[#text\("-0.06",weight:"bold"\)\]/);
  assert.match(source,/#box\[#text\("\(0.02\)"\)#super\[#text\("\*\*"\)\]\]/);
  assert.ok(!source.includes('cell-text'),'Numeric atoms must not use grapheme splitting');
});
test('statistical ambiguity becomes a review finding without changing values or marker definitions',()=>{
  const project=createJournalProject();
  project.document.blocks=['.05','.01'].map((level,i)=>({id:'t'+i,kind:'table',width:'auto',columnWeights:[1],rows:[{id:'r'+i,header:false,cells:[{id:'c'+i,header:false,colspan:1,rowspan:1,blocks:[para('v'+i,'1.25**')]}]}],caption:{number:String(i+1),title:[],notes:[para('n'+i,'* p < '+level+'.')]}}));
  const original=JSON.stringify(project),issues=auditTableReadability(project);
  assert.equal(issues.filter(i=>i.code==='table-note-marker-missing').length,2);
  assert.equal(issues.filter(i=>i.code.startsWith('table-note-cross-table-')).length,2);
  assert.equal(JSON.stringify(project),original);
});
