import assert from 'node:assert/strict';
import {test} from 'node:test';
import JSZip from 'jszip';
import {editableStoryText,finalizeEditableThreads,validateEditableLayout,type EditableLayoutSnapshot} from '../src/io/editableLayout';
import {exportIdml} from '../src/io/idml';
import {captureParagraph,captureInlines} from '../src/journal/editableCapture';
import {journalEditableSnapshot} from '../src/journal/editableExport';
import {createJournalProject} from '../src/journal/project';
import {resolveJournalSpec} from '../src/journal/master';
import {NO_ADJUSTMENT} from '../src/journal/quality';
import type {LayoutResult,Paragraph} from '../src/journal/types';

function snapshot():EditableLayoutSnapshot{
  return {version:2,title:'Thread test',fingerprint:'test',pageWidth:595,pageHeight:842,pageCount:2,firstPage:1,
    styles:{body:{font:'Arial',size:10,leading:12,color:'#000000'},tight:{font:'Arial',size:10,leading:11.8,color:'#000000',horizontalScale:.98,tracking:-.01}},
    stories:[{id:'story',paragraphs:[{id:'a',sourceId:'p',style:'body',runs:[{text:'A😀'}],start:0,end:3},{id:'b',sourceId:'p',style:'tight',runs:[{text:'B'}],start:3,end:4,continued:true},{id:'c',sourceId:'q',style:'body',runs:[{text:'Next'}]}]}],
    frames:[{id:'f1',storyId:'story',page:1,order:0,x:30,y:40,width:220,height:12,paragraphIds:['a']},{id:'f2',storyId:'story',page:2,order:1,x:30,y:40,width:220,height:24,paragraphIds:['b','c']}],tables:[],images:[],shapes:[],assets:[],issues:[]};
}
test('finalized frame links cover Unicode text once without breaking continued paragraphs',()=>{
  const s=snapshot(),rects=s.frames.map(f=>[f.x,f.y,f.width,f.height]);finalizeEditableThreads(s);
  assert.equal(editableStoryText(s.stories[0]),'A😀B\nNext');
  assert.deepEqual(s.frames.map(f=>[f.start,f.end]),[[0,3],[3,9]]);
  assert.equal(s.frames[0].nextFrameId,'f2');assert.equal(s.frames[1].previousFrameId,'f1');
  assert.deepEqual(s.frames.map(f=>[f.x,f.y,f.width,f.height]),rects);
  assert.deepEqual(validateEditableLayout(s),[]);
});
test('missing, duplicate, reordered content and broken frame links fail validation',()=>{
  for(const change of [(s:EditableLayoutSnapshot)=>s.frames[1].paragraphIds!.pop(),(s:EditableLayoutSnapshot)=>s.frames[1].paragraphIds!.push('a'),(s:EditableLayoutSnapshot)=>s.frames[1].paragraphIds!.reverse()]){
    const s=snapshot();change(s);finalizeEditableThreads(s);assert.ok(validateEditableLayout(s).some(i=>i.code==='frame-content-coverage'));
  }
  const s=snapshot();finalizeEditableThreads(s);s.frames[0].end=2;s.frames[1].previousFrameId='wrong';
  assert.ok(validateEditableLayout(s).some(i=>i.code==='frame-content-range'));assert.ok(validateEditableLayout(s).some(i=>i.code==='frame-link'));
});
test('inline image occupies one story position',()=>{
  const s=snapshot();s.stories[0].paragraphs[0].runs=[{text:'',imageId:'asset'}];s.assets=[{id:'asset',name:'x.png',mime:'image/png',bytes:new Uint8Array([1])}];
  finalizeEditableThreads(s);assert.equal(s.frames[0].end,1);assert.deepEqual(validateEditableLayout(s),[]);
});
test('capture preserves chosen typography, list label, indentation and source offsets',()=>{
  const p=createJournalProject(),node:Paragraph={id:'p',kind:'paragraph',list:{ordered:false,level:1,label:'• '},content:[{text:'   One '},{text:'two',italic:true,href:'https://example.test'}]};
  const c=captureParagraph(node,p,0,10,false,{trackingEm:-.002,scaleX:.99,leadingPt:-.1});
  assert.equal(c.runs.map(r=>r.text).join(''),'• One two');assert.equal(c.runs.at(-1)!.href,'https://example.test');
  assert.equal(c.style.horizontalScale,.99);assert.equal(c.style.indent,0);assert.equal(c.style.leftIndent,6*72/25.4);
  const tail=captureParagraph(node,p,10,20,true,NO_ADJUSTMENT);assert.equal(tail.runs[0].text,'One ');assert.equal(tail.start,10);
});
test('empty furniture text still has a valid frame range',()=>{
  const s=snapshot();s.stories[0].paragraphs=[];s.frames=s.frames.slice(0,1);s.frames[0].paragraphIds=[];
  finalizeEditableThreads(s);assert.deepEqual([s.frames[0].start,s.frames[0].end],[0,0]);assert.deepEqual(validateEditableLayout(s),[]);
});

