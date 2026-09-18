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
  await page.bringToFront();
  await page.evaluate(()=>window.focus());
  let phase="startup";const errors=[];page.on("pageerror",e=>{errors.push(String(e));console.error('PAGE ERROR',phase,String(e),e.stack);});
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
  const image='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="220" viewBox="0 0 600 220"><rect width="600" height="220" fill="#def3ec"/><path d="M20 180 L150 40 L280 140 L430 30 L580 110" fill="none" stroke="#008763" stroke-width="5"/></svg>';
  const body=Array.from({length:24},(_,i)=>`Paragraph ${i+1}. A structured manuscript retains its original content while deterministic composition places it into balanced columns. The author can edit the Markdown source and regenerate the proof without retyping metadata or moving individual text boxes. Repeated output uses the same saved assets.`).join('\n\n');
  const manuscript='---\naaeu-schema: 1\naaeu-template: builtin:achmage\naaeu-title: Deterministic Markdown Composition\naaeu-running-title: Markdown composition\naaeu-running-authors: Kim\naaeu-year: "2026"\naaeu-volume: "10"\naaeu-issue: "1"\naaeu-first-page: 23\naaeu-publication-mode: issue\naaeu-received: "2026-01-02"\naaeu-revised: "2026-02-03"\naaeu-accepted: "2026-03-04"\naaeu-author-1-name: Min Kim\naaeu-author-1-affiliations: [1]\naaeu-author-1-email: kim@example.org\naaeu-author-1-corresponding: true\naaeu-affiliation-1-text: Example University\naaeu-abstract: |\n  An explicit abstract is placed beside submission and correspondence information.\n\n  This second paragraph must survive conversion.\naaeu-keywords: [Markdown, composition]\naaeu-header-even-text: "JOURNAL {year}"\naaeu-header-odd-text: "Kim: Markdown composition"\naaeu-folio-text: "{page}"\naaeu-data-text: "Data are available from the author."\naaeu-conflict-text: "The author declares no conflicts of interest."\naaeu-sidebar-1-label: Repository\naaeu-sidebar-1-text: "https://example.org/data"\n---\n\n## Introduction\n\n'+body+'\n\n## Results\n\n![Fallback](plot.svg)\n\nFigure 1. Explicit vector caption.\n\nTable 1. Counts\n\n| Group | Count |\n| --- | --- |\n| A | 12 |\n| B | 34 |\n\nNote. Counts are illustrative.\n\n## References\n\nZhang, Z. (2024). Second entry.\n\nAhn, C. (2023). First entry.\n';

  phase="import";assert.equal(status.version,'1.0.0');
  await page.evaluate(async({manuscript,image})=>{
    await app.vault.create('plot.svg',image);const file=await app.vault.create('paper.md',manuscript.replace('aaeu-schema: 1','# preserved comment\nother-plugin: {tag: keep}\naaeu-schema: 1'));
    const v=window.__view=app.workspace.getLeavesOfType('aaeu-journal')[0].view;await v.importMarkdownNote(file,await app.vault.read(file));await v.compose();
    window.__compositions=0;const original=v.composer.compose.bind(v.composer);v.composer.compose=(...args)=>{window.__compositions++;return original(...args);};
    window.__saved=[];v.gateway.saveFile=async(bytes,fileName)=>{window.__saved.push({bytes:Array.from(bytes),fileName});return {cancelled:false,fileName,method:'vault'};};
  },{manuscript,image});
  await page.locator('.aaeu-manuscript-body .cm-content').waitFor();

  phase="pointer select";const evidence={};
  const figure=await page.evaluate(()=>__view.result.boxes.find(b=>b.kind==='figure'));
  assert.ok(figure);const locator=page.locator(`.aaeu-journal-box[data-node-id="${figure.nodeId}"]`).first();
  await locator.scrollIntoViewIfNeeded();const r=await locator.boundingBox();const before=await page.locator('.aaeu-journal-preview').evaluate(e=>e.scrollTop);
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();
  assert.ok(Math.abs(await page.locator('.aaeu-journal-preview').evaluate(e=>e.scrollTop)-before)<1,'Selecting must not jump the proof');
  const panel=await page.locator('.aaeu-journal-preview').boundingBox();
  phase="edge scroll";await page.mouse.move(r.x+r.width/2,panel.y+panel.height-3,{steps:5});await page.waitForTimeout(650);
  const after=await page.locator('.aaeu-journal-preview').evaluate(e=>e.scrollTop);
  evidence.edgeScroll=after-before;assert.ok(after>before,'Dragging near the edge must scroll');
  phase='cancel';await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await page.locator('.aaeu-placement-ghost').count(),0);
  assert.equal(await page.evaluate(()=>__view.project.overrides.length),0);
  // Move across pages via the same snap model the pointer submits.
  phase='place';const placement=await page.evaluate(async()=>{
    const box=__view.result.boxes.find(b=>b.kind==='figure'),g=__view.result.placementPages[1],col=g.columns[1];
    const before=__compositions;
    await __view.applyOverride({id:box.nodeId,page:2,x:col.x,y:col.y,width:col.width,height:Math.min(180,col.height),locked:true,snapLane:'right'});
    const pin=__view.project.overrides.find(o=>o.id===box.nodeId),placed=__view.result.boxes.find(b=>b.nodeId===box.nodeId);
    return {pin,placed,compositions:__compositions-before};
  });assert.equal(placement.compositions,1);assert.equal(placement.placed.page,2);assert.equal(placement.placed.x,placement.pin.x);assert.equal(placement.placed.width,placement.pin.width);evidence.placement=placement;
  phase='undo redo';let count=await page.evaluate(()=>__compositions);await page.evaluate(()=>__view.undo());await page.waitForFunction(n=>__compositions>n&&!__view.busy&&!__view.compositionTask,count);assert.equal(await page.evaluate(()=>__view.project.overrides.length),0);
  count=await page.evaluate(()=>__compositions);await page.evaluate(()=>__view.redo());await page.waitForFunction(n=>__compositions>n&&!__view.busy&&!__view.compositionTask,count);assert.equal(await page.evaluate(()=>__view.project.overrides[0].snapLane),'right');
  await page.evaluate(()=>__view.preview.selectObject(__view.result.boxes.find(b=>b.kind==='figure')));
  count=await page.evaluate(()=>__compositions);await page.locator('.aaeu-placement-tools').getByRole('button',{name:'전체 폭',exact:true}).click();await page.waitForFunction(n=>__compositions>n&&!__view.busy&&!__view.compositionTask,count);
  assert.equal(await page.evaluate(()=>__view.project.overrides[0].snapLane),'full');
  evidence.fullWidth=await page.evaluate(()=>__view.result.boxes.find(b=>b.kind==='figure').width);
  await page.screenshot({path:path.join(root,'placement.png'),fullPage:true});
  // The private profile is supplied externally; it never enters a public build or fixture.
  if(process.env.AAEU_PRIVATE_PRESET){
    const bytes=Array.from(await fs.readFile(process.env.AAEU_PRIVATE_PRESET));
    evidence.privateTemplate=await page.evaluate(async bytes=>{const lib=__view.library(),t=await lib.importPackage(new Uint8Array(bytes));await __view.applySavedTemplate(t.id);return {id:t.id,assets:t.assets};},bytes);
    const task=page.evaluate(()=>__view.exportAf());await page.locator('.modal').getByRole('button',{name:'내보내기',exact:true}).click();await task;
    const saved=await page.evaluate(()=>__saved.at(-1)),zip=await JSZip.loadAsync(Buffer.from(saved.bytes));
    await fs.writeFile(path.join(root,'private-hnmr.af'),await zip.file('document.af').async('uint8array'));
    await fs.writeFile(path.join(root,'private-hnmr.af.zip'),Buffer.from(saved.bytes));
    const report=JSON.parse(await zip.file('export-report.json').async('string'));
    const pdfs=evidence.privateTemplate.assets.filter(a=>a.mime==='application/pdf'&&a.derivedFrom);
    for(const asset of pdfs){const embedded=report.embeddedAssets.find(e=>e.sha256===asset.sha256);assert.ok(embedded,asset.name);assert.equal(createHash('sha256').update(await zip.file(embedded.file).async('uint8array')).digest('hex'),asset.sha256);}
    evidence.vectorAssetsVerified=pdfs.map(a=>a.sha256);
  }
  await fs.writeFile(path.join(root,'placement-host-result.json'),JSON.stringify({status:'passed',evidence,errors},null,2));
  console.log(JSON.stringify({root,status:'passed',errors}));
}catch(error){
  console.error(error);
  if(page){console.error(await page.evaluate(()=>({status:document.querySelector('.aaeu-journal-status')?.textContent,modals:[...document.querySelectorAll('.modal')].map(e=>e.textContent)})).catch(()=>null));await page.screenshot({path:path.join(root,'failure.png'),fullPage:true}).catch(()=>{});}
  process.exitCode=1;
}finally{
  if(browser){try{const cdp=await browser.newBrowserCDPSession();await Promise.race([cdp.send('Browser.close'),new Promise(r=>setTimeout(r,1000))]);}catch{}}
  if(!child.killed)child.kill();
}

