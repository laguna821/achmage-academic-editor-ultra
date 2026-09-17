import {test} from "node:test";
import assert from "node:assert/strict";
import {appearanceFromPreset,customHeader,resolveTemplateText,referenceChecks,academicChecks,validateAppearance,FONT_GROUPS} from "../src/journal/appearance";
import {applyTemplate,blankTemplate,exportTemplate,importTemplate,HNMR_TEMPLATE,GENERAL_TEMPLATE,JournalTemplateLibrary,validateTemplate} from "../src/journal/templates";
import {createJournalProject,validateProject,JournalHistory} from "../src/journal/project";
import {journalStyles,masterBackground} from "../src/journal/master";
import {editorialIssues} from "../src/journal/editorial";
import {cloneJournal,type BinaryStore} from "../src/journal/types";
import {catalogPaths,discoverSystemFonts,readSystemFont} from "../src/journal/systemFonts";
import {fontFamilies} from "../src/journal/fonts";
import {ensureProjectFonts} from "../src/journal/autoFonts";
import {digestBytes} from "../src/journal/storage";
const memory=():BinaryStore=>{const data=new Map<string,Uint8Array>();return {async get(p){return data.get(p)??null;},async put(p,b){data.set(p,b.slice());}};};

test("HNMR appearance leaves master and every role exactly unchanged",()=>{
  const p=createJournalProject(),styles=journalStyles(p.preset),background=masterBackground(p,undefined,3);
  applyTemplate(p,HNMR_TEMPLATE);
  assert.deepEqual(journalStyles(p.preset),styles);assert.equal(masterBackground(p,undefined,3),background);
});
test("template cannot change existing geometry, metadata, blocks or fonts",()=>{
  const p=createJournalProject();p.document.doi="10.1/example";p.preset.page.gutterMm=7;p.preset.headingTransitionsPt={"1:2":3.7};
  const previous=cloneJournal(p);const t=blankTemplate();t.appearance.fonts.body="Example";
  applyTemplate(p,t);
  assert.deepEqual(p.document,previous.document);assert.deepEqual(p.preset.page,previous.preset.page);assert.deepEqual(p.preset.headingTransitionsPt,previous.preset.headingTransitionsPt);assert.deepEqual(p.fonts,previous.fonts);
  assert.equal(validateProject(p).preset.appearance?.fonts.body,"Example");
});
test("font groups cover all roles without changing size, weight, indents or spacing",()=>{
  const p=createJournalProject(),before=journalStyles(p.preset),t=blankTemplate();
  for(const key of Object.keys(FONT_GROUPS) as (keyof typeof FONT_GROUPS)[])t.appearance.fonts[key]=key;
  applyTemplate(p,t);const after=journalStyles(p.preset);
  const covered=Object.values(FONT_GROUPS).flat();assert.equal(new Set(covered).size,Object.keys(before).length);
  for(const [group,roles]of Object.entries(FONT_GROUPS))for(const role of roles)assert.deepEqual(after[role],{...before[role],font:group});
});
test("undo restores old project fields and unknown future template versions are rejected",()=>{
  const p=createJournalProject(),h=new JournalHistory(p);h.change(p=>applyTemplate(p,GENERAL_TEMPLATE));h.undo();assert.deepEqual(h.current.preset,p.preset);
  assert.throws(()=>validateTemplate({...GENERAL_TEMPLATE,version:2}));
  assert.throws(()=>validateAppearance({...GENERAL_TEMPLATE.appearance,version:2}));
});
test("general publication removes academic checks but not missing source checks",()=>{
  const p=createJournalProject();p.document.blocks.push({id:"missing",kind:"figure",assetId:"",width:"auto"});
  assert.ok(editorialIssues(p).some(i=>i.code==="end-matter-empty"));
  applyTemplate(p,GENERAL_TEMPLATE);assert.equal(academicChecks(p),false);assert.equal(referenceChecks(p),false);
  assert.ok(!editorialIssues(p).some(i=>i.code.startsWith("end-matter")));assert.ok(editorialIssues(p).some(i=>i.code==="figure-source-required"));
  p.preset.appearance!.referenceChecks=true;assert.equal(referenceChecks(p),true);
});
test("AOP suppresses all issue/page tokens, never deletes values",()=>{
  const p=createJournalProject();Object.assign(p.document,{title:"Title",year:"2027",volume:"10",issue:"2",firstPage:31,publication:{mode:"aop"}});
  applyTemplate(p,GENERAL_TEMPLATE);p.preset.appearance!.rightHeader={mode:"text-page",text:"Newsletter"};
  assert.equal(resolveTemplateText("{year}|{volume}|{issue}|{page}|{firstPage}|{lastPage}",p,32,40),"2027|||||");
  assert.equal(customHeader(p,"right",32,40),"Newsletter");assert.equal(p.document.volume,"10");
});
test("custom mark never gets a Crossmark link and custom text is escaped",()=>{
  const p=createJournalProject();p.document.doi="10.1/example";const t=blankTemplate();
  t.appearance.mark={mode:"asset",assetId:"logo"};t.appearance.publicationText='Title #include("private")';
  t.assets=[{id:"logo",name:"logo.png",mime:"image/png",path:"assets/"+ "a".repeat(64)+".png",sha256:"a".repeat(64),bytes:1}];
  applyTemplate(p,t);const source=masterBackground(p,undefined,2);
  assert.ok(!source.includes("crossmark.crossref.org"));assert.ok(source.includes('Title #include(\\"private\\")'));
  assert.ok(source.includes('fit:"contain"'));
});
test("appearance rejects invalid colors, text, modes, variables and geometry injection",()=>{
  for(const patch of [{colors:{key:"red",rule:"#000000",abstract:"#ffffff"}},{publicationText:"{not-a-token}"},{copyrightText:"x".repeat(1601)},{fonts:{page:"x"}},{rightHeader:{mode:"script",text:""}}])assert.throws(()=>validateAppearance({...GENERAL_TEMPLATE.appearance,...patch}));
  const a=validateAppearance({...GENERAL_TEMPLATE.appearance,page:{width:999}});assert.equal("page" in a,false);
});
test("library templates are snapshots, builtins immutable, exchange excludes font files",async()=>{
  const source=memory(),library=new JournalTemplateLibrary(memory()),t=blankTemplate();t.name="Mine";
  const saved=await library.save(t,source),p=createJournalProject();applyTemplate(p,saved);
  t.appearance.journalName="Changed";await library.save(t,source);assert.equal(p.preset.appearance!.journalName,"");
  assert.equal((await library.list()).length,3);await library.remove(saved.id);assert.equal((await library.list()).length,2);
  assert.throws(()=>library.remove(HNMR_TEMPLATE.id));
  const zip=await exportTemplate(t,source),imported=await importTemplate(zip,memory());
  assert.deepEqual(cloneJournal(imported.appearance),cloneJournal(t.appearance));assert.notEqual(imported.id,t.id);assert.deepEqual(imported.assets,[]);
});
test("logo exchange checks hashes and rejects path traversal",async()=>{
  const source=memory(),bytes=new Uint8Array([1,2,3]),sha256=await digestBytes(bytes),t=blankTemplate();
  const path="assets/"+sha256+".png";t.assets=[{id:"image",name:"logo.png",mime:"image/png",path,bytes:3,sha256}];t.appearance.logo={mode:"asset",assetId:"image"};
  await source.put(path,bytes);const imported=await importTemplate(await exportTemplate(t,source),memory());assert.deepEqual(imported.assets,t.assets);
  assert.throws(()=>validateTemplate({...t,assets:[{...t.assets[0],path:"../outside.png"}]}));
  await source.put(path,new Uint8Array([1]));await assert.rejects(exportTemplate(t,source));
});
test("font discovery parses all three OS catalogs and excludes disabled macOS fonts",()=>{
  assert.deepEqual(catalogPaths("linux","/usr/share/fonts/a.ttf\n/home/me/custom/b.otf\n"),["/usr/share/fonts/a.ttf","/home/me/custom/b.otf"]);
  assert.deepEqual(catalogPaths("win32","C:\\Custom\\a.ttf\nfoo.ttf","C:\\Windows","C:\\Users\\me\\AppData\\Local"),["C:\\Custom\\a.ttf","C:\\Windows\\Fonts\\foo.ttf","C:\\Users\\me\\AppData\\Local\\Microsoft\\Windows\\Fonts\\foo.ttf"]);
  assert.deepEqual(catalogPaths("darwin",JSON.stringify([{path:"/Library/Fonts/a.ttc",enabled:"yes"},{path:"/Library/Fonts/b.ttf",enabled:"no"}])),["/Library/Fonts/a.ttc"]);
});
test("real OS catalog reads only approved fonts; saved family snapshots are not replaced",async()=>{
  const catalog=await discoverSystemFonts();assert.ok(catalog.fonts.length>0,"OS must supply readable installed fonts");
  const selected=catalog.fonts[0],file=await readSystemFont(selected.id);assert.ok(fontFamilies(file.bytes).includes(selected.family));
  await assert.rejects(readSystemFont("C:/Windows/private.txt"));
  const p=createJournalProject(),t=blankTemplate();t.appearance.fonts={body:selected.family,heading:selected.family,auxiliary:selected.family};applyTemplate(p,t);
  const store=memory();assert.deepEqual(await ensureProjectFonts(p,store,catalog),[]);const snapshot=cloneJournal(p.fonts);
  assert.deepEqual(await ensureProjectFonts(p,store,{fonts:[],warnings:[]}),[]);assert.deepEqual(p.fonts,snapshot);
});
