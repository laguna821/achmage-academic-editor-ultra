import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import JSZip from 'jszip';
import assert from 'node:assert/strict';
const root=path.resolve(process.env.AAEU_DEMO_OUTPUT??'test-artifacts/launch-011'),vault=path.join(root,'vault'),profile=path.join(root,'profile'),port=19386;
await fs.mkdir(path.join(vault,'.obsidian/plugins/achmage-academic-editor-ultra'),{recursive:true});await fs.mkdir(profile,{recursive:true});
for(const file of ['main.js','styles.css','manifest.json'])await fs.copyFile(file,path.join(vault,'.obsidian/plugins/achmage-academic-editor-ultra',file));
await fs.writeFile(path.join(vault,'.obsidian/community-plugins.json'),'["achmage-academic-editor-ultra"]');
await fs.writeFile(path.join(vault,'.obsidian/core-plugins.json'),'[]');
await fs.writeFile(path.join(vault,'.obsidian/appearance.json'),JSON.stringify({theme:'moonstone',baseFontSize:18,interfaceFontFamily:'Arial'}));
await fs.writeFile(path.join(profile,'obsidian.json'),JSON.stringify({vaults:{aaeu011demovault:{path:vault,ts:Date.now(),open:true}},frame:'native'}));
const child=spawn(process.env.HANMARK_OBSIDIAN_EXE??'C:/Program Files/Obsidian/Obsidian.exe',[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{windowsHide:true,stdio:'ignore'});
let browser,page;const errors=[];
try{
  for(let i=0;i<60;i++){try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);break;}catch{await new Promise(r=>setTimeout(r,500));}}
  for(let i=0;i<60;i++){page=browser?.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('app://obsidian.md'));if(page)break;await new Promise(r=>setTimeout(r,500));}
  if(!page)throw Error('Obsidian did not open');
  await page.waitForFunction(()=>window.app?.workspace?.layoutReady);
  await page.evaluate(()=>localStorage.setItem('language','en'));await page.reload();await page.waitForFunction(()=>window.app?.workspace?.layoutReady);
  const trust=page.getByRole('button',{name:'Trust author and enable plugins',exact:true});if(await trust.isVisible())await trust.click();
  await page.waitForFunction(()=>!!app.plugins.plugins['achmage-academic-editor-ultra']);
  page.on('pageerror',e=>{errors.push(e.stack??e.message);console.error('RUNTIME',e.stack??e.message);});
  await page.evaluate(async()=>{await app.plugins.loadManifests();await app.plugins.enablePlugin('achmage-academic-editor-ultra');app.setting.close();app.commands.executeCommandById('achmage-academic-editor-ultra:open-journal-editor');});
  await page.getByRole('heading',{name:'Your next manuscript starts here',exact:true}).waitFor();
  console.log('Isolated Obsidian process: '+child.pid);
  await page.screenshot({path:path.join(root,'start-en.png')});
  const records=[];
  for(const language of ['en','ko']){
    await page.evaluate(async language=>{const view=app.workspace.getLeavesOfType('aaeu-journal')[0].view;await view.openSampleManuscript(language,true);await view.compose();window.__saved=[];window.__saveGateway=view.gateway.saveFile;view.gateway.saveFile=async(bytes,fileName)=>{window.__saved.push({bytes:Array.from(bytes),fileName});return{cancelled:false,fileName,method:'vault'};};await view.exportPdf(false);},language);
    const record=await page.evaluate(()=>{const v=app.workspace.getLeavesOfType('aaeu-journal')[0].view;return{project:v.project,pages:v.result.pageCount,issues:v.result.issues,coverage:v.result.coverage,pdf:window.__saved.at(-1)};});
    assert.ok(record.pages>=2);assert.equal(record.project.document.blocks.filter(b=>b.kind==='figure').length,2);assert.equal(record.project.document.blocks.filter(b=>b.kind==='table').length,2);
    await fs.writeFile(path.join(root,`guide-${language}.pdf`),Buffer.from(record.pdf.bytes));delete record.pdf;
    await page.evaluate(()=>app.workspace.revealLeaf(app.workspace.getLeavesOfType('aaeu-journal')[0]));
    await page.screenshot({path:path.join(root,`workspace-${language}.png`)});
    await page.getByRole('button',{name:'Export AF',exact:true}).click();await page.locator('.modal').getByRole('button',{name:'Export',exact:true}).click();
    await page.waitForFunction(()=>!app.workspace.getLeavesOfType('aaeu-journal')[0].view.afController,null,{timeout:180000});
    const af=await page.evaluate(()=>window.__saved.at(-1));assert.ok(af.fileName.endsWith('.zip'),'AF package was saved');const bytes=Buffer.from(af.bytes),zip=await JSZip.loadAsync(bytes);
    await fs.writeFile(path.join(root,`guide-${language}.af.zip`),bytes);await fs.writeFile(path.join(root,`guide-${language}.af`),await zip.file('document.af').async('uint8array'));
    record.af=JSON.parse(await zip.file('export-report.json').async('string'));records.push({language,...record});
    await page.evaluate(()=>{const v=app.workspace.getLeavesOfType('aaeu-journal')[0].view;v.gateway.saveFile=window.__saveGateway;});
    console.log(JSON.stringify({language,pages:record.pages,issues:record.issues.map(x=>({severity:x.severity,code:x.code})),afPages:record.af.pages}));
  }
  await fs.writeFile(path.join(root,'verification.json'),JSON.stringify({records,errors},null,2));assert.deepEqual(errors,[]);
  console.log('PASS: welcome sample PDF/AF, both languages.');
  if(process.env.AAEU_KEEP_OPEN==='1'){console.log('Host kept open on 19386');await new Promise(()=>{});}
}catch(e){console.error(e);if(page){console.error(await page.evaluate(()=>document.body.innerText.slice(-7000)).catch(()=>''));await page.screenshot({path:path.join(root,'failure.png')}).catch(()=>{});}process.exitCode=1;}
finally{if(browser)try{await (await browser.newBrowserCDPSession()).send('Browser.close');}catch{}if(!child.killed)child.kill();}
