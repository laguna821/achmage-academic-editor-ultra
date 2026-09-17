import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {createJournalProject,validateProject} from "../src/journal/project";
import {importAuthorFile,attachCaptions} from "../src/journal/docx";
import {exportJournalArchive,importJournalArchive} from "../src/journal/storage";
import {imageInfo} from "../src/journal/imageInfo";
import {withoutSourceIndent} from "../src/journal/typst";
import {inferManuscriptHeading} from "../src/journal/headingMapping";
import {inlineText,type BinaryStore} from "../src/journal/types";
import {symbolUnicode} from '../src/journal/symbolFonts';
const w="http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const para=(s:string,bold=false,center=false):string=>`<w:p>${center?'<w:pPr><w:jc w:val="center"/></w:pPr>':""}<w:r>${bold?"<w:rPr><w:b/></w:rPr>":""}<w:t>${s}</w:t></w:r></w:p>`;
test('consecutive figure captions below images and above images preserve one-to-one source order',()=>{
  for(const direction of ['above','below']){
    const nodes:import('../src/journal/types').JournalNode[]=[];
    for(let i=1;i<=8;i++){
      const image:import('../src/journal/types').FigureNode={id:'image'+i,kind:'figure',assetId:i===7?'':'asset'+i,width:'auto',...(i===7?{sourceObject:{type:'office-chart' as const,part:'word/charts/chart1.xml',description:'No preview'}}:{})};
      const caption:import('../src/journal/types').Paragraph={id:'caption'+i,kind:'paragraph',content:[{text:'Figure '+i+'. Caption '+i}]};
      nodes.push(...(direction==='below'?[image,caption]:[caption,image]));
    }
    attachCaptions(nodes);assert.equal(nodes.length,8);
    for(const [i,n]of nodes.entries()){assert.equal(n.kind,'figure');if(n.kind!=='figure')throw Error();assert.equal(n.caption?.number,String(i+1));assert.equal(n.caption?.source?.id,'caption'+(i+1));}
    assert.equal(nodes[6].kind==='figure'&&nodes[6].assetId,'');
  }
});
test('a blinded manuscript beginning with an abstract does not fabricate title or authors',async()=>{
  const {p}=await load(para('Abstract')+para('Purpose: Summary.')+para('Keywords: test')+para('Article classification: Research paper')+para('1. Introduction')+para('Body.'));
  assert.equal(p.document.title,'');assert.deepEqual(p.document.authors,[]);
});
test('legacy Symbol uses unambiguous public mappings; other fonts and private glyphs remain explicit',async()=>{
  assert.equal(symbolUnicode('Symbol','F061'),'α');assert.equal(symbolUnicode('symbol','62'),'β');assert.equal(symbolUnicode('Symbol','F0AE'),'→');
  for(const [font,code]of [['Wingdings','F061'],['Symbol','F044'],['Symbol','F060'],['Symbol','1F061']])assert.equal(symbolUnicode(font,code),undefined);
  const {p}=await load('<w:p><w:r><w:sym w:font="Symbol" w:char="F061"/><w:t> = .8</w:t></w:r></w:p>');
  assert.equal(inlineText((p.document.blocks[0] as import('../src/journal/types').Paragraph).content),'α = .8');
  assert.ok(p.issues.some(i=>i.code==='symbol-font-mapped'));
});
test('an illustration sharing its caption paragraph becomes a figure attached to its own caption',async()=>{
  const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);new DataView(png.buffer).setUint32(16,800);new DataView(png.buffer).setUint32(20,600);
  const picture='<w:r><a:blip r:embed="rId1"/></w:r>';
  const {p}=await load('<w:p>'+picture+'<w:r><w:t>Figure 1. Original caption.</w:t></w:r></w:p><w:p>'+picture+'</w:p>'+para('Figure 2. Next caption.'),z=>{
    z.file('word/_rels/document.xml.rels','<Relationships><Relationship Id="rId1" Target="media/image.png" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"/></Relationships>');z.file('word/media/image.png',png);
  });
  assert.equal(p.document.blocks.length,2);
  for(const [i,node]of p.document.blocks.entries()){assert.equal(node.kind,'figure');if(node.kind!=='figure')throw new Error('Missing illustration');assert.equal(node.caption?.number,String(i+1));assert.ok(node.origin?.path);}
});
test('Office charts use only their own embedded fallback preview; missing 3D artwork is explicit',async()=>{
  const chart='<w:r><w:drawing><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="chart1"/></w:drawing></w:r>';
  const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);new DataView(png.buffer).setUint32(16,900);new DataView(png.buffer).setUint32(20,600);
  const files=(z:JSZip,preview:boolean):void=>{z.file('word/_rels/document.xml.rels','<Relationships><Relationship Id="chart1" Target="charts/chart1.xml" Type="chart"/><Relationship Id="preview" Target="media/preview.png" Type="image"/></Relationships>');z.file('word/charts/chart1.xml','<chart><plotArea><bar3DChart/></plotArea></chart>');if(preview)z.file('word/media/preview.png',png);};
  const missing=await load('<w:p>'+chart+'</w:p>'+para('Figure 3. Original 3D chart.'),z=>files(z,false));const absent=missing.p.document.blocks[0];assert.equal(absent.kind,'figure');if(absent.kind!=='figure')throw Error();assert.equal(absent.assetId,'');assert.equal(absent.chart,undefined);assert.equal(absent.caption?.number,'3');
  const found=await load('<w:p><mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice>'+chart+'</mc:Choice><mc:Fallback><w:r><w:pict><v:imagedata xmlns:v="urn:schemas-microsoft-com:vml" r:id="preview"/></w:pict></w:r></mc:Fallback></mc:AlternateContent></w:p>'+para('Figure 3. Original 3D chart.'),z=>files(z,true));
  assert.equal(found.p.document.blocks.length,1);const f=found.p.document.blocks[0];if(f.kind!=='figure')throw Error();assert.ok(f.assetId);assert.equal(f.chart,undefined);assert.equal(f.sourceObject?.type,'office-chart');assert.deepEqual(await found.store.get(found.p.assets.find(a=>a.id===f.assetId)!.path),png);
});
test("tracked historical properties never replace the current cell grid or paragraph style",async()=>{
  const historical='<w:p><w:pPr><w:pPrChange><w:pPr><w:pStyle w:val="Heading1"/><w:numPr><w:numId w:val="9"/></w:numPr></w:pPr></w:pPrChange></w:pPr><w:r><w:rPr><w:rPrChange><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:rPrChange></w:rPr><w:t>Ordinary prose.</w:t></w:r></w:p>';
  const {p}=await load(historical+'<w:tbl><w:tblGrid><w:gridCol/><w:gridCol/><w:tblGridChange><w:tblGrid><w:gridCol/></w:tblGrid></w:tblGridChange></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcPrChange><w:tcPr><w:gridSpan w:val="2"/></w:tcPr></w:tcPrChange></w:tcPr>'+para('A')+'</w:tc><w:tc>'+para('B')+'</w:tc></w:tr></w:tbl>');
  const prose=p.document.blocks[0],table=p.document.blocks[1];assert.equal(prose.kind,'paragraph');if(prose.kind!=='paragraph'||table.kind!=='table')throw new Error('Missing source nodes');
  assert.equal(prose.list,undefined);assert.ok(!prose.content[0].superscript);assert.deepEqual(table.rows[0].cells.map(c=>c.colspan),[1,1]);assert.equal(table.columnWeights.length,2);
  assert.ok(p.changes.some(c=>c.detail==='tblGridChange'));assert.ok(p.issues.some(i=>i.code==='unsupported-revisions'));
});
test("preset indentation replaces manual leading spaces without changing source or interior spacing",()=>{
  const runs=[{text:" \t",bold:true},{text:"\u200bA  measured sentence",italic:true},{text:"\tinside"}];
  assert.deepEqual(withoutSourceIndent(runs),[{text:"A  measured sentence",italic:true},{text:"\tinside"}]);assert.equal(runs[0].text," \t");
  assert.deepEqual(withoutSourceIndent([{text:"\n",break:true},{text:"  after break"}]),[{text:"\n",break:true},{text:"  after break"}]);
});
test("unstyled section labels gain heading spacing; emphasis within prose and lists do not",async()=>{
  const {p}=await load(para("A manuscript title")+para("Abstract")+para("Summary.")+para("Keywords: test")+para("2. METHODS",true)+para("2.1 Study setting and design",true)+para("\u200b2.2 Sampling and data collection")+para("Statistical analysis",true)+para("Body prose with a full stop.",true)+para("Methods require care."));
  assert.deepEqual(p.document.blocks.map(n=>[n.kind,"level" in n?n.level:undefined]),[["heading",1],["heading",2],["heading",2],["heading",2],["paragraph",undefined],["paragraph",undefined]]);
  assert.equal(p.issues.filter(i=>i.code==="heading-mapping-review").length,4);
  assert.ok(p.document.blocks.every(n=>n.origin?.path));
  for(const text of ["1. Do this first","Table 1","Figure 2","RQ1","H1"]){assert.equal(inferManuscriptHeading({id:"x",kind:"paragraph",content:[{text}]}),undefined);}
  assert.equal(inferManuscriptHeading({id:"x",kind:"paragraph",list:{id:"list",level:0,ordered:true},content:[{text:"Methods",bold:true}]}),undefined);
});
async function load(body:string,extra?:(z:JSZip)=>void){
  const z=new JSZip();z.file("word/document.xml",`<w:document xmlns:w="${w}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}</w:body></w:document>`);extra?.(z);
  const bytes=await z.generateAsync({type:"uint8array"}),p=createJournalProject(),data=new Map<string,Uint8Array>();
  const store:BinaryStore={async get(key){return data.get(key)??null;},async put(key,bytes){data.set(key,bytes);}};
  await importAuthorFile(p,{name:"manuscript.docx",bytes,role:"manuscript"},store);return {p,store,bytes};
}
test("image parts with tmp names retain exact PNG bytes, dimensions and figure links",async()=>{
  const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);const view=new DataView(png.buffer);view.setUint32(16,1193);view.setUint32(20,782);
  const {p,store}=await load('<w:p><w:r><a:blip r:embed="rId1"/></w:r></w:p>',z=>{
    z.file("[Content_Types].xml",'<Types><Default Extension="tmp" ContentType="image/png"/></Types>');
    z.file("word/_rels/document.xml.rels",'<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.tmp"/></Relationships>');z.file("word/media/image1.tmp",png);
  });
  assert.equal(p.assets.length,1);assert.equal(p.assets[0].name,"image1.tmp");assert.match(p.assets[0].path,/\.png$/);assert.equal(p.assets[0].mime,"image/png");assert.equal(p.assets[0].widthPx,1193);assert.equal(p.assets[0].heightPx,782);
  assert.deepEqual(await store.get(p.assets[0].path),png);
  assert.equal(p.document.blocks[0].kind,"figure");assert.equal(p.issues.length,0);
});
test("JPEG dimensions are read from bytes and truncated segments terminate safely",()=>{
  const jpeg=Uint8Array.from([255,216,255,224,0,4,0,0,255,192,0,11,8,1,44,2,88,1,1,17,0,255,217]);
  assert.deepEqual(imageInfo(jpeg,"photo.tmp"),{extension:"jpg",mime:"image/jpeg",widthPx:600,heightPx:300});
  assert.equal(imageInfo(jpeg.slice(0,14),"photo.tmp").mime,"image/jpeg");
});
test("missing and external images are explicit errors without a fetch",async()=>{
  const {p}=await load('<w:p><w:r><a:blip r:link="external"/><a:blip r:embed="absent"/></w:r></w:p>',z=>z.file("word/_rels/document.xml.rels",'<Relationships><Relationship Id="external" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.test/private.png" TargetMode="External"/></Relationships>'));
  assert.equal(p.assets.length,0);assert.equal(p.issues.filter(i=>i.code==="missing-embedded-image"&&i.severity==="error").length,2);
});
test("zero-width-prefixed captions retain inline formatting, provenance and adjacent table notes",async()=>{
  const caption='<w:p><w:r><w:t>\u200bTable 1. </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>Measured values</w:t></w:r></w:p>';
  const {p}=await load(caption+'<w:tbl><w:tr><w:tc>'+para("Label")+'</w:tc></w:tr></w:tbl>'+para("Note. Source values are preserved.")+para("Body resumes."));
  const table=p.document.blocks[0];assert.equal(table.kind,"table");if(table.kind!=="table")throw new Error("No table");
  assert.equal(table.caption?.number,"1");assert.equal(table.caption?.title[0].italic,true);assert.equal(inlineText(table.caption!.title),"Measured values");
  assert.ok(table.caption?.source?.origin?.path);assert.equal(table.caption?.notes[0].role,"note");assert.equal(p.document.blocks.length,2);
});
test('table probability and specific notes attach across blank paragraphs without consuming prose',async()=>{
  const {p}=await load(para('Table 1. Results')+'<w:tbl><w:tr><w:tc>'+para('Value')+'</w:tc></w:tr></w:tbl>'+para(' ')+para('* p &lt; .05; ** p &lt; .01.')+para('Note. Observed values.')+'<w:p><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>a</w:t></w:r><w:r><w:t> Specific group.</w:t></w:r></w:p>'+para('The discussion continues.'));
  const t=p.document.blocks[0];assert.equal(t.kind,'table');if(t.kind!=='table')throw new Error('Missing table');assert.equal(t.caption?.notes.length,3);assert.ok(t.caption?.notes.every(n=>n.origin?.path&&n.role==='note'));assert.ok(p.document.blocks.some(n=>n.kind==='paragraph'&&inlineText(n.content)==='The discussion continues.'));
});
test("source title, split subtitle and running title map without losing source paragraphs",async()=>{
  const {p,store}=await load(para("Running title: A short title")+para("Research across two columns:",true)+para("The effects of measured journal composition",true)+para("Abstract")+para("Summary.")+para("Introduction")+para("Body text."));
  assert.equal(p.document.title,"Research across two columns: The effects of measured journal composition");assert.equal(p.document.runningTitle,"A short title");
  assert.equal(p.document.blocks.length,2);assert.equal(p.document.importedMetadata?.filter(m=>m.field!=='abstractLabel').flatMap(m=>m.blocks).length,3);
  assert.equal(p.document.importedMetadata?.find(m=>m.field==='abstractLabel')?.blocks[0].origin?.text,'Abstract');
  assert.ok(p.document.importedMetadata?.every(m=>m.blocks.every(b=>b.origin?.sourceId===p.sources[0].id)));
  assert.ok(p.issues.some(i=>i.code==="front-matter-review"));
  const checked=validateProject(p),roundTrip=await importJournalArchive(await exportJournalArchive(checked,store),store);
  assert.deepEqual(roundTrip.document,checked.document);
});
test("a source-backed author/email/institution candidate is reviewable and missing authors stay empty",async()=>{
  const {p}=await load(para("A sufficiently explicit manuscript title")+para(" ")+para("Dr Jane Smith")+para("Affiliation: Example University")+para("South Africa")+para("Email: jane@example.test")+para("Postal Address: Example City")+para("Abstract")+para("Summary.")+para("Introduction"));
  assert.deepEqual(p.document.authors,[{name:"Jane Smith",affiliations:["1"],email:"jane@example.test",corresponding:true,address:"Example City"}]);assert.deepEqual(p.document.affiliations,["Example University, South Africa"]);
  assert.equal(p.document.blocks.filter(b=>b.kind!=="paragraph"||inlineText(b.content).trim()).length,1);
  const absent=await load(para("A sufficiently explicit manuscript title")+para("Abstract")+para("Summary.")+para("Introduction"));assert.deepEqual(absent.p.document.authors,[]);
});
test("centered bold title after keywords is mapped; the first body paragraph is not guessed",async()=>{
  const {p}=await load(para("Abstract")+para("Summary.")+para("Keywords: alpha, beta")+para("A title after the abstract",true,true)+para("Actual body text."));
  assert.equal(p.document.title,"A title after the abstract");assert.equal(p.document.blocks.length,1);
  const plain=await load(para("Abstract")+para("Summary.")+para("Keywords: alpha, beta")+para("Actual body text."));assert.equal(plain.p.document.title,"");
  const noAbstract=await load(para("Introduction")+para("A long enough body paragraph"));assert.equal(noAbstract.p.document.title,"");
});
test("repeated title is preserved once as metadata, disclosures remain in the body",async()=>{
  const title="A repeated manuscript title";
  const {p}=await load(para(title)+para("Ethics statement: This study was approved.")+para(title)+para("Abstract")+para("Summary.")+para("Introduction"));
  assert.equal(p.document.title,title);assert.equal(p.document.importedMetadata?.filter(m=>m.field==="title").flatMap(m=>m.blocks).length,2);
  assert.equal(inlineText((p.document.blocks[0] as {content:[]}).content),"Ethics statement: This study was approved.");
});
