import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {chromium} from "playwright";
import assert from "node:assert/strict";
import JSZip from 'jszip';
import {createHash} from 'node:crypto';

// A separate Obsidian profile and vault. Never installs over the user's plugin.
const root=path.resolve(process.env.HANMARK_HOST_OUTPUT??`test-artifacts/aaeu/editor-host-${Date.now()}`),vault=path.join(root,"vault"),profile=path.join(root,"profile");
const plugin=path.join(vault,".obsidian/plugins/achmage-academic-editor-ultra");
await fs.mkdir(plugin,{recursive:true});await fs.mkdir(profile,{recursive:true});
for(const file of ["main.js","manifest.json","styles.css"])await fs.copyFile(file,path.join(plugin,file));
await fs.writeFile(path.join(vault,".obsidian/community-plugins.json"),'["achmage-academic-editor-ultra"]');
await fs.writeFile(path.join(vault,".obsidian/core-plugins.json"),"[]");
await fs.writeFile(path.join(profile,"obsidian.json"),JSON.stringify({vaults:{abcdef0123456789:{path:vault,ts:Date.now(),open:true}},frame:"native"}));
const executable=process.env.HANMARK_OBSIDIAN_EXE||"C:/Program Files/Obsidian/Obsidian.exe";
const port=19389;
const child=spawn(executable,[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,"--remote-debugging-address=127.0.0.1"],{windowsHide:true,stdio:"ignore"});
let browser, page;
try {
  for(let i=0;i<60;i++){try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);break;}catch{await new Promise(r=>setTimeout(r,500));}}
  if(!browser)throw new Error("Isolated Obsidian did not open its testing endpoint");
  for(let i=0;i<60;i++){page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith("app://obsidian.md"));if(page)break;await new Promise(r=>setTimeout(r,500));}
  if(!page)throw new Error("Obsidian vault window unavailable");
  await page.evaluate(lang=>localStorage.setItem('language',lang),process.env.AAEU_LOCALE||'en');await page.reload();
  await page.bringToFront();
  await page.evaluate(()=>window.focus());
  const errors=[];page.on("pageerror",e=>{errors.push(e.message);console.error('PAGE ERROR',e.stack);});
  if(process.env.HANMARK_CDP_DIAGNOSTIC){const debug=await page.context().newCDPSession(page);await debug.send('Runtime.enable');debug.on('Runtime.exceptionThrown',e=>console.error('RUNTIME ERROR',JSON.stringify(e)));}
  await page.evaluate(()=>{addEventListener('unhandledrejection',e=>console.error('REJECT DETAIL',String(e.reason),e.reason?.stack,document.querySelector('.aaeu-journal-status')?.textContent));addEventListener('error',e=>console.error('ERROR DETAIL',e.message,e.filename,e.lineno,e.colno,e.error?.stack,document.querySelector('.aaeu-journal-status')?.textContent));});
  await page.evaluate(()=>{const Original=window.Worker;window.Worker=class extends Original{constructor(...args){super(...args);this.addEventListener('error',e=>console.error('WORKER DETAIL',e.message,e.filename,e.lineno,e.error?.stack,document.querySelector('.aaeu-journal-status')?.textContent));}};});
  page.on("console",message=>{if(message.type()==="error")console.error("Obsidian:",message.text());});
  await page.waitForFunction(()=>window.app?.workspace?.layoutReady,{timeout:30000});
  const info=await page.evaluate(()=>({vault:app.vault.adapter.getBasePath(),manifest:app.plugins.manifests['achmage-academic-editor-ultra'],enabled:[...app.plugins.enabledPlugins],loaded:Object.keys(app.plugins.plugins)}));
  assert.equal(path.resolve(info.vault),vault);
  console.log(JSON.stringify(info));
  const trust=page.getByRole("button",{name:/작성자를 신뢰하고 플러그인 사용하기|Trust author and enable plugins|作成者を信頼しプラグインを有効化/});
  if(await trust.isVisible())await trust.click();
  await page.waitForFunction(()=>!!app.plugins.plugins['achmage-academic-editor-ultra']?.manifest,null,{timeout:15000});
  await page.screenshot({path:path.join(root,"startup.png"),fullPage:true});
  await page.evaluate(()=>app.setting.close());
  await page.bringToFront();
  const status=await page.evaluate(async()=>{
    await app.plugins.loadManifests();
    await app.plugins.enablePlugin("achmage-academic-editor-ultra");
    const plugin=app.plugins.plugins['achmage-academic-editor-ultra'];
    if(!plugin)throw new Error("HanMark did not load");
    // Keep an empty host tab group, as Obsidian does when no note is open.
    const empty=app.workspace.getLeaf(false);await empty.setViewState({type:'empty',active:true});
    for(const leaf of app.workspace.getLeavesOfType('aaeu-journal'))leaf.detach();
    for(const leaf of app.workspace.getLeavesOfType('markdown'))await leaf.setViewState({type:'empty'});
    app.commands.executeCommandById("achmage-academic-editor-ultra:open-journal-editor");
    return {version:plugin.manifest.version,vault:app.vault.adapter.getBasePath()};
  });
  assert.equal(path.resolve(status.vault),vault);

  await page.setViewportSize({width:1440,height:960});
  await page.evaluate(async()=>{app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();window.__view=app.workspace.getLeavesOfType('aaeu-journal')[0].view;await __view.openSampleManuscript(localStorage.getItem('language')==='ko'?'ko':'en');await __view.compose();});
  await page.waitForTimeout(400);
  const language=process.env.AAEU_LOCALE||'en',out=path.resolve('test-artifacts/release-100-media');await fs.mkdir(out,{recursive:true});
  const korean=await page.locator('.aaeu-journal-toolbar').innerText().catch(()=>page.locator('.aaeu-journal').innerText());
  await fs.writeFile(path.join(out,language+'-ui.txt'),korean);
  if(language!=='ko')assert.ok(!/[가-힣]/.test(korean),korean);
  for(const [id,name]of [['builtin:achmage','achmage'],['builtin:command-space','command-space']]){
    await page.evaluate(id=>__view.applySavedTemplate(id),id);await page.waitForTimeout(300);
    await fs.writeFile(path.join(out,`${name}-${language}.pdf`),Buffer.from(await page.evaluate(()=>Array.from(__view.result.pdf))));
    await page.screenshot({path:path.join(out,`${name}-${language}-editor.png`)});
  }
  await page.evaluate(()=>__view.manuscript.focusProperty('aaeu-corresponding-email'));await page.waitForTimeout(200);
  await page.screenshot({path:path.join(out,`${language}-guided.png`)});
  const translated=await page.locator('.aaeu-journal').innerText();
  await fs.writeFile(path.join(out,language+'-guided.txt'),translated);
  await page.evaluate(()=>{const box=__view.result.boxes.find(b=>b.kind==='figure');__view.preview.selectObject(box);__view.preview.focusNode(box.nodeId,__view.result.boxes);});await page.waitForTimeout(300);
  await page.screenshot({path:path.join(out,`${language}-placement.png`)});
  if(language==='en'){
    await page.evaluate(()=>{window.__saved=[];__view.gateway.saveFile=async(bytes,fileName)=>{__saved.push({bytes:Array.from(bytes),fileName});return {cancelled:false,fileName,method:'vault'};};});
    const task=page.evaluate(()=>__view.exportAf());await page.locator('.modal').getByRole('button',{name:'Export',exact:true}).click();await task;
    const saved=await page.evaluate(()=>__saved.at(-1)),zip=await JSZip.loadAsync(Buffer.from(saved.bytes));await fs.writeFile(path.join(out,'public-sample.af'),await zip.file('document.af').async('uint8array'));await fs.writeFile(path.join(out,'public-sample.af.zip'),Buffer.from(saved.bytes));
  }
  await fs.writeFile(path.join(out,language+'-validation.json'),JSON.stringify({version:status.version,locale:language,errors},null,2));console.log(JSON.stringify({root,out,language,errors}));
}catch(error){console.error(error);if(page)await page.screenshot({path:path.join(root,'failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{if(browser){try{const cdp=await browser.newBrowserCDPSession();await Promise.race([cdp.send('Browser.close'),new Promise(r=>setTimeout(r,1000))]);}catch{}}if(!child.killed)child.kill();}
