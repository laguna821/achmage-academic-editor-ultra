import test from 'node:test';
import assert from 'node:assert/strict';
import {createJournalProject,validateProject} from '../src/journal/project';
import {normalizeEditorial,restoreEditorialChange,editorialIssues,insertEndMatter,resolveEmbeddedTableCaption} from '../src/journal/editorial';
import {importMarkdown,mergeMarkdownRevision,resolveMarkdownChange} from '../src/journal/markdown';
import {bindObjectReferences,applyNumberAssignments,numberByPlacement} from '../src/journal/numbering';
import {sortReferenceBlocks} from '../src/journal/referenceOrder';
import {anchorFloats} from '../src/journal/quality';
import {captionCandidates} from '../src/journal/ocr';
import {attachCaptions} from '../src/journal/docx';
import {cloneJournal,inlineText,type Paragraph,type FigureNode,type BinaryStore,type LayoutBox} from '../src/journal/types';
const para=(id:string,text:string):Paragraph=>({id,kind:'paragraph',content:[{text}]});
const figure=(id:string,number:string):FigureNode=>({id,kind:'figure',assetId:'img',width:'column',caption:{number,title:[{text:'Caption '+number}],notes:[]}});
const store:BinaryStore={async get(){return null;},async put(){}};
async function md(text:string,metadata?:Record<string,unknown>){const p=createJournalProject();await importMarkdown(p,{name:'paper.md',text,metadata},store);return p;}
test('standalone insert instructions become reversible zero-height anchors; ordinary prose stays',()=>{
  const p=createJournalProject();p.document.blocks=[para('p','See Figure 3.'),para('a','(Insert Figure 3 About Here)'),para('b','Insert Figure 3 about here is an instruction.'),figure('f','3')];normalizeEditorial(p);
  assert.equal(p.document.blocks[1].kind,'anchor');assert.equal(p.document.blocks[2].kind,'paragraph');assert.deepEqual(anchorFloats(p).nodes.map(n=>n.id),['p','a','f','b']);
  restoreEditorialChange(p,p.editorial!.changes[0].id);assert.equal(p.document.blocks[1].kind,'paragraph');normalizeEditorial(p);assert.equal(p.document.blocks[1].kind,'paragraph');
});
test('duplicate original numbers remain unresolved, never arbitrarily bind',()=>{
  const p=createJournalProject();p.document.blocks=[para('p','Table 4 is shown.'),para('a','Insert Figure 1 Here'),figure('f','1'),figure('g','1')];normalizeEditorial(p);
  assert.ok(editorialIssues(p).some(i=>i.code==='anchor-unresolved'));assert.ok(bindObjectReferences(p).length);
});
test('merged table title row is extracted without changing cells and undo preserves new notes',()=>{
  const p=createJournalProject();p.document.blocks=[{id:'t',kind:'table',width:'auto',columnWeights:[1,1],rows:[{id:'title',header:false,cells:[{id:'title-cell',header:false,colspan:2,rowspan:1,blocks:[para('title-p','Table 4. Counts')]}]},{id:'data',header:false,cells:[{id:'a',header:false,colspan:1,rowspan:1,blocks:[para('a-p','12')]},{id:'b',header:false,colspan:1,rowspan:1,blocks:[para('b-p','34')]}]}]}];
  normalizeEditorial(p);const t=p.document.blocks[0];if(t.kind!=='table')throw Error();assert.equal(t.caption?.number,'4');assert.equal(t.rows.length,1);t.caption!.notes.push(para('note','Note. Added by editor.'));restoreEditorialChange(p,p.editorial!.changes[0].id);assert.equal(t.rows.length,2);assert.equal(t.caption?.notes.length,1);
});
test('clear object-group labels disappear; unrelated section headings survive',()=>{
  const p=createJournalProject();p.document.blocks=[{...para('a','Figures'),kind:'heading'},figure('f','1'),{...para('b','Tables'),kind:'heading'},para('c','This section discusses tables.')];normalizeEditorial(p);assert.deepEqual(p.document.blocks.map(n=>n.id),['f','b','c']);
});
test('conflicting inside/outside table captions require an explicit choice and can be undone',()=>{
  const p=createJournalProject();p.document.blocks=[{id:'t',kind:'table',width:'auto',columnWeights:[1,1],caption:{number:'1',title:[{text:'Outside'}],notes:[]},rows:[{id:'title',header:false,cells:[{id:'title-cell',header:false,colspan:2,rowspan:1,blocks:[para('title-p','Table 2. Inside')]}]},{id:'data',header:false,cells:[{id:'a',header:false,colspan:2,rowspan:1,blocks:[para('a-p','Value')]}]}]}];
  assert.ok(editorialIssues(p).some(i=>i.code==='table-caption-duplicate'));resolveEmbeddedTableCaption(p,'t','inside');const t=p.document.blocks[0];if(t.kind!=='table')throw Error();assert.equal(t.caption?.number,'2');assert.equal(t.rows.length,1);restoreEditorialChange(p,p.editorial!.changes[0].id);assert.equal(t.caption?.number,'1');assert.equal(t.rows.length,2);
});
test('an explicit unlinked caption style creates a review placeholder with reversible provenance',()=>{
  const p=createJournalProject();p.document.blocks=[{...para('caption','Figure 8. Missing source.'),style:'Caption'}];normalizeEditorial(p);assert.equal(p.document.blocks[0].kind,'figure');assert.ok(editorialIssues(p).some(i=>i.code==='figure-source-required'));restoreEditorialChange(p,p.editorial!.changes[0].id);assert.equal(p.document.blocks[0].kind,'paragraph');
});
test('end matter is mapped once before References and empty required fields block final',()=>{
  const p=createJournalProject();p.document.blocks=[{...para('h','Funding Information'),kind:'heading'},para('fund','No grant was received.'),{...para('refs','References'),kind:'heading'},para('r','Kim, M. (2025). Study.')];normalizeEditorial(p);normalizeEditorial(p);assert.equal(p.document.endMatter?.filter(e=>e.kind==='funding').length,1);assert.ok(editorialIssues(p).some(i=>i.code==='end-matter-empty'));insertEndMatter(p);assert.equal(p.document.blocks[1].id,'fund');assert.equal(p.document.blocks[2].id,'refs');
});
test('source reference links survive layout numbering and reading order crosses full-width bands',()=>{
  const p=createJournalProject();p.document.blocks=[para('mention','See Figures 4 and 8.'),figure('a','4'),figure('b','8'),figure('c','2')];assert.deepEqual(bindObjectReferences(p),[]);
  const box=(id:string,x:number,y:number,width:number):LayoutBox=>({id,nodeId:id,page:1,x,y,width,height:40,kind:'figure'});
  const assignments=numberByPlacement(p,[box('a',300,70,180),box('b',40,140,440),box('c',40,50,180)]);assert.deepEqual(assignments.map(a=>[a.id,a.number]),[['c','1'],['a','2'],['b','3']]);applyNumberAssignments(p,assignments);const n=p.document.blocks[0] as Paragraph;assert.equal(inlineText(n.content),'See Figures 2 and 3.');assert.equal((p.document.blocks[1] as FigureNode).caption?.sourceNumber,'4');
});
test('raw references sort globally without claiming APA bibliographic confirmation',async()=>{
  const p=await md('# Introduction\n\nBody.\n\n# References\n\nZed, J. (2025). Last.\n\nAlpha, A. (2024). First.');assert.deepEqual(sortReferenceBlocks(p),[]);assert.match(p.references[0].raw,/Alpha/);assert.ok(p.references.every(r=>!r.confirmed));
});

