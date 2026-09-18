import {resolveTemplateText} from '../src/journal/appearance';
import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {PUBLIC_TEMPLATES,JournalTemplateLibrary,exportTemplate,createPublicJournalProject} from '../src/journal/templates';
import {exportJournalArchive,digestBytes,jsonBytes} from '../src/journal/storage';
import {MARKDOWN_PROPERTIES,manuscriptTemplate} from '../src/journal/markdownProperties';
import {localizedProperty} from '../src/journal/propertyLanguage';
import {snapPlacement,edgeScrollSpeed,type PlacementPage} from '../src/journal/placement';
import type {BinaryStore,LayoutBox} from '../src/journal/types';
const memory=():BinaryStore=>{const files=new Map<string,Uint8Array>();return {get:async p=>files.get(p)??null,put:async(p,b)=>{files.set(p,b);}};};

test('public presets are portable on a clean store; repeated import is idempotent',async()=>{
  assert.deepEqual(PUBLIC_TEMPLATES.map(t=>t.id),['builtin:aaeu-demo','builtin:achmage','builtin:command-space']);
  for(const t of PUBLIC_TEMPLATES){
    const zipBytes=await exportTemplate(t,memory()),zip=await JSZip.loadAsync(zipBytes);
    for(const a of t.assets)assert.equal(await digestBytes(await zip.file(a.path)!.async('uint8array')),a.sha256);
    const lib=new JournalTemplateLibrary(memory());const one=await lib.importPackage(zipBytes),two=await lib.importPackage(zipBytes);
    assert.equal(one.id,two.id);assert.equal((await lib.list()).length,3);
  }
});
test('a newly created public project is immediately portable before its first composition',async()=>{
  const p=createPublicJournalProject();assert.equal(p.preset.template?.id,'builtin:aaeu-demo');
  assert.ok(!JSON.stringify(p).includes('HEALTH & NEW MEDIA RESEARCH'));
  const zip=await JSZip.loadAsync(await exportJournalArchive(p,memory()));
  for(const a of p.assets)assert.ok(zip.file(a.path));
});
test('private aliases resolve without altering or publishing private templates',async()=>{
  const store=memory(),lib=new JournalTemplateLibrary(store),t=structuredClone(PUBLIC_TEMPLATES[0]);t.id='private:example';t.name='Private';
  await lib.save(t,store);await store.put('aliases.json',jsonBytes({'builtin:hnmr':t.id}));
  assert.equal((await lib.resolve('builtin:hnmr'))?.id,t.id);assert.equal((await new JournalTemplateLibrary(memory()).resolve('builtin:hnmr')),undefined);
});
test('all guided property labels, locations, descriptions and examples have an English fallback',()=>{
  for(const language of ['en','ja','fr'])for(const s of MARKDOWN_PROPERTIES){const localized=localizedProperty(s,language);assert.ok(!/[가-힣]|undefined/.test([localized.label,localized.location,localized.description,localized.example].join(' ')),s.key);assert.equal(localized.key,s.key);}
  assert.ok(!/[가-힣]/.test(manuscriptTemplate()));assert.match(manuscriptTemplate('builtin:aaeu-demo','ko'),/논문 제목/);
});
const geometry:PlacementPage={page:2,bounds:{x:50,y:80,width:400,height:500},columns:[{x:50,y:80,width:190,height:500},{x:260,y:80,width:190,height:500}],obstacles:[]};
const figure:LayoutBox={id:'f:0',nodeId:'f',page:1,x:50,y:120,width:190,height:120,kind:'figure'};
test('placement obeys body walls, lane widths, page changes and footer limits',()=>{
  const left=snapPlacement(figure,geometry,'left',0),right=snapPlacement(figure,geometry,'right',900),full=snapPlacement(figure,geometry,'full',150);
  assert.equal(left.override.y,80);assert.equal(right.override.x,260);assert.equal(right.override.y!+right.override.height!,580);
  assert.equal(full.override.width,400);assert.equal(full.override.page,2);assert.equal(full.override.x,50);
  assert.equal(full.override.height! / full.override.width,figure.height / figure.width);
});
test('drag targets reject other pinned objects but ignore the object being moved',()=>{
  const page={...geometry,obstacles:[{...figure,nodeId:'other',page:2,y:80}]};
  assert.equal(snapPlacement(figure,page,'left',80).valid,false);assert.equal(snapPlacement(figure,page,'right',80).valid,true);
  page.obstacles[0].nodeId='f';assert.equal(snapPlacement(figure,page,'left',80).valid,true);
  assert.equal(edgeScrollSpeed(250,0,500),0);assert.equal(edgeScrollSpeed(0,0,500),-720);assert.equal(edgeScrollSpeed(500,0,500),720);
});

test('portable publication tokens suppress issue numbers in AOP and leave missing DOI empty',()=>{
 const p=createPublicJournalProject();p.document.year='2026';p.document.volume='10';p.document.issue='1';p.document.firstPage=23;p.document.doi='';p.document.publication={mode:'aop'};
 assert.equal(resolveTemplateText('{publication}',p,23,25),'ACADEMIC EDITOR ULTRA 2026');assert.equal(resolveTemplateText('{doiUrl}',p),'');
 p.document.publication.mode='issue';assert.equal(resolveTemplateText('{publication}',p,23,25),'ACADEMIC EDITOR ULTRA 2026; 10(1), 23–25.');
});
