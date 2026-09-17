import test from 'node:test';
import assert from 'node:assert/strict';
import {createJournalProject,validateProject} from '../src/journal/project';
import {importMarkdown} from '../src/journal/markdown';
import {validateMarkdownProperties,propertyTemplate} from '../src/journal/markdownProperties';
import {snapshotImages,reconcileMarkdown,sourceLine} from '../src/journal/markdownSource';
import {applyArticleOverrides,sidebarItems} from '../src/journal/articleFurniture';
import {customHeader} from '../src/journal/appearance';
import {exportJournalArchive,importJournalArchive,digestBytes} from '../src/journal/storage';
import {inlineText,type BinaryStore,type JournalProject} from '../src/journal/types';
const memory=():BinaryStore=>{const map=new Map<string,Uint8Array>();return {get:async k=>map.get(k)??null,put:async(k,b)=>{map.set(k,b);}};};
async function md(text:string,metadata:Record<string,unknown>={},store=memory()){const p=createJournalProject();await importMarkdown(p,{name:'paper.md',text,metadata},store);return p;}
test('dedicated metadata wins; paragraph breaks survive; numeric author and affiliation order is deterministic',async()=>{
  const p=await md('## Introduction\n\nBody\n\n### Subheading',{'aaeu-schema':1,title:'Old','aaeu-title':'New','aaeu-abstract':'First paragraph.\n\nSecond paragraph.','aaeu-author-10-name':'Ten','aaeu-author-2-name':'Two','aaeu-author-2-affiliations':['10'],'aaeu-affiliation-10-text':'Institute','aaeu-first-page':23,'aaeu-running-authors':'Two et al.'});
  assert.equal(p.document.title,'New');assert.deepEqual(p.document.authors.map(a=>a.name),['Two','Ten']);assert.deepEqual(p.document.authors[0].affiliations,['1']);assert.deepEqual(p.document.affiliationMarkers,['10']);assert.equal(p.document.firstPage,23);assert.equal(p.document.runningAuthors,'Two et al.');assert.equal(p.document.abstract.length,2);assert.deepEqual(p.document.blocks.filter(n=>n.kind==='heading').map(n=>n.level),[1,2]);validateProject(p);
});
test('abstract and declarations are deduplicated; conflicting copies block final output',async()=>{
  const body='## Abstract\n\nSummary.\n\n## Introduction\n\nBody.\n\n## Data availability statement\n\nAvailable on request.\n\n## References\n\nKim, M. (2024). Test.';
  const a=await md(body,{'aaeu-abstract':'Summary.','aaeu-data-text':'Available on request.'});assert.equal(a.document.abstract.length,1);assert.equal(a.document.endMatter?.find(e=>e.kind==='data')?.content.length,1);assert.equal(a.issues.filter(i=>i.code==='markdown-property-conflict').length,0);
  const b=await md(body,{'aaeu-abstract':'Different.','aaeu-data-text':'Different.'});assert.equal(b.issues.filter(i=>i.code==='markdown-property-conflict'&&i.severity==='error').length,2);
});
test('unknown fields and wrong types are explicit errors; absent affiliations never silently reassigned',async()=>{
  assert.equal(validateMarkdownProperties({'aaeu-scehma':1,'aaeu-first-page':-1,'aaeu-reference-checks':'yes','aaeu-schema':2}).length,4);
  const p=await md('Body',{'aaeu-author-1-name':'A','aaeu-author-1-affiliations':[9]});assert.ok(p.issues.some(i=>i.code==='markdown-affiliation'));
});
test('article overrides inherit on empty, explicitly hide, preserve page token and custom sidebar order',async()=>{
  const p=await md('Body',{'aaeu-received':'2026-01-02','aaeu-corresponding-name':'Editor','aaeu-corresponding-email':'editor@example.org','aaeu-copyright-text':'','aaeu-publication-hide':true,'aaeu-header-even-text':'Journal {year}','aaeu-header-odd-text':'Author: short title','aaeu-folio-text':'Page {page}','aaeu-first-page':23,'aaeu-publication-mode':'issue','aaeu-sidebar-order':['custom','correspondence','received'],'aaeu-sidebar-1-label':'Contact','aaeu-sidebar-1-text':'Custom text','aaeu-sidebar-received-hide':true});
  applyArticleOverrides(p);assert.equal(p.preset.appearance?.publicationText,'');assert.equal(p.preset.appearance?.copyrightText,undefined);assert.equal(customHeader(p,'right',24),'Page 24');assert.equal(customHeader(p,'left',23),'Author: short title');assert.deepEqual(sidebarItems(p).map(s=>s.id),['custom-1','correspondence']);assert.match(sidebarItems(p)[1].text,/editor@example.org/);validateProject(p);
});
test('source locations map YAML and Markdown blocks back to original lines',async()=>{
  const text='---\naa eu: test\n---\n\n## Introduction\n\nBody.';const p=await md(text);assert.equal(sourceLine(p,p.document.blocks[1].id,text),6);assert.equal(sourceLine(p,'property:aaeu-title','---\naaeu-title: Test\n---'),1);
});
test('remote snapshots work offline; explicit refresh updates the same URL; error pages fail',async()=>{
  const store=memory();const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);new DataView(png.buffer).setUint32(16,100);new DataView(png.buffer).setUint32(20,80);
  let calls=0;const first=snapshotImages(store,[],async()=>{calls++;return {bytes:png,name:'a.png'};});await first.resolve('https://example.org/a.png');await first.resolve('https://example.org/a.png');assert.equal(calls,1);
  const offline=snapshotImages(store,first.dependencies,async()=>{throw Error('offline');});assert.deepEqual((await offline.resolve('https://example.org/a.png')).bytes,png);
  const newer=png.slice();new DataView(newer.buffer).setUint32(16,200);const refresh=snapshotImages(store,first.dependencies,async()=>({bytes:newer,name:'a.png'}),true);await refresh.resolve('https://example.org/a.png');assert.notEqual(refresh.dependencies[0].sha256,first.dependencies[0].sha256);
  await assert.rejects(snapshotImages(store,[],async()=>({bytes:new TextEncoder().encode('<html>Expired</html>'),mime:'text/html',name:'a.png'})).resolve('https://example.org/a.png'),/HTML/);
  await assert.rejects(first.resolve('uploading'),/업로드/);
});
test('image snapshots are included in project ZIP and validated on restore',async()=>{
  const store=memory(),p=await md('Body',{},store),bytes=new TextEncoder().encode('asset'),hash=await digestBytes(bytes);await store.put('sources/'+hash+'.image',bytes);
  p.markdown={mode:'source',path:'paper.md',sha256:p.sources[0].sha256,properties:{},dependencies:[{src:'https://example.org/a.png',kind:'remote',path:'sources/'+hash+'.image',sha256:hash,name:'a.png',checkedAt:'2026-01-01'}]};
  const restored=memory(),next=await importJournalArchive(await exportJournalArchive(p,store),restored);assert.equal(next.markdown?.path,'paper.md');assert.deepEqual(await restored.get(p.markdown.dependencies[0].path),bytes);
});
test('rebuild preserves unchanged object IDs and reviews; changed text gets a new identity',async()=>{
  const a=await md('## Introduction\n\nFirst.\n\nSecond.\n\n## References\n\nKim, M. (2024). Title.'),b=await md('## Introduction\n\nFirst.\n\nChanged.\n\n## References\n\nKim, M. (2024). Title.');
  a.references[0].confirmed=true;const next=reconcileMarkdown(a,b);assert.equal(next.id,a.id);assert.equal(next.document.blocks[1].id,a.document.blocks[1].id);assert.notEqual(next.document.blocks[2].id,a.document.blocks[2].id);assert.equal(next.references[0].id,a.references[0].id);assert.equal(next.references[0].confirmed,true);assert.equal(next.sources.length,1);validateProject(next);
});
test('linked images, wikilink aliases and remote Markdown images keep an explicit figure caption',async()=>{
  for(const syntax of ['[![fallback](pic.png)](https://example.org)','![[pic.png|600]]','![fallback](https://example.org/pic.png)']){
    const p=createJournalProject(),png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);new DataView(png.buffer).setUint32(16,100);new DataView(png.buffer).setUint32(20,100);
    await importMarkdown(p,{name:'paper.md',text:'## Results\n\n'+syntax+'\n\nFigure 1. Explicit caption.',resolveImage:async()=>({bytes:png,name:'pic.png'})},memory());
    const f=p.document.blocks.find(n=>n.kind==='figure');assert.ok(f?.kind==='figure');assert.equal(inlineText(f.caption?.title??[]),'Explicit caption.');assert.equal(p.document.blocks.filter(n=>n.kind==='figure').length,1);
  }
});
test('template includes editable long fields and indexed entries without invented dates or declarations',()=>{const t=propertyTemplate();assert.match(t,/aaeu-abstract: \|/);assert.match(t,/aaeu-received: ""/);assert.match(t,/aaeu-author-1-name:/);assert.match(t,/aaeu-statement-1-text: \|/);});
