import {connectDemo} from './demo-connect.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
const {browser,page}=await connectDemo(),out=path.resolve('test-artifacts/launch-presets');await fs.mkdir(out,{recursive:true});
const errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
  for(const language of ['en','ko']){
    if(await page.locator('.modal').count())await page.locator('.modal').getByRole('button',{name:'Close',exact:true}).click();
    await page.evaluate(async language=>{const v=app.workspace.getLeavesOfType('aaeu-journal')[0].view;await v.openSampleManuscript(language,true);await v.compose();app.workspace.revealLeaf(v.leaf);},language);
    const before=await page.evaluate(()=>JSON.stringify(app.workspace.getLeavesOfType('aaeu-journal')[0].view.project.document));
    for(const brand of ['achmage','command-space']){
      if(brand!=='achmage'){
        await page.getByRole('button',{name:'Journal template',exact:true}).click();
        await page.getByRole('combobox',{name:'Saved templates',exact:true}).selectOption('builtin:'+brand);
        await page.locator('.modal').getByRole('button',{name:'5. Preview & save',exact:true}).click();
        await page.locator('.modal').getByRole('button',{name:'Preview this manuscript',exact:true}).click();
        await page.locator('.modal').getByRole('button',{name:'Save and apply template',exact:true}).waitFor();
        await page.waitForFunction(()=>[...document.querySelectorAll('.modal button')].some(b=>b.textContent==='Save and apply template'&&!b.disabled),null,{timeout:180000});
        await page.locator('.modal').getByRole('button',{name:'Export template',exact:true}).click({trial:true});
        await page.evaluate(()=>{const v=app.workspace.getLeavesOfType('aaeu-journal')[0].view;window.__saved=[];window.__originalSave=v.gateway.saveFile;v.gateway.saveFile=async(bytes,fileName)=>{window.__saved.push({bytes:Array.from(bytes),fileName});return {cancelled:false,fileName,method:'vault'};};});
        await page.locator('.modal').getByRole('button',{name:'Export template',exact:true}).click();
        await page.waitForFunction(()=>window.__saved.length>0);
        const template=await page.evaluate(()=>window.__saved.at(-1));await fs.writeFile(path.join(out,brand+'-template.zip'),Buffer.from(template.bytes));
        await page.locator('.modal').getByRole('button',{name:'Save and apply template',exact:true}).click();
        await page.waitForFunction(()=>!app.workspace.getLeavesOfType('aaeu-journal')[0].view.controller,null,{timeout:180000});
      }
      await page.evaluate(async()=>{const v=app.workspace.getLeavesOfType('aaeu-journal')[0].view;await v.compose();window.__saved=[];window.__originalSave??=v.gateway.saveFile;v.gateway.saveFile=async(bytes,fileName)=>{window.__saved.push({bytes:Array.from(bytes),fileName});return {cancelled:false,fileName,method:'vault'};};await v.exportPdf(false);});
      const data=await page.evaluate(()=>{const v=app.workspace.getLeavesOfType('aaeu-journal')[0].view;return {pdf:window.__saved.at(-1),document:JSON.stringify(v.project.document),pages:v.result.pageCount,issues:v.result.issues.map(i=>({severity:i.severity,code:i.code})),preset:v.project.preset.template};});
      assert.equal(data.document,before,'Template switching must preserve the complete article');assert.equal(data.preset.id,'builtin:'+brand);
      await fs.writeFile(path.join(out,`${brand}-${language}.pdf`),Buffer.from(data.pdf.bytes));delete data.pdf;delete data.document;
      const expand=page.getByRole('button',{name:'Expand proof',exact:true});if(await expand.count())await expand.click();
      await page.screenshot({path:path.join(out,`${brand}-${language}.png`)});
      await page.getByRole('button',{name:'Export AF',exact:true}).click();await page.locator('.modal').getByRole('button',{name:'Export',exact:true}).click();
      await page.waitForFunction(()=>!app.workspace.getLeavesOfType('aaeu-journal')[0].view.afController,null,{timeout:180000});
      const af=await page.evaluate(()=>window.__saved.at(-1));assert.ok(af.fileName.endsWith('.zip'));const zip=await JSZip.loadAsync(Buffer.from(af.bytes));
      await fs.writeFile(path.join(out,`${brand}-${language}.af.zip`),Buffer.from(af.bytes));await fs.writeFile(path.join(out,`${brand}-${language}.af`),await zip.file('document.af').async('uint8array'));
      data.af=JSON.parse(await zip.file('export-report.json').async('string'));
      await fs.writeFile(path.join(out,`${brand}-${language}.json`),JSON.stringify(data,null,2));
      await page.evaluate(()=>{app.workspace.getLeavesOfType('aaeu-journal')[0].view.gateway.saveFile=window.__originalSave;delete window.__originalSave;});
      console.log('PASS',brand,language,data.pages,'pages; content unchanged');
    }
  }
  await fs.writeFile(path.join(out,'runtime-errors.json'),JSON.stringify(errors,null,2));assert.deepEqual(errors,[]);
}finally{await browser.close();}
