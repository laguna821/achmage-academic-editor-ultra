import {browserResourceCodec,installResourceCodec} from './journal-browser-codec.mjs';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import http from 'node:http';
import assert from 'node:assert/strict';

await fs.mkdir('test-artifacts/journal',{recursive:true});
const bundle=await build({stdin:{contents:'import {JournalEngine} from "./src/journal/engine.ts";import {createJournalProject} from "./src/journal/project";import {preamble} from "./src/journal/typst";window.JournalEngine=JournalEngine;window.testPreamble=()=>{const p=createJournalProject();p.preset.body.font="Liberation Sans";return preamble(p);};',resolveDir:process.cwd(),loader:'ts'},plugins:[browserResourceCodec],bundle:true,write:false,platform:'browser',format:'iife',target:'es2022'});
const source=`#set document(date:none)
#set page(width:182mm,height:257mm,margin:20mm)
#set text(font:"Liberation Sans",size:10pt)
#let mark(id, edge) = context metadata((id:id,edge:edge,page:here().page(),x:here().position().x/1pt,y:here().position().y/1pt))
#mark("p1","start")
#block(width:69mm)[This paragraph demonstrates deterministic local composition. #lorem(80)]
#mark("p1","end")
#context metadata((measurement:measure(block(width:69mm)[A measured paragraph. #lorem(80)]).height/1pt))
#bibliography("works.yml",style:"apa",full:true)
`;
const server=http.createServer(async(req,res)=>{
  try {
    if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].contents);}
    else if(req.url==='/font.ttf'){res.end(await fs.readFile('node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf'));}
    else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><script src="/bundle.js"></script>');}
  }catch(error){res.statusCode=500;res.end(String(error));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const address=server.address();
const browser=await chromium.launch(process.env.HANMARK_TEST_BROWSER==='edge'?{channel:'msedge'}:{headless:true});
try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const external=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:')&&!r.url().startsWith('blob:'))external.push(r.url());});
  await installResourceCodec(page);
    await page.goto(`http://127.0.0.1:${address.port}`);
  const result=await page.evaluate(async source=>{
    const start=performance.now();const engine=new window.JournalEngine();
    const font=new Uint8Array(await (await fetch('/font.ttf')).arrayBuffer());
    await engine.initialize([font]);
    const files=[{path:'/works.yml',bytes:new TextEncoder().encode('kim:\n  type: Article\n  title: A test study\n  author: Kim, Min\n  date: 2025\n  parent:\n    type: Periodical\n    title: Example Journal\n    volume: 12\n    issue: 3\n')}];
    const first=await engine.compile(source,files);
    const second=await engine.compile(source,files);
    const identical=first.pdf.length===second.pdf.length&&first.pdf.every((v,i)=>v===second.pdf[i]);
    const statsAfterRepeat=engine.stats?{...engine.stats}:null;
    if(statsAfterRepeat&&statsAfterRepeat.syncCalls!==1)throw Error('Unchanged file was resent');
    const readSource='#context metadata((text:read("/value.txt")))';
    const file=text=>[{path:'/value.txt',bytes:new TextEncoder().encode(text)}];
    const changed=await engine.compile(readSource,file('one'),false);
    const updated=await engine.compile(readSource,file('two'),false);
    const deleted=await engine.compile(readSource,[],false).then(()=>false,()=>true);
    await engine.restart();
    const restarted=await engine.compile(source,files);
    if(first.pdf.length!==restarted.pdf.length||!first.pdf.every((v,i)=>v===restarted.pdf[i]))throw Error('Restart changed PDF');
    if(!deleted||changed.metadata[0].text!=='one'||updated.metadata[0].text!=='two')throw Error('Worker shadow files stale');
    const concurrent=await Promise.all([engine.compile(readSource,file('three'),false),engine.compile(readSource,file('four'),false)]);
    if(concurrent[0].metadata[0].text!=='three'||concurrent[1].metadata[0].text!=='four')throw Error('Concurrent file sync crossed jobs');
    const meta=first.metadata;const loadedFonts=engine.loadedFonts;
    const probe=await engine.compile(window.testPreamble()+'\n#context metadata((lineHeightProbe:measure(block(width:100pt)[First#linebreak()Second#linebreak()Third]).height/1pt))',[],false);
    const lineHeightProbe=probe.metadata.find(v=>typeof v.lineHeightProbe==='number')?.lineHeightProbe;
    const cancelled=engine.compile(source+'\n#lorem(100000)',files).then(()=>false,()=>true);engine.cancel();
    return {pdf:Array.from(first.pdf),meta,loadedFonts,identical,statsAfterRepeat,lineHeightProbe,cancelled:await cancelled,elapsedMs:performance.now()-start};
  },source);
  assert.equal(errors.length,0,errors.join('\n'));assert.deepEqual(external,[]);
  assert.equal(result.cancelled,true);assert.equal(result.identical,true);
  assert.ok(Math.abs(result.lineHeightProbe-34)<.01,'10pt text at 12pt baseline spacing must occupy 34pt for three lines');
  assert.ok(result.pdf.length>1000);assert.ok(result.meta.length>=3);
  await fs.writeFile('test-artifacts/journal/browser-engine.pdf',new Uint8Array(result.pdf));
  delete result.pdf;result.errors=errors;result.external=external;
  await fs.writeFile('test-artifacts/journal/engine-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
