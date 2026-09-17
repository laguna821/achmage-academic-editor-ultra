import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {afFontFaces} from '../src/io/affinity/fonts';
import {withContinuationPages} from '../src/io/affinity/continuation';
import {afPreflight,exportAf} from '../src/io/affinity/export';
import {createSnapshotDocument} from '../src/io/affinity/document.mjs';
import {freshArchive,freshArchiveAsync} from '../src/io/affinity/native.mjs';
import {finalizeEditableThreads,editableStoryText,validateEditableLayout,type EditableLayoutSnapshot} from '../src/io/editableLayout';

const fonts=[{family:'Arial',post:'ArialMT',bold:false,italic:false}];
const columns=[{x:40,y:60,width:240,height:700},{x:315,y:60,width:240,height:700}];
test('asynchronous archive is byte-identical to accepted writer and yields to cancellation',async()=>{
  const doc=Buffer.from('document'),assets=[{name:'images/pixels',bytes:Buffer.alloc(1048576,173)}];
  assert.deepEqual(await freshArchiveAsync(doc,assets),freshArchive(doc,true,assets));
  const c=new AbortController(),pending=freshArchiveAsync(doc,assets,{signal:c.signal});
  c.abort();await assert.rejects(pending,{name:'AbortError'});
});
test('fresh AF reserves a nonzero reusable tail for the first native in-place save',async()=>{
  const result=createSnapshotDocument(snapshot(),[],fonts),b=await freshArchiveAsync(result.bytes,result.assets);
  const fat=Number(b.readBigUInt64LE(16));
  assert.equal(b.readUInt32LE(0),0x414bff00);
  assert.equal(Number(b.readBigUInt64LE(24)),b.length,'native save must begin after the original archive, never at byte zero');
  assert.equal(Number(b.readBigUInt64LE(fat+20)),b.length);
});
function snapshot():EditableLayoutSnapshot{
  const s:EditableLayoutSnapshot={version:2,title:'AF test',fingerprint:'fixture',pageCount:1,pageWidth:595,pageHeight:842,firstPage:1,
    styles:{body:{font:'Arial',size:10,leading:12,color:'#000000'}},stories:[{id:'journal:body-story',paragraphs:[{id:'p',sourceId:'p',style:'body',runs:[{text:'Original body 😀 with final reference.'}]}]}],
    frames:[{id:'f',storyId:'journal:body-story',page:1,order:0,...columns[0],paragraphIds:['p']}],assets:[],images:[],shapes:[],tables:[],issues:[]};
  finalizeEditableThreads(s);return s;
}
test('extra pages extend the same story with empty left/right capacity and never duplicate text',()=>{
  const s=snapshot(),before=structuredClone(s),out=withContinuationPages(s,2,columns);
  assert.deepEqual(s,before);assert.equal(out.pageCount,3);assert.equal(out.frames.length,5);
  assert.equal(editableStoryText(out.stories[0]),editableStoryText(s.stories[0]));
  assert.deepEqual(out.frames.slice(1).map(f=>[f.page,f.x]),[[2,40],[2,315],[3,40],[3,315]]);
  assert.ok(out.frames.slice(1).every(f=>!f.paragraphIds!.length&&f.start===f.end));
  assert.deepEqual(validateEditableLayout(out),[]);
  const native=createSnapshotDocument(out,[],fonts);
  assert.equal(native.report.stories.length,1);
  assert.equal(native.report.stories[0].text,'Original body 😀 with final reference.\0');
  assert.equal(native.report.flows.length,1);
  assert.deepEqual(withContinuationPages(s,0,[]),s);
});
test('invalid capacity geometry and unbounded page counts fail',()=>{
  for(const count of [-1,11,.5,NaN])assert.throws(()=>withContinuationPages(snapshot(),count,columns));
  for(const c of [[],[columns[0]],[columns[1],columns[0]],[columns[0],columns[0]],[columns[0],{...columns[1],height:900}]]){
    assert.throws(()=>withContinuationPages(snapshot(),1,c));
  }
});
test('AF preflight rejects unsupported content and missing exact faces',()=>{
  const s=snapshot();assert.equal(afPreflight(s,fonts).length,0);
  assert.ok(afPreflight(s,[]).some(i=>i.code==='af-font'));
  s.stories[0].paragraphs[0].runs=[{text:'x',bold:true}];
  assert.ok(afPreflight(s,fonts).some(i=>i.code==='af-font'));
  s.stories[0].paragraphs[0].runs=[{text:'',imageId:'x'}];
  assert.ok(afPreflight(s,fonts).some(i=>i.code==='af-inline-image'));
  s.images.push({id:'image',sourceId:'image',assetId:'x',page:1,...columns[0],crop:columns[0]});
  assert.ok(afPreflight(s,fonts).some(i=>i.code==='af-crop'));
});
test('AF package preserves original binary assets and records unmeasured visibility',async()=>{
  const s=snapshot(),bytes=new Uint8Array([0,1,2,255]);s.assets.push({id:'original',name:'../original.png',mime:'image/png',bytes});
  s.issues.push({severity:'warning',sourceSeverity:'error',code:'figure-placeholder',sourceId:'missing',message:'Source image required'});
  const output=await exportAf(s,[],fonts,new TextEncoder().encode('PDF fixture')),zip=await JSZip.loadAsync(output.package);
  assert.deepEqual(await zip.file('document.af')!.async('uint8array'),new Uint8Array(output.af));
  assert.deepEqual(await zip.file('originals/1-.._original.png')!.async('uint8array'),bytes);
  const report=JSON.parse(await zip.file('export-report.json')!.async('string'));
  assert.equal(report.capacity,'unmeasured-native-reflow');assert.equal(report.stories[0].text,undefined);
  assert.equal(report.stories[0].textSha256.length,64);
  assert.deepEqual(report.issues,s.issues);
});
test('cancellation before and during packaging prevents a returned export',async()=>{
  const a=new AbortController();a.abort();await assert.rejects(exportAf(snapshot(),[],fonts,new Uint8Array(),{signal:a.signal}),/취소/);
  const b=new AbortController();
  await assert.rejects(exportAf(snapshot(),[],fonts,new Uint8Array(),{signal:b.signal,progress:message=>{if(message.includes('패키지'))b.abort();}}),/취소/);
});

