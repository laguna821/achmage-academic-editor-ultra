import {browserResourceCodec,installResourceCodec} from './journal-browser-codec.mjs';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import http from 'node:http';
import assert from 'node:assert/strict';
const bundle=await build({stdin:{contents:'import {CaptionOcr} from "./src/journal/ocr";window.CaptionOcr=CaptionOcr;',resolveDir:process.cwd(),loader:'ts'},plugins:[browserResourceCodec],bundle:true,write:false,platform:'browser',format:'iife',target:'es2022'});
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?bundle.outputFiles[0].contents:'<!doctype html><script src="/bundle.js"></script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch(process.env.HANMARK_TEST_BROWSER==='edge'?{channel:'msedge'}:{headless:true});
try{
  const page=await browser.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{if(route.request().url().startsWith('http://127.0.0.1:'))return route.continue();external.push(route.request().url());return route.abort();});
  await installResourceCodec(page);
    await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result=await page.evaluate(async()=>{
    const canvas=new OffscreenCanvas(1000,700),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1000,700);ctx.fillStyle='black';ctx.font='32px Arial';ctx.fillText('Figure 1. Measured values',80,60);ctx.fillRect(100,170,40,300);ctx.fillRect(220,260,40,210);ctx.fillRect(340,210,40,260);ctx.font='22px Arial';ctx.fillText('A          B          C',95,510);
    const bytes=new Uint8Array(await(await canvas.convertToBlob()).arrayBuffer()),asset={id:'sample',name:'sample.png',mime:'image/png',sha256:'fixture',path:'fixture',bytes:bytes.length};
    const ocr=new window.CaptionOcr(),first=await ocr.detect(asset,bytes),second=await ocr.detect(asset,bytes);ocr.cancel();
    const restarted=await ocr.detect(asset,bytes);ocr.cancel();
    const cancelled=new window.CaptionOcr(),job=cancelled.detect(asset,bytes).then(()=>false,()=>true);cancelled.cancel();
    ctx.fillStyle='white';ctx.fillRect(0,0,1000,120);const blank=new Uint8Array(await(await canvas.convertToBlob()).arrayBuffer());
    const negative=await ocr.detect({...asset,id:'negative'},blank);ocr.cancel();
    return {first,repeat:JSON.stringify(first)===JSON.stringify(second),restart:JSON.stringify(first)===JSON.stringify(restarted),cancelled:await job,negative};
  });
  await fs.mkdir('test-artifacts/journal',{recursive:true});await fs.writeFile(process.env.HANMARK_OCR_OUTPUT??'test-artifacts/journal/phase3-ocr.json',JSON.stringify({...result,errors,external},null,2));
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.ok(result.first.candidates.some(c=>/Figure 1/i.test(c.text)));assert.ok(result.first.candidates[0].crop);assert.ok(result.repeat&&result.restart&&result.cancelled);assert.equal(result.negative.candidates.length,0);console.log(JSON.stringify({...result,external},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
