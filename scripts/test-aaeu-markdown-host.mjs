import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {chromium} from "playwright";
import assert from "node:assert/strict";
import JSZip from 'jszip';
import {createHash} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';

// A separate Obsidian profile and vault. Never installs over the user's plugin.
const root=path.resolve(process.env.HANMARK_HOST_OUTPUT??"test-artifacts/aaeu/markdown-host"),vault=path.join(root,"vault"),profile=path.join(root,"profile");
const plugin=path.join(vault,".obsidian/plugins/achmage-academic-editor-ultra");
await fs.mkdir(plugin,{recursive:true});await fs.mkdir(profile,{recursive:true});
for(const file of ["main.js","manifest.json","styles.css"])await fs.copyFile(file,path.join(plugin,file));
await fs.writeFile(path.join(vault,".obsidian/community-plugins.json"),'["achmage-academic-editor-ultra"]');
await fs.writeFile(path.join(vault,".obsidian/core-plugins.json"),"[]");
await fs.writeFile(path.join(profile,"obsidian.json"),JSON.stringify({vaults:{abcdef0123456789:{path:vault,ts:Date.now(),open:true}},frame:"native"}));
const executable=process.env.HANMARK_OBSIDIAN_EXE||"C:/Program Files/Obsidian/Obsidian.exe";
const port=19385;
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
  const image='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="220" viewBox="0 0 600 220"><rect width="600" height="220" fill="#def3ec"/><path d="M20 180 L150 40 L280 140 L430 30 L580 110" fill="none" stroke="#008763" stroke-width="5"/></svg>';
  const body=Array.from({length:24},(_,i)=>`Paragraph ${i+1}. A structured manuscript retains its original content while deterministic composition places it into balanced columns. The author can edit the Markdown source and regenerate the proof without retyping metadata or moving individual text boxes. Repeated output uses the same saved assets.`).join('\n\n');
  const manuscript='---\naaeu-schema: 1\naaeu-template: builtin:hnmr\naaeu-title: Deterministic Markdown Composition\naaeu-running-title: Markdown composition\naaeu-running-authors: Kim\naaeu-year: "2026"\naaeu-volume: "10"\naaeu-issue: "1"\naaeu-first-page: 23\naaeu-publication-mode: issue\naaeu-received: "2026-01-02"\naaeu-revised: "2026-02-03"\naaeu-accepted: "2026-03-04"\naaeu-author-1-name: Min Kim\naaeu-author-1-affiliations: [1]\naaeu-author-1-email: kim@example.org\naaeu-author-1-corresponding: true\naaeu-affiliation-1-text: Example University\naaeu-abstract: |\n  An explicit abstract is placed beside submission and correspondence information.\n\n  This second paragraph must survive conversion.\naaeu-keywords: [Markdown, composition]\naaeu-header-even-text: "JOURNAL {year}"\naaeu-header-odd-text: "Kim: Markdown composition"\naaeu-folio-text: "{page}"\naaeu-data-text: "Data are available from the author."\naaeu-conflict-text: "The author declares no conflicts of interest."\naaeu-sidebar-1-label: Repository\naaeu-sidebar-1-text: "https://example.org/data"\n---\n\n## Introduction\n\n'+body+'\n\n## Results\n\n![Fallback](plot.svg)\n\nFigure 1. Explicit vector caption.\n\nTable 1. Counts\n\n| Group | Count |\n| --- | --- |\n| A | 12 |\n| B | 34 |\n\nNote. Counts are illustrative.\n\n## References\n\nZhang, Z. (2024). Second entry.\n\nAhn, C. (2023). First entry.\n';
  const first=await page.evaluate(async({manuscript,image})=>{
    await app.vault.create('plot.svg',image);const file=await app.vault.create('paper.md',manuscript);
    const v=app.workspace.getLeavesOfType('aaeu-journal')[0].view;await v.importMarkdownNote(file,manuscript);const id=v.project.id;
    const t=performance.now();await v.compose();const firstMs=performance.now()-t;
    const firstBytes=Array.from(v.result.pdf),firstHash=v.result.fingerprint;const repeatStart=performance.now();await v.compose();
    window.__aaeuSaved=[];v.gateway.saveFile=async(bytes,fileName)=>{window.__aaeuSaved.push({bytes:Array.from(bytes),fileName});return {cancelled:false,fileName,method:'vault'};};
    await v.exportPdf(false);await v.exportIdml();
    return {id,project:v.project,pages:v.result.pageCount,issues:v.result.issues,coverage:v.result.coverage,firstMs,repeatMs:performance.now()-repeatStart,identical:firstBytes.length===v.result.pdf.length&&firstBytes.every((x,i)=>x===v.result.pdf[i]),firstHash,saved:window.__aaeuSaved};
  },{manuscript,image});
  assert.equal(first.project.document.abstract.length,2);assert.equal(first.project.document.firstPage,23);assert.ok(first.pages>=3);assert.ok(first.identical);assert.equal(first.project.markdown.dependencies.length,1);assert.equal(await page.locator('.aaeu-journal-prose').count(),0);
  for(const file of first.saved)await fs.writeFile(path.join(root,file.fileName),Buffer.from(file.bytes));
  await page.screenshot({path:path.join(root,'source-workspace.png'),fullPage:true});
  // New source metadata, stable body identities, persistent local image updates and renames.
  const changed=await page.evaluate(async()=>{
    const v=app.workspace.getLeavesOfType('aaeu-journal')[0].view,file=app.vault.getAbstractFileByPath('paper.md'),oldId=v.project.document.blocks[1].id;
    await app.vault.modify(file,(await app.vault.read(file)).replace('2026-01-02','2026-01-05'));
    await v.compose();const date=v.project.document.received,sameId=v.project.document.blocks[1].id===oldId;
    const image=app.vault.getAbstractFileByPath('plot.svg'),oldHash=v.project.markdown.dependencies[0].sha256;await app.vault.modify(image,(await app.vault.read(image)).replace('#def3ec','#ddeeff'));await v.compose();const newHash=v.project.markdown.dependencies[0].sha256;
    await app.vault.rename(file,'renamed.md');await v.compose();const rename=v.project.markdown.path;
    const id=v.project.id;await v.importMarkdownNote(file,await app.vault.read(file));
    return {date,sameId,imageChanged:oldHash!==newHash,rename,reused:v.project.id===id,pdf:Array.from(v.result?.pdf??[])};
  });
  assert.equal(changed.date,'2026-01-05');assert.ok(changed.sameId);assert.ok(changed.imageChanged);assert.equal(changed.rename,'renamed.md');assert.ok(changed.reused);
  await page.getByRole('button',{name:'AF로 내보내기',exact:true}).click();await page.locator('.modal-title').filter({hasText:'Affinity 편집 파일 내보내기'}).waitFor();await page.locator('.modal').getByRole('button',{name:'내보내기',exact:true}).click();
  await page.waitForFunction(()=>!app.workspace.getLeavesOfType('aaeu-journal')[0].view.afController,null,{timeout:120000});
  const af=await page.evaluate(()=>window.__aaeuSaved.at(-1));assert.ok(af.fileName.endsWith('.zip'));await fs.writeFile(path.join(root,'markdown.af.zip'),Buffer.from(af.bytes));
  const zip=await JSZip.loadAsync(Buffer.from(af.bytes));const report=JSON.parse(await zip.file('export-report.json').async('string'));assert.equal(report.pages,first.pages);await fs.writeFile(path.join(root,'markdown.af'),await zip.file('document.af').async('uint8array'));
  // A copied legacy project keeps editable content and migration is idempotent.
  const migration=await page.evaluate(async()=>{
    const v=app.workspace.getLeavesOfType('aaeu-journal')[0].view,adapter=app.vault.adapter;
    const existing=v.store.root;await adapter.mkdir('HanMark Journals');await adapter.mkdir('HanMark Journals/legacy');
    const copy=async(from,to)=>{const listing=await adapter.list(from);for(const folder of listing.folders){const dest=to+'/'+folder.split('/').at(-1);await adapter.mkdir(dest);await copy(folder,dest);}for(const file of listing.files)await adapter.writeBinary(to+'/'+file.split('/').at(-1),await adapter.readBinary(file));};await copy(existing,'HanMark Journals/legacy');return {legacy:existing};
  });
  await page.getByRole('button',{name:'HanMark 프로젝트 복사',exact:true}).click();await page.locator('.modal').getByRole('button',{name:'Deterministic Markdown Composition',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.modal'));
  const migrated=await page.evaluate(()=>{const v=app.workspace.getLeavesOfType('aaeu-journal')[0].view;return {id:v.project.id,source:!!v.project.markdown,migrated:v.project.migratedFrom};});assert.ok(migrated.migrated);assert.equal(migrated.source,false);
  await page.getByRole('button',{name:'HanMark 프로젝트 복사',exact:true}).click();await page.locator('.modal').getByRole('button',{name:'Deterministic Markdown Composition',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.modal'));assert.equal(await page.evaluate(()=>app.workspace.getLeavesOfType('aaeu-journal')[0].view.project.id),migrated.id);
  // New manuscript command uses a selectable template and creates the entire flat property schema.
  await page.getByRole('button',{name:'새 Markdown 원고',exact:true}).click();await page.locator('.modal').getByRole('button',{name:'일반 간행물',exact:true}).click();await page.locator('.modal').getByLabel('볼트 안에 새로 만들 파일 경로').fill('newsletter.md');await page.locator('.modal').getByRole('button',{name:'확인',exact:true}).click();await page.waitForFunction(()=>app.workspace.getActiveFile()?.path==='newsletter.md');
  const generated=await page.evaluate(async()=>app.vault.read(app.vault.getAbstractFileByPath('newsletter.md')));assert.match(generated,/aaeu-template: "builtin:general"/);assert.match(generated,/aaeu-abstract: \|/);assert.match(generated,/aaeu-statement-1-text:/);
  const summary={status:'passed',pages:first.pages,firstMs:first.firstMs,repeatMs:first.repeatMs,repeatIdentical:first.identical,sourceChanges:changed,migrationIdempotent:true,newNoteCommand:true,issues:first.issues.map(i=>({code:i.code,severity:i.severity})),coverage:first.coverage,errors};delete summary.sourceChanges.pdf;
  await fs.writeFile(path.join(root,'markdown-host-result.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({status:summary.status,pages:summary.pages,firstMs:summary.firstMs,repeatMs:summary.repeatMs,errors}));

}catch(error){
  console.error(error);
  if(page){console.error(await page.evaluate(()=>({status:document.querySelector('.aaeu-journal-status')?.textContent,modals:[...document.querySelectorAll('.modal')].map(e=>e.textContent)})).catch(()=>null));await page.screenshot({path:path.join(root,'failure.png'),fullPage:true}).catch(()=>{});}
  process.exitCode=1;
}finally{
  if(browser){try{const cdp=await browser.newBrowserCDPSession();await Promise.race([cdp.send('Browser.close'),new Promise(r=>setTimeout(r,1000))]);}catch{}}
  if(!child.killed)child.kill();
}
