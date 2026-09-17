import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createSnapshotDocument} from '../src/io/affinity/document.mjs';
import {readDocument,fieldText,writeDocument} from './affinity-research-document.mjs';
import * as layoutModule from '../src/io/editableLayout.ts';
const {finalizeEditableThreads}=layoutModule.default??layoutModule;
export function masterSnapshot(){
  const s={version:2,title:'Native master acceptance',fingerprint:'master-probe',pageWidth:500,pageHeight:700,pageCount:5,firstPage:23,styles:{body:{font:'Arial',size:12,leading:15,color:'#000000'}},stories:[],frames:[],shapes:[],tables:[],images:[],assets:[],issues:[]};
  for(let page=1;page<=5;page++){
    const folio=s.firstPage+page-1,master={id:folio%2?'recto':'verso',name:folio%2?'Recto Author title':'Verso Journal year'};
    for(const key of page===1?['body']:['body','header','folio']){
      const id=key+page,runs=key==='folio'?[{text:String(folio),field:'page-number'}]:[{text:key==='body'?'Body text on page '+page:folio%2?'Author: Short title':'HEALTH & NEW MEDIA RESEARCH 2026'}];
      s.stories.push({id:id+':story',paragraphs:[{id:id+'p',sourceId:id,style:'body',runs}]});
      s.frames.push({id,storyId:id+':story',page,order:0,x:key==='folio'?445:40,y:key==='body'?120:45,width:key==='folio'?35:390,height:35,layer:key==='body'?'body':'furniture',...(key==='body'?{}:{master:{...master,item:key}})});
    }
    if(page>1)s.shapes.push({id:'rule'+page,page,x:40,y:80,width:430,height:2,fill:'#008000',layer:'furniture',master:{...master,item:'rule'}});
  }
  finalizeEditableThreads(s);return s;
}
export const masterFonts=[{family:'Arial',post:'ArialMT',bold:false,italic:false}];
test('native masters use linked instances and dynamic page glyphs, excluding the title page',()=>{
  const out=createSnapshotDocument(masterSnapshot(),[],masterFonts),parsed=readDocument(out.bytes);
  assert.deepEqual(writeDocument(parsed.root),out.bytes);
  assert.equal(parsed.fields.find(f=>f.name==='MpCh').count,2);
  assert.deepEqual(out.report.masters.map(m=>m.pages),[[2,4],[3,5]]);
  assert.equal(parsed.fields.filter(f=>f.name==='PgCt').length,4);
  assert.ok(parsed.fields.some(f=>f.name==='Glys'&&f.count===1));
  const texts=parsed.fields.filter(f=>f.name==='Utf8').map(fieldText);
  assert.ok(!texts.some(t=>/^2[4-7]\0$/.test(t)),'folios must be glyphs, never baked numeric strings');
  assert.ok(texts.includes('HEALTH & NEW MEDIA RESEARCH 2026\0'));
});

test('facing spreads share one paired master, preserve page-local content and leave an odd final page single',()=>{
  const snapshot=masterSnapshot(),before=JSON.stringify(snapshot);
  const body=snapshot.stories.filter(s=>s.id.startsWith('body'));
  snapshot.stories=snapshot.stories.filter(s=>!s.id.startsWith('body'));
  snapshot.stories.push({id:'body',paragraphs:body.flatMap(s=>s.paragraphs)});
  snapshot.frames.filter(f=>f.id.startsWith('body')).forEach((f,i)=>{f.storyId='body';f.order=i;});
  finalizeEditableThreads(snapshot);
  const unchanged=JSON.stringify(snapshot),out=createSnapshotDocument(snapshot,[],masterFonts,{pageLayout:'facing'}),parsed=readDocument(out.bytes);
  assert.equal(JSON.stringify(snapshot),unchanged);
  assert.notEqual(before,unchanged);
  assert.deepEqual(writeDocument(parsed.root),out.bytes);
  assert.equal(parsed.fields.find(f=>f.name==='MpCh').count,1);
  assert.deepEqual(out.report.spreads.map(s=>s.pages),[[1,2],[3,4],[5]]);
  assert.deepEqual(out.report.masters[0].pages,[2,3,4,5]);
  const ints=name=>parsed.fields.filter(f=>f.name===name).map(f=>f.parts[1].readUInt32LE());
  assert.deepEqual(ints('PgOf'),[1,0,0]);assert.deepEqual(ints('MPOf'),[1,0,0]);assert.deepEqual(ints('PgCt'),[1,2,1]);
  const flow=out.report.flows.find(f=>f.sourceStoryId==='body');
  assert.deepEqual(flow.frames.map(f=>f.page),[1,2,3,4,5]);
  const objects=new Map();
  function walk(n){if(n.status===1)objects.set(n.id,n);for(const p of n.parts??[])if(!Buffer.isBuffer(p))walk(p);}
  walk(parsed.root);
  const direct=(obj,name)=>obj.parts.flatMap(p=>Buffer.isBuffer(p)?[]:p.parts??[]).find(f=>f.name===name);
  const nativeNodes=direct(objects.get(flow.nativeId),'Nods').parts.slice(1).map(o=>o.id);
  assert.deepEqual(nativeNodes,flow.frames.map(f=>f.nativeId));
  for(const f of out.report.frames.filter(f=>f.storyId==='body')){
    const native=direct(objects.get(f.nativeId),'Xfrm').parts[1];
    assert.ok(Math.abs(native.readDoubleLE(16)-(f.x+(f.page%2?0:snapshot.pageWidth))*300/72)<1e-8);
  }
});

test('even-sized facing documents have exactly two pages per spread independent of first folio',()=>{
  const s=masterSnapshot();s.firstPage=40;s.pageCount=4;
  s.frames=s.frames.filter(f=>f.page<=4);s.shapes=s.shapes.filter(f=>f.page<=4);
  s.stories=s.stories.filter(st=>s.frames.some(f=>f.storyId===st.id));finalizeEditableThreads(s);
  const out=createSnapshotDocument(s,[],masterFonts,{pageLayout:'facing'});
  assert.deepEqual(out.report.spreads.map(s=>s.pages),[[1,2],[3,4]]);
  assert.equal(out.report.pages,4);assert.equal(out.report.masters.length,1);
  assert.throws(()=>createSnapshotDocument(s,[],masterFonts,{pageLayout:'invalid'}),/page layout/);
});
