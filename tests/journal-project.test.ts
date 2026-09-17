import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { createJournalProject, JournalHistory, setChangeDecision, validateProject } from "../src/journal/project";
import { importAuthorFile } from "../src/journal/docx";
import { exportJournalArchive, importJournalArchive } from "../src/journal/storage";
import { visibleInlines, inlineText, type BinaryStore, type Paragraph } from "../src/journal/types";
import { journalStyles, journalSpacing } from "../src/journal/master";

function memory(): BinaryStore { const data=new Map<string,Uint8Array>();return {async get(p){return data.get(p)??null;},async put(p,b){data.set(p,b.slice());}}; }
async function manuscript(body:string){
  const zip=new JSZip();zip.file("word/document.xml",`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  const p=createJournalProject();await importAuthorFile(p,{name:"original.docx",bytes:await zip.generateAsync({type:"uint8array"}),role:"manuscript"},memory());return p;
}
const para=(text:string):string=>`<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
test("unstyled Introduction stops abstract collection, with source text and provenance retained",async()=>{
  const p=await manuscript(para("Abstract")+para("The abstract.")+para("1.0 Introduction")+para("The body must not enter the abstract."));
  assert.deepEqual(p.document.abstract.map(p=>inlineText(p.content)),["The abstract."]);
  assert.equal(p.document.blocks[0].kind,"heading");
  assert.equal(inlineText((p.document.blocks[1] as Paragraph).content),"The body must not enter the abstract.");
  assert.ok([...p.document.abstract,...p.document.blocks].every(b=>b.origin?.sourceId===p.sources[0].id));
});
test("colon and inline abstract labels preserve italic text and split-run label boundaries",async()=>{
  const p=await manuscript('<w:p><w:r><w:t>Abs</w:t></w:r><w:r><w:t>tracts: </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>Exact abstract.</w:t></w:r></w:p>'+para("Keywords: First; second")+para("Introduction")+para("Body."));
  assert.deepEqual(p.document.abstract[0].content,[{text:"Exact abstract.",bold:undefined,italic:true,superscript:undefined,subscript:undefined,changeIds:undefined,citationIds:undefined}]);
  assert.deepEqual(p.document.keywords,["First","second"]);
  assert.equal(p.document.abstract[0].origin?.text,"Abstracts: Exact abstract.");
  const separate=await manuscript(para("Abstract:")+para("Abstract paragraph.")+para("Introduction")+para("Body."));
  assert.equal(inlineText(separate.document.abstract[0].content),"Abstract paragraph.");
});
test("keywords after a Word line break or in a separate paragraph end the abstract",async()=>{
  for(const block of ['<w:p><w:r><w:t>Keywords</w:t><w:br/><w:t>First, second</w:t></w:r></w:p>',para("Keywords")+para("First, second")]){
    const p=await manuscript(para("Abstract")+para("Summary.")+block+para("Introduction")+para("Body."));
    assert.deepEqual(p.document.keywords,["First","second"]);
    assert.equal(p.document.abstract.length,1);
    assert.equal(p.document.blocks.length,2);
  }
});
test("empty keywords do not consume the next section and abstract-like prose stays body text",async()=>{
  const p=await manuscript(para("Abstract")+para("Summary.")+para("Keywords")+para("Introduction")+para("Abstract concepts are discussed here."));
  assert.deepEqual(p.document.keywords,[]);
  assert.ok(p.issues.some(i=>i.code==="keywords-mapping"));
  assert.deepEqual(p.document.blocks.map(b=>inlineText((b as Paragraph).content)),["Keywords","Introduction","Abstract concepts are discussed here."]);
});
test("journal revisions survive import, accept/reject, global undo and archive",async()=>{
  const zip=new JSZip();
  zip.file("word/document.xml",`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Original </w:t></w:r><w:ins w:id="1" w:author="Editor"><w:r><w:t>new</w:t></w:r></w:ins><w:del w:id="2" w:author="Editor"><w:r><w:delText>old</w:delText></w:r></w:del></w:p><w:tbl><w:tblGrid><w:gridCol w:w="1000"/><w:gridCol w:w="1000"/></w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:p><w:r><w:t>Label</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Count</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Group A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>42</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`);
  const p=createJournalProject(),store=memory();
  await importAuthorFile(p,{name:"author.docx",bytes:await zip.generateAsync({type:"uint8array"}),role:"manuscript"},store);
  assert.equal(p.changes.length,2);
  const paragraph=p.document.blocks[0] as Paragraph;
  assert.equal(inlineText(visibleInlines(paragraph.content,p.changes)),"Original new");
  assert.equal(inlineText(visibleInlines(paragraph.content,p.changes,"original")),"Original old");
  const history=new JournalHistory(p);
  history.change(p=>setChangeDecision(p,p.changes.map(c=>c.id),"rejected"));
  assert.equal(inlineText(visibleInlines(paragraph.content,history.current.changes)),"Original old");
  history.undo();assert.equal(inlineText(visibleInlines(paragraph.content,history.current.changes)),"Original new");
  history.redo();assert.equal(history.current.changes[0].decision,"rejected");
  const archive=await exportJournalArchive(history.current,store);
  const restored=await importJournalArchive(archive,memory());
  assert.deepEqual(restored.document,history.current.document);
  assert.deepEqual(restored.changes,history.current.changes);
  assert.notEqual(restored.id,p.id);
});
test("journal validates portable paths and rejects future project schemas",()=>{
  const p=createJournalProject();p.sources.push({id:"s",name:"x",role:"manuscript",path:"../private",sha256:"a"});
  assert.throws(()=>validateProject(p),/경로/);
  assert.throws(()=>validateProject({...p,schemaVersion:5}),/버전/);
});
test("custom master, role typography and float clearances survive portable project storage",async()=>{
  const p=createJournalProject();
  p.preset.textStyles={heading2:{...journalStyles(p.preset).heading2,font:"Editor Font",color:"#123456",indentMm:2.25,leadingPt:14}};
  p.preset.spacing={...journalSpacing(p.preset),floatBeforeMm:5,floatAfterMm:4.5,captionGapPt:3.5};
  p.preset.master!.topRulePt=3.2;p.preset.master!.abstractWidthMm=103;
  p.document.authors=[{name:"Editor",affiliations:["1","2"],corresponding:true,address:"Institution\nCity",email:"editor@example.test"}];
  p.document.affiliationMarkers=["1,2"];
  const original=JSON.stringify(p),checked=validateProject(p);
  assert.equal(JSON.stringify(p),original,"Validation must not mutate a saved project");
  const restored=await importJournalArchive(await exportJournalArchive(checked,memory()),memory());
  assert.deepEqual(restored.preset,p.preset);assert.deepEqual(restored.document,p.document);
  assert.equal(journalStyles(restored.preset).heading2.font,"Editor Font");
  assert.equal(journalSpacing(restored.preset).floatBeforeMm,5);
});
test("master rejects overlapping panels and malformed styles before compiling",()=>{
  const p=createJournalProject();p.preset.master!.sidebarGapMm=50;
  assert.throws(()=>validateProject(p),/폭/);
  p.preset.master!.sidebarGapMm=1.95;p.preset.spacing={...journalSpacing(p.preset),floatBeforeMm:-1};
  assert.throws(()=>validateProject(p),/간격/);
  p.preset.spacing=journalSpacing(createJournalProject().preset);
  p.preset.textStyles={body:{...journalStyles(p.preset).body,leadingPt:5}};
  assert.throws(()=>validateProject(p),/스타일/);
});
