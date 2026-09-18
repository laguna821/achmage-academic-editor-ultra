import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openSampleFiles,type SampleFiles} from '../src/journal/sample';
import {SAMPLE_FILES} from '../src/journal/sample.generated';
import {DEMO_TEMPLATE,BRANDED_TEMPLATES,JournalTemplateLibrary,copyTemplateAssets,exportTemplate,applyTemplate,importTemplate} from '../src/journal/templates';
import {createJournalProject} from '../src/journal/project';
import {digestBytes} from '../src/journal/storage';

function vault(){const values=new Map<string,string>();const files:SampleFiles={async exists(p){return values.has(p);},async mkdir(p){values.set(p,'');},async read(p){return values.get(p)!;},async write(p,t){values.set(p,t);}};return {files,values};}
test('sample opens edited source and assets without overwriting; fresh copies remain independent',async()=>{
  const {files,values}=vault(),first=await openSampleFiles(files,'en');
  values.set(first.path,'My edited source');values.set(first.path.replace('Start here.md','assets/workflow.svg'),'My changed image');
  const next=await openSampleFiles(files,'en');assert.ok(next.existing);assert.equal(values.get(next.path),'My edited source');
  assert.equal(values.get(first.path.replace('Start here.md','assets/workflow.svg')),'My changed image');
  const fresh=await openSampleFiles(files,'en',true);assert.notEqual(fresh.path,first.path);assert.equal(values.get(fresh.path),SAMPLE_FILES.en);
  const ko=await openSampleFiles(files,'ko');assert.equal(values.get(ko.path),SAMPLE_FILES.ko);
});
test('both branded presets preserve article content and ship portable vector PDF artwork',async()=>{
  const project=createJournalProject();project.document.title='My unchanged manuscript';project.document.abstract=[{id:'abstract',kind:'paragraph',content:[{text:'An abstract with **literal** characters.'}]}];
  const document=JSON.stringify(project.document),geometry=JSON.stringify(project.preset.page);
  for(const preset of BRANDED_TEMPLATES){
    const values=new Map<string,Uint8Array>(),store={async get(p:string){return values.get(p)??null;},async put(p:string,b:Uint8Array){values.set(p,b);}};
    await copyTemplateAssets(preset,store,store);applyTemplate(project,preset);
    assert.equal(JSON.stringify(project.document),document);assert.equal(JSON.stringify(project.preset.page),geometry);
    for(const asset of preset.assets){assert.equal(asset.mime,'application/pdf');assert.equal(new TextDecoder().decode(values.get(asset.path)!.slice(0,5)),'%PDF-');assert.equal(await digestBytes(values.get(asset.path)!),asset.sha256);}
    const imported=await importTemplate(await exportTemplate(preset,store),store);assert.deepEqual(JSON.parse(JSON.stringify(imported.appearance)),JSON.parse(JSON.stringify(preset.appearance)));
  }
});
test('concurrent creation and recovery after interrupted copying do not duplicate or replace assets',async()=>{
  const {files,values}=vault();const result=await Promise.all([openSampleFiles(files,'en'),openSampleFiles(files,'en')]);assert.equal(result[0].path,result[1].path);assert.equal(result[1].existing,true);
  values.delete(result[0].path);values.set(result[0].path.replace('Start here.md','assets/workflow.svg'),'preserve');
  await openSampleFiles(files,'en');assert.equal(values.get(result[0].path.replace('Start here.md','assets/workflow.svg')),'preserve');
  assert.ok(new TextEncoder().encode(JSON.stringify(SAMPLE_FILES)).length<500000);
});
test('offline sample template exports its original vector brand without a previous project',async()=>{
  const data=new Map<string,Uint8Array>(),store={async get(p:string){return data.get(p)??null;},async put(p:string,b:Uint8Array){data.set(p,b);}};
  assert.ok((await new JournalTemplateLibrary(store).list()).some(t=>t.id===DEMO_TEMPLATE.id));
  await copyTemplateAssets(DEMO_TEMPLATE,store,store);
  for(const a of DEMO_TEMPLATE.assets)assert.equal(await digestBytes(data.get(a.path)!),a.sha256);
  assert.ok((await exportTemplate(DEMO_TEMPLATE,store)).length>100);
});
