import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,PDFName,degrees,rgb} from 'pdf-lib';
import {selectPdfPage,preparePdfAssets,placePdfArtwork} from '../src/journal/pdfArtwork';
import {createJournalProject} from '../src/journal/project';
import {digestBytes} from '../src/journal/storage';
import {validateTemplate,HNMR_TEMPLATE} from '../src/journal/templates';
import {cloneJournal,type BinaryStore} from '../src/journal/types';

const memory=():BinaryStore=>{const files=new Map<string,Uint8Array>();return {async get(p){return files.get(p)??null;},async put(p,b){files.set(p,b);}};};
async function vectorPdf(pages=1,rotation=0){const d=await PDFDocument.create();for(let i=0;i<pages;i++){const p=d.addPage([200,100]);p.setCropBox(10,20,150,70);p.setRotation(degrees(rotation));p.drawRectangle({x:10,y:20,width:150,height:70,color:rgb(i/Math.max(1,pages),0,0)});}return d.save();}
test('single-page artwork preserves every original byte; selected pages retain vectors and rotation',async()=>{
  const original=await vectorPdf(),one=await selectPdfPage(original);assert.equal(one.bytes,original);assert.deepEqual([one.width,one.height],[150,70]);
  const multi=await vectorPdf(2,90),selected=await selectPdfPage(multi,2),d=await PDFDocument.load(selected.bytes);
  assert.equal(d.getPageCount(),1);assert.equal(d.getPage(0).getRotation().angle,90);assert.deepEqual([selected.width,selected.height],[70,150]);
  await assert.rejects(()=>selectPdfPage(multi,3),/페이지/);
});
test('retained legacy PDF derivatives are recovered without mutating originals or losing selected page',async()=>{
  const p=createJournalProject(),store=memory(),bytes=await vectorPdf(2),sha256=await digestBytes(bytes);
  p.assets.push({id:'original',name:'logo.pdf',mime:'application/pdf',bytes:bytes.length,sha256,path:`assets/${sha256}.pdf`});
  p.assets.push({id:'logo',name:'logo-page-2.png',mime:'image/png',bytes:1,sha256:'0'.repeat(64),path:`assets/${'0'.repeat(64)}.png`,derivedFrom:'original'});
  p.preset.master={...p.preset.master,logoAssetId:'logo'};
  p.document.blocks=[{id:'f',kind:'figure',assetId:'logo',width:'full',crop:{x:0,y:.1,width:1,height:.9,assetSha256:'0'.repeat(64),confirmed:true}}];
  const original={...p.assets[0]};await store.put(p.assets[0].path,bytes);const map=await preparePdfAssets(p,store),asset=p.assets[1];
  assert.deepEqual(p.assets[0],original);assert.equal(asset.mime,'application/pdf');assert.equal(asset.name,'logo-page-2.pdf');assert.equal(asset.aspectRatio,150/70);assert.ok(map.has('logo'));
  assert.equal(p.document.blocks[0].kind==='figure'&&p.document.blocks[0].crop?.assetSha256,asset.sha256);
  const t=cloneJournal(HNMR_TEMPLATE);t.appearance.logo={mode:'asset',assetId:'logo'};t.assets=[asset];assert.doesNotThrow(()=>validateTemplate(t));
});
test('PDF composition embeds Form XObjects, preserving source vector paths at every rotation',async()=>{
  for(const angle of [0,90,180,270]){
    const source=await vectorPdf(1,angle),base=await PDFDocument.create();base.addPage([500,700]);
    const out=await placePdfArtwork(await base.save(),new Map([['logo',source]]),[{assetId:'logo',page:1,x:40,y:60,width:200,height:100}]);
    const doc=await PDFDocument.load(out),page=doc.getPage(0),resources=page.node.Resources()!,objects=resources.lookup(PDFName.of('XObject'));
    assert.ok(objects);assert.equal(doc.getPageCount(),1);
    const forms=doc.context.enumerateIndirectObjects().filter(([,o])=>'dict' in o&&(o as {dict:{get:(k:PDFName)=>unknown}}).dict.get(PDFName.of('Subtype'))===PDFName.of('Form'));
    assert.equal(forms.length,1,'artwork should be a vector Form, never a rendered bitmap');
  }
});
