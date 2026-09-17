import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {chromium} from "playwright";
import assert from "node:assert/strict";
import JSZip from 'jszip';
import {createHash} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';

// A separate Obsidian profile and vault. Never installs over the user's plugin.
const root=path.resolve(process.env.HANMARK_HOST_OUTPUT??"test-artifacts/aaeu/af-host"),vault=path.join(root,"vault"),profile=path.join(root,"profile");
const plugin=path.join(vault,".obsidian/plugins/achmage-academic-editor-ultra");
await fs.mkdir(plugin,{recursive:true});await fs.mkdir(profile,{recursive:true});
for(const file of ["main.js","manifest.json","styles.css"])await fs.copyFile(file,path.join(plugin,file));
await fs.writeFile(path.join(vault,".obsidian/community-plugins.json"),'["achmage-academic-editor-ultra"]');
await fs.writeFile(path.join(vault,".obsidian/core-plugins.json"),"[]");
await fs.writeFile(path.join(profile,"obsidian.json"),JSON.stringify({vaults:{abcdef0123456789:{path:vault,ts:Date.now(),open:true}},frame:"native"}));
const executable=process.env.HANMARK_OBSIDIAN_EXE||"C:/Program Files/Obsidian/Obsidian.exe";
const port=19384;
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
  const project=JSON.parse(await fs.readFile('test-artifacts/journal/af32-editable-v9-1-84-final-project.json','utf8'));
  assert.equal(project.assets.length,0,'This manuscript fixture has only built-in brand assets');
  const fontFiles=[];
  if(process.env.HANMARK_LOGO_PDF){
    const bytes=await fs.readFile(process.env.HANMARK_LOGO_PDF),sha256=createHash('sha256').update(bytes).digest('hex'),path='assets/'+sha256+'.pdf';
    const pdf=await PDFDocument.load(bytes),box=pdf.getPage(0).getCropBox();assert.equal(pdf.getPageCount(),1);
    project.assets.push({id:'original-logo-pdf',name:'HMRI original.pdf',mime:'application/pdf',bytes:bytes.length,sha256,path,widthPt:box.width,heightPt:box.height,aspectRatio:box.width/box.height});
    project.preset.master.logoAssetId='original-logo-pdf';
    if(project.preset.appearance)project.preset.appearance.logo={mode:'asset',assetId:'original-logo-pdf'};
    project.document.year='2026';project.document.firstPage=23;project.document.runningAuthors='Kim';project.document.runningTitle='Native editorial validation';
    fontFiles.push({path,base64:bytes.toString('base64')});
  }
  for(const font of project.fonts){
    const dirs=['C:/Windows/Fonts',process.env.HANMARK_GILL_FONTS??'C:/Users/안창현 미디어스쿨/Desktop/HNMR 폰트'];
    let bytes;for(const dir of dirs)for(const name of [font.name,{'GIL___.TTF':'GIL_____.TTF','GILB__.TTF':'GILB____.TTF'}[font.name]].filter(Boolean)){try{bytes=await fs.readFile(path.join(dir,name));break;}catch{}}
    if(!bytes)throw Error('Fixture font unavailable: '+font.name);fontFiles.push({path:font.path,base64:bytes.toString('base64')});
  }
  await page.evaluate(async({project,fontFiles})=>{
    const v=app.workspace.getLeavesOfType('aaeu-journal')[0].view;
    for(const f of fontFiles)await v.store.put(f.path,Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0)));
    v.edit(p=>Object.assign(p,project));await v.save();
    window.__afSaved=[];window.__afCancelSave=false;
    v.gateway.saveFile=async(bytes,fileName)=>{if(window.__afCancelSave){window.__afCanceledBytes=Array.from(bytes);return {cancelled:true,fileName};}window.__afSaved.push({bytes:Array.from(bytes),fileName});return {cancelled:false,fileName,method:'vault'};};
  },{project,fontFiles});
  const afButton=page.getByRole('button',{name:'AF로 내보내기',exact:true});
  await afButton.click();
  await page.locator('.modal-title').filter({hasText:'Affinity 편집 파일 내보내기'}).waitFor();
  await page.screenshot({path:path.join(root,'af-options.png'),fullPage:true});
  const firstStarted=performance.now();
  await page.locator('.modal').getByRole('button',{name:'내보내기',exact:true}).click();
  await page.waitForFunction(()=>!app.workspace.getLeavesOfType('aaeu-journal')[0].view.afController,null,{timeout:120000});
  const first=await page.evaluate(()=>({saved:window.__afSaved,status:document.querySelector('.aaeu-journal-status').textContent,pages:app.workspace.getLeavesOfType('aaeu-journal')[0].view.result?.pageCount}));
  const firstElapsedMs=performance.now()-firstStarted;
  assert.equal(first.saved.length,1,first.status);
  const zipped=Buffer.from(first.saved[0].bytes);await fs.writeFile(path.join(root,'journal.af.zip'),zipped);
  const zip=await JSZip.loadAsync(zipped),report=JSON.parse(await zip.file('export-report.json').async('string'));
  for(const name of ['document.af','reference.pdf','export-report.json','README.ko.txt'])await fs.writeFile(path.join(root,name),await zip.file(name).async('nodebuffer'));
  assert.equal(report.pages,13);assert.equal(report.images.length,2);assert.equal(report.tables.length,1);
  assert.equal(report.pageLayout,'facing');assert.equal(report.masters.length,1);assert.equal(report.frames.filter(f=>f.master).length,24);
  assert.deepEqual(report.spreads.map(s=>s.pages),[[1,2],[3,4],[5,6],[7,8],[9,10],[11,12],[13]]);
  const firstColumns=report.frames.filter(f=>f.storyId==='journal:body-story'&&f.page===1);
  assert.equal(firstColumns.length,2);assert.ok(Math.abs(firstColumns[0].height-firstColumns[1].height)<.01,'soft paragraph-fit skips must not shorten the right editing column');
  if(process.env.HANMARK_LOGO_PDF)assert.equal(report.images.find(i=>i.assetId==='original-logo-pdf').sha256,project.assets[0].sha256,'Native embedded PDF must retain all source bytes');
  assert.equal(report.flows.find(f=>f.sourceStoryId==='journal:body-story').frames.length,26);
  await page.screenshot({path:path.join(root,'af-exported.png'),fullPage:true});
  await afButton.click();await page.getByLabel('저장 형식',{exact:true}).selectOption('af');
  await page.getByLabel('끝에 추가할 연결 페이지',{exact:true}).selectOption('2');
  const secondStarted=performance.now();
  await page.locator('.modal').getByRole('button',{name:'내보내기',exact:true}).click();
  await page.waitForFunction(()=>!app.workspace.getLeavesOfType('aaeu-journal')[0].view.afController,null,{timeout:60000});
  const second=await page.evaluate(()=>window.__afSaved[1]);assert.ok(second?.fileName.endsWith('.af'));
  const exportElapsedMs=performance.now()-secondStarted;
  await fs.writeFile(path.join(root,'continuation.af'),Buffer.from(second.bytes));
  await page.evaluate(()=>{window.__afCancelSave=true;});
  await afButton.click();await page.locator('.modal').getByRole('button',{name:'내보내기',exact:true}).click();
  await page.waitForFunction(()=>!app.workspace.getLeavesOfType('aaeu-journal')[0].view.afController,null,{timeout:60000});
  assert.equal(await page.locator('.aaeu-journal-status').textContent(),'AF 파일 저장을 취소했습니다.');
  assert.equal(await page.evaluate(()=>window.__afSaved.length),2);
  const repeated=await JSZip.loadAsync(Buffer.from(await page.evaluate(()=>window.__afCanceledBytes)));
  assert.deepEqual(await repeated.file('document.af').async('nodebuffer'),await zip.file('document.af').async('nodebuffer'),'Same layout must produce the same native bytes across repeated image conversion');
  await page.evaluate(()=>{window.__afCancelSave=false;});
  for(const mode of ['cancel','stale']){
    await page.evaluate(()=>{
      const v=app.workspace.getLeavesOfType('aaeu-journal')[0].view;
      window.__afReached=false;window.__afOriginalGet=v.store.get.bind(v.store);
      const gate=new Promise(r=>window.__afRelease=r);
      v.store.get=async path=>{if(path.startsWith('fonts/')){window.__afReached=true;await gate;}return window.__afOriginalGet(path);};
    });
    await afButton.click();await page.locator('.modal').getByRole('button',{name:'내보내기',exact:true}).click();
    await page.waitForFunction(()=>window.__afReached,null,{timeout:60000});
    // A second call must not open another dialog or race the first export.
    await page.evaluate(()=>app.workspace.getLeavesOfType('aaeu-journal')[0].view.exportAf());
    assert.equal(await page.locator('.modal').count(),0);
    if(mode==='cancel')await page.getByRole('button',{name:'취소',exact:true}).click();
    else await page.evaluate(()=>{const v=app.workspace.getLeavesOfType('aaeu-journal')[0].view;v.history.change(p=>{p.document.volume='99';});});
    await page.evaluate(()=>window.__afRelease());
    await page.waitForFunction(()=>!app.workspace.getLeavesOfType('aaeu-journal')[0].view.afController);
    const message=await page.locator('.aaeu-journal-status').textContent();
    assert.match(message,mode==='cancel'?/취소/:/변경/);assert.equal(await page.evaluate(()=>window.__afSaved.length),2);
    await page.evaluate(()=>{app.workspace.getLeavesOfType('aaeu-journal')[0].view.store.get=window.__afOriginalGet;});
  }
  assert.deepEqual(errors,[]);
  await afButton.click();await page.locator('.modal-title').filter({hasText:'Affinity 편집 파일 내보내기'}).waitFor();
  await page.evaluate(()=>app.workspace.getLeavesOfType('aaeu-journal')[0].detach());
  await page.waitForFunction(()=>!document.querySelector('.modal'));assert.equal(await page.evaluate(()=>window.__afSaved.length),2);
  const summary={status:'passed',pages:report.pages,frames:report.frames.length,bodyFrames:26,tables:report.tables.length,images:report.images.length,afBytes:(await zip.file('document.af').async('uint8array')).length,packageBytes:zipped.length,extraPages:2,firstCompositionAndExportMs:firstElapsedMs,exportMs:exportElapsedMs,repeatAfByteIdentical:true,cancelSave:true,cancelExport:true,rejectStale:true,duplicateGuard:true,closeClosesDialog:true,errors};
  await fs.writeFile(path.join(root,'host-result.json'),JSON.stringify(summary,null,2));console.log(summary);
}catch(error){
  console.error(error);
  if(page){console.error(await page.evaluate(()=>({status:document.querySelector('.aaeu-journal-status')?.textContent,modals:[...document.querySelectorAll('.modal')].map(e=>e.textContent)})).catch(()=>null));await page.screenshot({path:path.join(root,'failure.png'),fullPage:true}).catch(()=>{});}
  process.exitCode=1;
}finally{
  if(browser){try{const cdp=await browser.newBrowserCDPSession();await Promise.race([cdp.send('Browser.close'),new Promise(r=>setTimeout(r,1000))]);}catch{}}
  if(!child.killed)child.kill();
}
