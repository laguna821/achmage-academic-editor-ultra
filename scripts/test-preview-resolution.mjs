import {connectDemo} from './demo-connect.mjs';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const {browser,page}=await connectDemo(),errors=[];page.on('pageerror',e=>errors.push(e.stack));const sizes=[];
try{
 await page.evaluate(async()=>{const v=app.workspace.getLeavesOfType('aaeu-journal')[0].view;app.workspace.revealLeaf(v.leaf);await v.compose();});
 for(let i=0;i<4;i++){
  await page.waitForFunction(()=>{const h=document.querySelector('.aaeu-journal-page'),c=h?.querySelector('canvas');if(!c)return false;const expected=Math.min(3*595.276,Math.max(595.276,h.getBoundingClientRect().width*devicePixelRatio));return !!h.dataset.renderWidth&&Math.abs(c.width-expected)<3&&h.dataset.renderWidth===String(c.width);});
  sizes.push(await page.evaluate(()=>{const h=document.querySelector('.aaeu-journal-page'),c=h.querySelector('canvas');return{cssWidth:h.getBoundingClientRect().width,pixels:c.width,dpr:devicePixelRatio};}));
  await page.getByRole('button',{name:/^(Expand proof|Show editing panels|지면 크게 보기|편집 패널 보기)$/}).click();
 }
 assert.ok(Math.abs(sizes[0].pixels-sizes[1].pixels)>100,'Expanded and narrow proofs must request different pixel sizes');
 const results=await page.evaluate(async()=>{const v=app.workspace.getLeavesOfType('aaeu-journal')[0].view;return(await Promise.allSettled([v.preview.show(v.result),v.preview.show(v.result)])).map(r=>r.status);});assert.deepEqual(results,['fulfilled','fulfilled']);
 await page.waitForFunction(()=>!!document.querySelector('.aaeu-journal-page')?.dataset.renderWidth);
 assert.deepEqual(errors,[]);await fs.writeFile('test-artifacts/preview-resolution.json',JSON.stringify({sizes,results,errors},null,2));console.log('PASS: responsive proof resolution, repeated resize, cancelled stale previews.');
}finally{await browser.close();}