test('capture records source block edges, heading keeps and the pinned compiler word-spacing limits',()=>{
  const p=createJournalProject(),body:Paragraph={id:'p',kind:'paragraph',content:[{text:'Body'}]};
  const b=captureParagraph(body,p,0,4,false,NO_ADJUSTMENT).style;
  const h=captureParagraph({...body,kind:'heading',level:1},p,0,4,false,NO_ADJUSTMENT).style;
  assert.equal(b.blockTop,b.size*.8);assert.equal(b.blockBottom,b.size*.2);
  assert.equal(h.blockTop,h.size*.75);assert.equal(h.blockBottom,h.size*.25);
  assert.equal(h.keepNext,true);assert.equal(h.keepTogether,true);assert.equal(b.keepTogether,false);
  assert.equal(b.hyphenate,true);assert.equal(h.hyphenate,false);
  assert.deepEqual(b.wordSpacing,{min:2/3,desired:1,max:1.5});
});
test('inline image aspect and tab expansion match the PDF renderer',()=>{
  const p=createJournalProject();p.assets.push({id:'a',name:'wide.png',mime:'image/png',path:'a',sha256:'test',bytes:1,widthPx:400,heightPx:100});
  const runs=captureInlines([{text:'x\ty'},{text:'',assetId:'a'}],p);
  assert.equal(runs[0].text,'x    y');assert.equal(runs[1].imageWidth,40);assert.equal(runs[1].imageHeight,10);
});
test('review export retains missing-figure geometry and caption with an explicit replacement placeholder',async()=>{
  const p=createJournalProject();p.preset.master!.enabled=false;
  p.document.blocks=[{id:'f7',kind:'figure',assetId:'',width:'full',caption:{number:'7',title:[{text:'Source chart'}],notes:[]}}];
  const r={pageCount:1,fingerprint:'missing',issues:[{code:'figure-missing',severity:'error',nodeId:'f7',message:'Missing chart'}],boxes:[{id:'f7:0',nodeId:'f7',page:1,x:40,y:100,width:480,height:200,kind:'figure'},{id:'cap',nodeId:'f7',page:1,x:40,y:100,width:480,height:30,kind:'caption'},{id:'front',nodeId:'front-matter',page:1,x:40,y:20,width:480,height:50,kind:'front'}],editableSource:{version:2,project:p,resolved:resolveJournalSpec(p.preset),referenceRuns:[],tables:[],typography:{},geometry:[{kind:'editable-image',nodeId:'f7',fragment:0,page:1,x:40,y:140,width:480,height:160}],text:[]}} as unknown as LayoutResult;
  const s=await journalEditableSnapshot(r,{async get(){throw Error('No asset should be read for a missing source');},async put(){}});
  assert.equal(s.images.length,1);assert.deepEqual([s.images[0].x,s.images[0].y,s.images[0].width,s.images[0].height],[40,140,480,160]);
  assert.match(new TextDecoder().decode(s.assets[0].bytes),/Figure image required/);
  assert.ok(s.stories.some(st=>editableStoryText(st).includes('Figure 7\nSource chart')));
  assert.ok(s.stories.every(st=>!editableStoryText(st).includes('[Title not supplied]')));
  assert.equal(p.document.title,'');assert.ok(s.issues.some(i=>i.code==='figure-placeholder'&&i.sourceSeverity==='error'&&i.sourceId==='f7'));
  assert.deepEqual(validateEditableLayout(s),[]);
});
test('older snapshots without editing regions retain measured frame bounds',async()=>{
  const p=createJournalProject();p.preset.master!.enabled=false;p.document.blocks=[{id:'p',kind:'paragraph',content:[{text:'Original source is deliberately different'}]}];
  const node:Paragraph={id:'p',kind:'paragraph',content:[{text:'Exactly placed'}]};
  const r={pageCount:1,fingerprint:'test',issues:[],boxes:[{id:'p:0',nodeId:'p',page:1,x:40,y:50,width:200,height:14,kind:'paragraph',contentY:50,contentHeight:12},{id:'region',nodeId:'region',page:1,x:40,y:50,width:200,height:700,kind:'text-frame'}],editableSource:{version:2,project:p,resolved:resolveJournalSpec(p.preset),referenceRuns:[],tables:[],typography:{},geometry:[],text:[{boxId:'p:0',page:1,slice:captureParagraph(node,p,0,14,false,NO_ADJUSTMENT)}]}} as unknown as LayoutResult;
  const s=await journalEditableSnapshot(r,{async get(){return null;},async put(){}});
  assert.equal(s.frames[0].height,14);assert.equal(editableStoryText(s.stories[0]),'Exactly placed');assert.deepEqual(validateEditableLayout(s),[]);
  r.editableSource!.text=[];await assert.rejects(()=>journalEditableSnapshot(r,{async get(){return null;},async put(){}}),/확정 본문/);
});
test('IDML keeps continuation fragments in one paragraph and preserves their glyph scale',async()=>{
  const s=snapshot();finalizeEditableThreads(s);const out=await exportIdml(s,new Uint8Array([1]));const zip=await JSZip.loadAsync(out.idml);
  const path=Object.keys(zip.files).find(p=>p.startsWith('Stories/'))!,xml=await zip.file(path)!.async('string');
  assert.equal((xml.match(/<ParagraphStyleRange /g)??[]).length,2);assert.equal((xml.match(/<Br\/>/g)??[]).length,2);
  assert.match(xml,/HorizontalScale="98" Tracking="-10"/);assert.match(xml,/<Content>A😀<\/Content>/);
});
test('journal frames fill reserved column bands, keep inset geometry and thread through pages',async()=>{
  const p=createJournalProject();p.preset.master!.enabled=false;
  const regions=[{page:1,x:40,y:80,width:200,height:220},{page:1,x:260,y:80,width:200,height:220},{page:1,x:40,y:440,width:200,height:260},{page:1,x:260,y:440,width:200,height:260},{page:2,x:40,y:50,width:200,height:650}];
  const nodes=regions.map((_,i):Paragraph=>({id:'p'+i,kind:'paragraph',content:[{text:'Paragraph '+i}]}));p.document.blocks=nodes;
  const boxes=regions.map((r,i)=>({...r,id:'p'+i+':0',nodeId:'p'+i,y:r.y+2,height:14,contentY:r.y+2,contentHeight:12,kind:'paragraph'}));
  // Source layout IDs must not overwrite unique exported frame IDs.
  boxes.push({...regions[0],id:'same-source-id',nodeId:'front-matter',y:20,height:30,contentY:20,contentHeight:30,kind:'front'});
  const r={pageCount:2,fingerprint:'regions',issues:[],boxes,editableSource:{version:2,project:p,resolved:resolveJournalSpec(p.preset),regions,referenceRuns:[],tables:[],typography:{},geometry:[],text:nodes.map((n,i)=>({boxId:'p'+i+':0',page:regions[i].page,slice:captureParagraph(n,p,0,11,false,NO_ADJUSTMENT)}))}} as unknown as LayoutResult;
  const s=await journalEditableSnapshot(r,{async get(){return null;},async put(){}}),body=s.frames.filter(f=>f.storyId==='journal:body-story');
  assert.deepEqual(body.map(({page,x,y,width,height})=>({page,x,y,width,height})),regions);
  assert.ok(body.every(f=>f.contentInsetTop===2));
  assert.ok(body.slice(0,4).every(f=>f.y+f.height<=300||f.y>=440),'full-width figure band stays clear');
  assert.equal(body[3].nextFrameId,body[4].id);assert.equal(body[4].previousFrameId,body[3].id);
  assert.ok(s.frames.every(f=>f.id!=='same-source-id'));
  assert.deepEqual(validateEditableLayout(s),[]);
  const zip=await JSZip.loadAsync((await exportIdml(s,new Uint8Array([1]))).idml);
  const spread=await zip.file('Spreads/Spread_1.xml')!.async('string');
  assert.match(spread,/<InsetSpacing type="list"><ListItem type="unit">2<\/ListItem>/);
});