test('renumbered linked callouts never become raw anchors for another object',()=>{
  const p=createJournalProject();p.document.blocks=[para('first','See Figure 3.'),para('second','See Figure 4.'),figure('four','4'),figure('three','3')];
  assert.deepEqual(bindObjectReferences(p),[]);
  const expected=anchorFloats(p).nodes.map(n=>n.id);assert.deepEqual(expected,['first','three','second','four']);
  applyNumberAssignments(p,[{id:'four',kind:'figure',original:'4',number:'3',page:1},{id:'three',kind:'figure',original:'3',number:'4',page:2}]);
  assert.equal(inlineText((p.document.blocks[0] as Paragraph).content),'See Figure 4.');
  assert.deepEqual(anchorFloats(p).nodes.map(n=>n.id),expected);
});
test('reference continuation paragraphs travel with their author entry and retain provenance',async()=>{
  const p=await md('# Introduction\n\n# References\n\nZed, Z. (2025). A long\n\ntitle with a wrapped\n\nDOI:10.1234/example\n\nAlpha, A. (2024). First.');
  assert.equal(p.references.length,2);assert.equal(p.references[0].sourceParagraphIds?.length,3);sortReferenceBlocks(p);
  const refs=p.document.blocks.filter(n=>n.kind==='paragraph'&&n.role==='reference') as Paragraph[];assert.equal(refs.length,2);assert.match(inlineText(refs[1].content),/wrapped DOI:10/);
});
test('two-paragraph captions attach their title and notes to the object exactly once',()=>{
  const p=createJournalProject(),f=figure('f','');delete f.caption;
  p.document.blocks=[f,para('number','Figure 1.'),para('title','The original chart title.'),para('note','Note. Original note.')];attachCaptions(p.document.blocks);
  assert.equal(p.document.blocks.length,1);assert.equal(f.caption?.titleSource?.id,'title');assert.equal(inlineText(f.caption!.title),'The original chart title.');assert.equal(f.caption!.notes.length,1);
});
test('consecutive Markdown images become separate figures, never tiny inline thumbnails',async()=>{
  const p=await md('# Introduction\n\n![One](first.png)\n![Two](second.png)');assert.equal(p.document.blocks.filter(n=>n.kind==='figure').length,2);assert.equal(editorialIssues(p).filter(i=>i.code==='figure-source-required').length,2);
});
test('wiki embeds retain paths and caption numbers; image syntax inside code stays literal',async()=>{
  const p=await md('# Introduction\n\n![[plots/chart.svg|Figure 7. Caption]]\n\n`![[code.png]]`\n\n```md\n![[example.png]]\n```');
  const f=p.document.blocks.find(n=>n.kind==='figure');assert.ok(f?.kind==='figure');assert.equal(f.sourceObject?.part,'plots/chart.svg');assert.equal(f.caption?.number,'7');assert.equal(inlineText(f.caption!.title),'Caption');assert.ok(p.document.blocks.some(n=>n.kind==='paragraph'&&inlineText(n.content)==='![[code.png]]'));assert.equal(p.document.blocks.filter(n=>n.kind==='figure').length,1);
});
test('Markdown section heading is not consumed as title, explicit title and heading shift work',async()=>{
  const p=await md('# Introduction\n\nFirst **paragraph**.');assert.equal(p.document.title,'paper');assert.equal(p.document.blocks[0].kind,'heading');
  const q=await md('# My article\n\n## Introduction\n\nFirst.');assert.equal(q.document.title,'My article');assert.equal((q.document.blocks[0] as Paragraph).level,1);assert.ok(p.document.blocks[1].kind==='paragraph'&&p.document.blocks[1].content.some(r=>r.bold));
});
test('Markdown reimport compares raw baselines, keeps editor changes and handles repeated revisions',async()=>{
  let p=await md('# Article\n\n## Introduction\n\nFirst raw.\n\nSecond raw.');const first=p.document.blocks[1] as Paragraph;first.content=[{text:'Editor correction.'}];
  p=mergeMarkdownRevision(p,await md('# Article\n\n## Introduction\n\nFirst raw.\n\nSecond changed.'));
  assert.equal(p.editorial!.changes.filter(c=>c.status==='pending').length,1);for(const c of p.editorial!.changes)resolveMarkdownChange(p,c.id,true);
  assert.equal(inlineText((p.document.blocks[1] as Paragraph).content),'Editor correction.');assert.equal(inlineText((p.document.blocks[2] as Paragraph).content),'Second changed.');
  p=mergeMarkdownRevision(p,await md('# Article revised\n\n## Introduction\n\nFirst raw.\n\nSecond changed again.'));
  assert.equal(p.editorial!.changes.filter(c=>c.status==='pending').length,2);for(const c of p.editorial!.changes)resolveMarkdownChange(p,c.id,true);assert.equal(p.document.title,'Article revised');assert.equal(inlineText((p.document.blocks[1] as Paragraph).content),'Editor correction.');assert.equal(inlineText((p.document.blocks[2] as Paragraph).content),'Second changed again.');
});
test('Markdown references refresh only after accepting that paragraph; rejecting retains edited entry',async()=>{
  const text='# Introduction\n\n# References\n\nKim, M. (2025). Old title.';let p=await md(text);p.references[0].sort={authorKey:'kim m',confirmed:true};
  p=mergeMarkdownRevision(p,await md(text.replace('Old title','New title')));for(const c of p.editorial!.changes)resolveMarkdownChange(p,c.id,false);assert.match(p.references[0].raw,/Old/);
  p=mergeMarkdownRevision(p,await md(text.replace('Old title','Third title')));for(const c of p.editorial!.changes)resolveMarkdownChange(p,c.id,true);assert.match(p.references[0].raw,/Third/);
});
test('migration is non-mutating and does not enable new layout policy on version 1',()=>{
  const p=createJournalProject();p.schemaVersion=1;delete p.editorial;const raw=cloneJournal(p),m=validateProject(p);assert.equal(m.schemaVersion,2);assert.equal(m.editorial?.enabled,false);assert.deepEqual(raw,p);
});
test('OCR never proposes cutting through a full-width ink strip and keeps low-confidence review candidates',()=>{
  const line={text:'Figure 1. Caption',confidence:90,bbox:{x0:10,y0:5,x1:90,y1:15}},white=new Uint8ClampedArray(100*100*4).fill(255);assert.ok(captionCandidates([line],100,100,white)[0].crop);
  const black=new Uint8ClampedArray(100*100*4);for(let i=3;i<black.length;i+=4)black[i]=255;assert.equal(captionCandidates([line],100,100,black)[0].crop,undefined);assert.equal(captionCandidates([{...line,confidence:60}],100,100,white)[0].crop,undefined);assert.deepEqual(captionCandidates([{...line,text:'Figure quality'}],100,100,white),[]);
});
