import {createServer} from 'node:http';
import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {chromium} from "playwright";
import assert from "node:assert/strict";

// A separate Obsidian profile and vault. Never installs over the user's plugin.
const root=path.resolve(process.env.HANMARK_HOST_OUTPUT??`test-artifacts/aaeu/eagle-host-${Date.now()}`),vault=path.join(root,"vault"),profile=path.join(root,"profile");
const plugin=path.join(vault,".obsidian/plugins/achmage-academic-editor-ultra");
await fs.mkdir(plugin,{recursive:true});await fs.mkdir(profile,{recursive:true});
for(const file of ["main.js","manifest.json","styles.css"])await fs.copyFile(file,path.join(plugin,file));
await fs.writeFile(path.join(vault,".obsidian/community-plugins.json"),'["achmage-academic-editor-ultra"]');
await fs.writeFile(path.join(vault,".obsidian/core-plugins.json"),"[]");
await fs.writeFile(path.join(profile,"obsidian.json"),JSON.stringify({vaults:{abcdef0123456789:{path:vault,ts:Date.now(),open:true}},frame:"native"}));
const executable=process.env.HANMARK_OBSIDIAN_EXE||"C:/Program Files/Obsidian/Obsidian.exe";
const port=19390;
const child=spawn(executable,[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,"--remote-debugging-address=127.0.0.1"],{windowsHide:true,stdio:"ignore"});
// Generated solid 120×80 test image, independent of private manuscripts/assets.
const png=process.env.AAEU_TEST_IMAGE?await fs.readFile(process.env.AAEU_TEST_IMAGE):Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAxklEQVR4nO3QQREAMAjAMPxrnBhcZA8aBb3OCzG/A65oNNJopNFIo5FGI41GGo00Gmk00mik0UijkUYjjUYajTQaaTTSaKTRSKORRiONRhqNNBppNNJopNFIo5FGI41GGo00Gmk00mik0UijkUYjjUYajTQaaTTSaKTRSKORRiONRhqNNBppNNJopNFIo5FGI41GGo00Gmk00mik0UijkUYjjUYajTQaaTTSaKTRSKORRiONRhqNNBppNNJopNFIo5FGI41GFruas6EvgyJTAAAAAElFTkSuQmCC','base64');
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'image/png'});res.end(png);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const imageUrl=`http://127.0.0.1:${server.address().port}/image.png`;
if(process.env.CMDS_EAGLE_PLUGIN_DIR){const target=path.join(vault,'.obsidian/plugins/cmds-eagle');await fs.mkdir(target,{recursive:true});for(const file of ['main.js','manifest.json'])await fs.copyFile(path.join(process.env.CMDS_EAGLE_PLUGIN_DIR,file),path.join(target,file));}
let browser, page;
try {
  for(let i=0;i<60;i++){try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);break;}catch{await new Promise(r=>setTimeout(r,500));}}
  if(!browser)throw new Error("Isolated Obsidian did not open its testing endpoint");
  for(let i=0;i<60;i++){page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith("app://obsidian.md"));if(page)break;await new Promise(r=>setTimeout(r,500));}
  if(!page)throw new Error("Obsidian vault window unavailable");
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
  const trust=page.getByRole("button",{name:"작성자를 신뢰하고 플러그인 사용하기",exact:true});
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

  await page.evaluate(async()=>{const note=await app.vault.create('eagle-test.md','---\naaeu-schema: 1\naaeu-template: builtin:general\naaeu-title: Remote image editor\n---\n\n## Introduction\n\nA local and remote image test.\n');window.__view=app.workspace.getLeavesOfType('aaeu-journal')[0].view;await __view.importMarkdownNote(note,await app.vault.read(note));});
  await page.locator('.aaeu-manuscript-body .cm-content').waitFor();
  if(process.env.CMDS_EAGLE_PLUGIN_DIR){
    await page.evaluate(async({imageUrl,png})=>{
      await app.plugins.loadManifests();await app.plugins.enablePlugin('cmds-eagle');const eagle=app.plugins.plugins['cmds-eagle'];if(!eagle)throw Error('CMDS Eagle fixture did not load');
      eagle.settings.imagePasteBehavior='cloud';window.__uploads=0;eagle.getActiveCloudProvider=()=>({upload:async()=>{__uploads++;return {success:true,publicUrl:imageUrl};}});
      // Exercise the actual plugin handler, substituting only its external uploader.
      window.__clipboardBackup=require('electron').clipboard.availableFormats().map(type=>[type,require('electron').clipboard.readBuffer(type)]);
      const image=require('electron').nativeImage.createFromBuffer(Buffer.from(png));if(image.isEmpty())throw Error('Test image invalid');require('electron').clipboard.writeImage(image);
    },{imageUrl,png:Array.from(png)});
    await page.locator('.aaeu-manuscript-body .cm-content').click();await page.keyboard.press('Control+End');await page.keyboard.press('Enter');await page.keyboard.press('Control+V');
    await page.waitForFunction(imageUrl=>__view.sourceDraft.includes(imageUrl),imageUrl);
    assert.equal(await page.evaluate(()=>__uploads),1);
  } else await page.evaluate(imageUrl=>__view.changeSource(__view.sourceDraft+`\n\n![Remote](${imageUrl})\n`),imageUrl);
  await page.evaluate(async()=>{await __view.flushSourceDraft();await __view.compose();});
  const before=await page.evaluate(()=>({figure:__view.project.document.blocks.find(n=>n.kind==='figure')?.id,deps:__view.project.markdown.dependencies}));assert.ok(before.figure);assert.equal(before.deps[0].kind,'remote');
  const box=page.locator(`.aaeu-journal-box[data-node-id="${before.figure}"]`).first();await box.scrollIntoViewIfNeeded();const rect=await box.boundingBox();assert.ok(rect);
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+18,rect.y+rect.height/2+12,{steps:4});await page.mouse.up();
  const override=await page.evaluate(id=>__view.project.overrides.find(o=>o.id===id),before.figure);assert.ok(override?.locked,'Remote figures must be movable');
  await page.evaluate(async()=>{await __view.changeFields({'aaeu-running-title':'Unrelated metadata'});await __view.compose();});
  assert.equal(await page.evaluate(id=>__view.project.overrides.some(o=>o.id===id),before.figure),true,'Source refresh retains figure placement');
  const result={status:'passed',plugin:process.env.CMDS_EAGLE_PLUGIN_DIR?'CMDS Eagle 1.8.4 actual paste handler, mock upload endpoint':'remote URL only',uploads:await page.evaluate(()=>window.__uploads??0),remoteFigureMovable:true,overrideRetained:true,errors};
  await page.screenshot({path:path.join(root,'remote-image.png'),fullPage:true});await fs.writeFile(path.join(root,'eagle-host-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({root,...result}));
}catch(error){
  console.error(error);
  if(page){console.error(await page.evaluate(()=>({status:document.querySelector('.aaeu-journal-status')?.textContent,modals:[...document.querySelectorAll('.modal')].map(e=>e.textContent)})).catch(()=>null));await page.screenshot({path:path.join(root,'failure.png'),fullPage:true}).catch(()=>{});}
  process.exitCode=1;
}finally{
  if(page)await page.evaluate(()=>{if(window.__clipboardBackup){const c=require('electron').clipboard;c.clear();for(const [type,bytes]of __clipboardBackup)c.writeBuffer(type,bytes);}}).catch(()=>{});
  server.close();
  if(browser){try{const cdp=await browser.newBrowserCDPSession();await Promise.race([cdp.send('Browser.close'),new Promise(r=>setTimeout(r,1000))]);}catch{}}
  if(!child.killed)child.kill();
}