// Minimal SFNT name/OS2 tables exercise the parser without redistributing fonts.
function sfnt(bold=false,italic=false):Buffer{
  const names=[[1,'Arial'],[2,'Regular'],[6,'ArialMT'],[16,'Arial'],[17,bold?'Bold Italic':'Regular']] as const;
  const strings=names.map(([,s])=>{const b=Buffer.from(s,'utf16le');return b.swap16();});
  const name=Buffer.alloc(6+12*names.length+strings.reduce((n,b)=>n+b.length,0));
  name.writeUInt16BE(names.length,2);name.writeUInt16BE(6+12*names.length,4);let pos=0;
  names.forEach(([id],i)=>{const at=6+i*12;name.writeUInt16BE(3,at);name.writeUInt16BE(1,at+2);name.writeUInt16BE(0x409,at+4);name.writeUInt16BE(id,at+6);name.writeUInt16BE(strings[i].length,at+8);name.writeUInt16BE(pos,at+10);strings[i].copy(name,6+12*names.length+pos);pos+=strings[i].length;});
  const b=Buffer.alloc(44+name.length+64);b.writeUInt32BE(0x10000);b.writeUInt16BE(2,4);
  b.write('name',12);b.writeUInt32BE(44,20);b.writeUInt32BE(name.length,24);name.copy(b,44);
  b.write('OS/2',28);b.writeUInt32BE(44+name.length,36);b.writeUInt32BE(64,40);b.writeUInt16BE((bold?32:0)|(italic?1:0),b.length-2);return b;
}
test('font names and style flags are parsed from SFNT, subarray and TTC bytes',()=>{
  assert.deepEqual(afFontFaces(sfnt()),fonts);
  assert.deepEqual(afFontFaces(sfnt(true,true)),[{...fonts[0],bold:true,italic:true}]);
  const bytes=sfnt(),padded=Buffer.concat([Buffer.alloc(7),bytes]);
  assert.deepEqual(afFontFaces(padded.subarray(7)),fonts);
  const header=Buffer.alloc(16);header.write('ttcf');header.writeUInt32BE(1,8);header.writeUInt32BE(16,12);
  const moved=sfnt();for(const at of [20,36])moved.writeUInt32BE(moved.readUInt32BE(at)+16,at);
  assert.deepEqual(afFontFaces(Buffer.concat([header,moved])),fonts);
  for(const b of [Buffer.alloc(0),bytes.subarray(0,60),Buffer.alloc(20)])assert.throws(()=>afFontFaces(b));
});