test('IDML body threads cross every column and page with furniture kept separate',async()=>{
  const s=snapshot();s.pageCount=3;
  s.stories=[{id:'body',paragraphs:Array.from({length:6},(_,i)=>({id:'p'+i,sourceId:'p'+i,style:'body',runs:[{text:'Paragraph '+i}]}))},
    {id:'folio',paragraphs:[{id:'number',sourceId:'number',style:'body',runs:[{text:'1'}]}]}];
  s.frames=s.stories[0].paragraphs.map((p,i)=>({id:'column'+i,storyId:'body',page:Math.floor(i/2)+1,order:i,x:i%2?310:30,y:40,width:220,height:700,paragraphIds:[p.id]}));
  s.frames.push({id:'folio-frame',storyId:'folio',page:1,order:0,x:550,y:10,width:20,height:12,paragraphIds:['number'],layer:'furniture'});
  finalizeEditableThreads(s);s.frames.reverse();
  const zip=await JSZip.loadAsync((await exportIdml(s,new Uint8Array([1]))).idml);
  const frames=new Map<string,Record<string,string>>();
  for(const file of Object.values(zip.files).filter(f=>f.name.startsWith('Spreads/'))){
    const xml=await file.async('string');
    for(const match of xml.matchAll(/<TextFrame\b([^>]*)>([\s\S]*?)<\/TextFrame>/g)){
      const source=match[2].match(/Key="HanMarkSource" Value="([^"]+)"/)?.[1];
      if(source)frames.set(source,Object.fromEntries([...match[1].matchAll(/(\w+)="([^"]*)"/g)].map(m=>[m[1],m[2]])));
    }
  }
  const chain=Array.from({length:6},(_,i)=>frames.get('column'+i)!);
  assert.equal(new Set(chain.map(f=>f.ParentStory)).size,1);
  for(const [i,f]of chain.entries()){
    assert.equal(f.PreviousTextFrame,chain[i-1]?.Self??'n');
    assert.equal(f.NextTextFrame,chain[i+1]?.Self??'n');
  }
  const folio=frames.get('folio-frame')!;
  assert.notEqual(folio.ParentStory,chain[0].ParentStory);
  assert.equal(folio.PreviousTextFrame,'n');assert.equal(folio.NextTextFrame,'n');
});
test('table validation rejects impossible spans, missing cells and incorrect finalized height',()=>{
  const s=snapshot();finalizeEditableThreads(s);
  s.tables=[{id:'t',sourceId:'t',page:1,x:0,y:0,width:100,height:20,columns:[50,50],rows:[{id:'r',height:20,header:false}],cells:[{id:'cell',row:0,column:0,rowspan:1,colspan:2,paragraphs:[]}],padding:2,ruleColor:'#000000',outerRule:.5,innerRule:.5,ruleMode:'apa',fragment:0}];
  assert.deepEqual(validateEditableLayout(s),[]);s.tables[0].cells[0].colspan=1;assert.ok(validateEditableLayout(s).some(i=>i.code==='table-grid-hole'));
  s.tables[0].cells[0].colspan=Infinity;s.tables[0].rows[0].height=40;assert.ok(validateEditableLayout(s).some(i=>i.code==='table-grid'));assert.ok(validateEditableLayout(s).some(i=>i.code==='table-height'));
});
