import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {chromium} from "playwright";
import assert from "node:assert/strict";
import JSZip from 'jszip';
import {createHash} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';

// A separate Obsidian profile and vault. Never installs over the user's plugin.
const root=path.resolve(process.env.HANMARK_HOST_OUTPUT??"test-artifacts/aaeu/corpus-host"),vault=path.join(root,"vault"),profile=path.join(root,"profile");
const plugin=path.join(vault,".obsidian/plugins/achmage-academic-editor-ultra");
await fs.mkdir(plugin,{recursive:true});await fs.mkdir(profile,{recursive:true});
for(const file of ["main.js","manifest.json","styles.css"])await fs.copyFile(file,path.join(plugin,file));
await fs.writeFile(path.join(vault,".obsidian/community-plugins.json"),'["achmage-academic-editor-ultra"]');
await fs.writeFile(path.join(vault,".obsidian/core-plugins.json"),"[]");
await fs.writeFile(path.join(profile,"obsidian.json"),JSON.stringify({vaults:{abcdef0123456789:{path:vault,ts:Date.now(),open:true}},frame:"native"}));
const executable=process.env.HANMARK_OBSIDIAN_EXE||"C:/Program Files/Obsidian/Obsidian.exe";
const port=19386;
const child=spawn(executable,[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,"--remote-debugging-address=127.0.0.1"],{windowsHide:true,stdio:"ignore"});
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
  await page.getByRole("button",{name:"새 Word 편집본",exact:true}).waitFor();
  await page.getByRole('heading',{name:'저널 편집 시작',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'현재 Markdown 노트로 시작',exact:true}).isDisabled(),true);
  const input=process.env.AAEU_CORPUS_MANIFEST;if(!input)throw Error('Set AAEU_CORPUS_MANIFEST to a private fixture list');
  const cases=JSON.parse(await fs.readFile(input,'utf8')),results=[];
  for(const [index,item]of cases.entries()){
    const source=await fs.readFile(item.path,'utf8'),sha256=createHash('sha256').update(source).digest('hex');
    const result=await page.evaluate(async({source,index,name})=>{
      const v=app.workspace.getLeavesOfType('aaeu-journal')[0].view,file=await app.vault.create('corpus-'+index+'.md',source);
      const started=performance.now();await v.importMarkdownNote(file,source);await v.compose();const firstMs=performance.now()-started;
      const hashes=v.project.markdown.dependencies.map(a=>a.sha256),first=v.result.pdf.slice();await v.compose();
      return {name,firstMs,pages:v.result.pageCount,assets:v.project.markdown.dependencies.length,imageHashes:hashes,headings:v.project.document.blocks.filter(n=>n.kind==='heading').length,tables:v.project.document.blocks.filter(n=>n.kind==='table').length,figures:v.project.document.blocks.filter(n=>n.kind==='figure').length,issues:[...v.project.issues,...v.result.issues].map(i=>({code:i.code,message:i.message,severity:i.severity})),coverage:v.result.coverage,repeatIdentical:first.length===v.result.pdf.length&&first.every((b,i)=>b===v.result.pdf[i]),pdf:Array.from(v.result.pdf)};
    },{source,index,name:item.name});
    await fs.writeFile(path.join(root,item.name+'.pdf'),Buffer.from(result.pdf));delete result.pdf;
    assert.ok(result.repeatIdentical);assert.ok(result.coverage?.complete,'Incomplete coverage: '+item.name);assert.ok(!result.issues.some(i=>i.code==='markdown-image-missing'),'Missing image in '+item.name);
    assert.equal(createHash('sha256').update(await fs.readFile(item.path)).digest('hex'),sha256,'Original manuscript changed');
    result.sourceSha256=sha256;results.push(result);await fs.writeFile(path.join(root,'corpus-result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({name:result.name,pages:result.pages,assets:result.assets,firstMs:result.firstMs,errors:result.issues.filter(i=>i.severity==='error').map(i=>i.code)}));
    await page.screenshot({path:path.join(root,item.name+'.png'),fullPage:true});
  }
  assert.deepEqual(errors,[]);

}catch(error){
  console.error(error);
  if(page){console.error(await page.evaluate(()=>({status:document.querySelector('.aaeu-journal-status')?.textContent,modals:[...document.querySelectorAll('.modal')].map(e=>e.textContent)})).catch(()=>null));await page.screenshot({path:path.join(root,'failure.png'),fullPage:true}).catch(()=>{});}
  process.exitCode=1;
}finally{
  if(browser){try{const cdp=await browser.newBrowserCDPSession();await Promise.race([cdp.send('Browser.close'),new Promise(r=>setTimeout(r,1000))]);}catch{}}
  if(!child.killed)child.kill();
}
