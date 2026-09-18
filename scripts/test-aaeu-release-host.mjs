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
  const image='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="220" viewBox="0 0 600 220"><rect width="600" height="220" fill="#def3ec"/><path d="M20 180 L150 40 L280 140 L430 30 L580 110" fill="none" stroke="#008763" stroke-width="5"/></svg>';
  const body=Array.from({length:24},(_,i)=>`Paragraph ${i+1}. A structured manuscript retains its original content while deterministic composition places it into balanced columns. The author can edit the Markdown source and regenerate the proof without retyping metadata or moving individual text boxes. Repeated output uses the same saved assets.`).join('\n\n');
  const manuscript='---\naaeu-schema: 1\naaeu-template: builtin:achmage\naaeu-title: Deterministic Markdown Composition\naaeu-running-title: Markdown composition\naaeu-running-authors: Kim\naaeu-year: "2026"\naaeu-volume: "10"\naaeu-issue: "1"\naaeu-first-page: 23\naaeu-publication-mode: issue\naaeu-received: "2026-01-02"\naaeu-revised: "2026-02-03"\naaeu-accepted: "2026-03-04"\naaeu-author-1-name: Min Kim\naaeu-author-1-affiliations: [1]\naaeu-author-1-email: kim@example.org\naaeu-author-1-corresponding: true\naaeu-affiliation-1-text: Example University\naaeu-abstract: |\n  An explicit abstract is placed beside submission and correspondence information.\n\n  This second paragraph must survive conversion.\naaeu-keywords: [Markdown, composition]\naaeu-header-even-text: "JOURNAL {year}"\naaeu-header-odd-text: "Kim: Markdown composition"\naaeu-folio-text: "{page}"\naaeu-data-text: "Data are available from the author."\naaeu-conflict-text: "The author declares no conflicts of interest."\naaeu-sidebar-1-label: Repository\naaeu-sidebar-1-text: "https://example.org/data"\n---\n\n## Introduction\n\n'+body+'\n\n## Results\n\n![Fallback](plot.svg)\n\nFigure 1. Explicit vector caption.\n\nTable 1. Counts\n\n| Group | Count |\n| --- | --- |\n| A | 12 |\n| B | 34 |\n\nNote. Counts are illustrative.\n\n## References\n\nZhang, Z. (2024). Second entry.\n\nAhn, C. (2023). First entry.\n';

  assert.equal(status.version,'1.0.0');
  await page.evaluate(async({manuscript,image})=>{
    await app.vault.create('plot.svg',image);const file=await app.vault.create('paper.md',manuscript.replace('aaeu-schema: 1','# preserved comment\nother-plugin: {tag: keep}\naaeu-schema: 1'));
    const v=window.__view=app.workspace.getLeavesOfType('aaeu-journal')[0].view;await v.importMarkdownNote(file,await app.vault.read(file));await v.compose();
    window.__compositions=0;const original=v.composer.compose.bind(v.composer);v.composer.compose=(...args)=>{window.__compositions++;return original(...args);};
    window.__saved=[];v.gateway.saveFile=async(bytes,fileName)=>{window.__saved.push({bytes:Array.from(bytes),fileName});return {cancelled:false,fileName,method:'vault'};};
  },{manuscript,image});
  await page.locator('.aaeu-manuscript-body .cm-content').waitFor();
  const property=key=>page.locator(`[data-property-input="${key}"]`);
  const focus=async key=>page.evaluate(key=>__view.manuscript.focusProperty(key),key);
  // Click the PDF overlay itself, then verify exact field navigation.
  await page.locator('.aaeu-journal-box[data-node-id="publication:correspondence"]').first().click();
  assert.equal(await property('aaeu-corresponding-name').evaluate(e=>e===document.activeElement),true);
  await property('aaeu-corresponding-name').fill('Editor Test');
  await focus('aaeu-corresponding-email');await property('aaeu-corresponding-email').fill('editor@example.org');
  await page.waitForFunction(async()=> (await app.vault.read(app.vault.getAbstractFileByPath('paper.md'))).includes('editor@example.org'));
  await page.waitForTimeout(2500);
  assert.equal(await page.evaluate(()=>__compositions),0,'Typing must not compose in manual mode');
  assert.equal(await property('aaeu-corresponding-email').evaluate(e=>e===document.activeElement),true);
  assert.match(await page.locator('.aaeu-preview-state').innerText(),/수정사항/);
  await page.getByRole('button',{name:'↻ 미리보기 갱신',exact:true}).click();
  await page.waitForFunction(()=>!__view.compositionTask&&__compositions>0);
  assert.equal(await page.evaluate(()=>__compositions),1);
  assert.equal(await page.evaluate(()=>__view.project.document.journalMetadata.correspondence.includes('Editor Test')),true);
  for(const [id,key] of [['abstract','aaeu-abstract'],['publication:issue','aaeu-year']]){
    await page.locator(`.aaeu-journal-box[data-node-id="${id}"]`).first().click();
    assert.equal(await property(key).evaluate(e=>e===document.activeElement),true);
  }
  await page.locator('.aaeu-journal-box.is-text').first().click();
  assert.equal(await page.locator('.aaeu-manuscript-body .cm-content').evaluate(e=>e===document.activeElement),true);
  await focus('aaeu-title');await property('aaeu-title').fill('한국어 입력 확인');
  await page.waitForTimeout(650);await page.locator('.aaeu-manuscript-tools').getByRole('button',{name:'되돌리기',exact:true}).click();
  await page.waitForTimeout(650);assert.equal(await property('aaeu-title').inputValue(),'Deterministic Markdown Composition');
  // CodeMirror body edits preserve unrelated frontmatter.
  const cm=page.locator('.aaeu-manuscript-body .cm-content');await cm.click();await page.keyboard.press('Control+End');await page.keyboard.type('\n\nBody edit from integrated editor.');
  await page.waitForFunction(async()=> (await app.vault.read(app.vault.getAbstractFileByPath('paper.md'))).includes('Body edit from integrated editor.'));
  const raw=await page.evaluate(()=>app.vault.read(app.vault.getAbstractFileByPath('paper.md')));assert.match(raw,/# preserved comment\nother-plugin: \{tag: keep\}/);
  // Repeated author controls do not require numbered YAML keys.
  await focus('aaeu-author-1-name');await page.getByRole('button',{name:'저자 추가',exact:true}).click();
  await property('aaeu-author-2-name').waitFor();await property('aaeu-author-2-name').fill('Second Author');await page.waitForTimeout(650);
  // Built-in + saved custom templates use one path and preserve overrides.
  const templates=await page.evaluate(async()=>{const lib=__view.library(),all=await lib.list(),custom=structuredClone(all.find(t=>t.id==='builtin:aaeu-demo'));custom.id='custom:editor-test';custom.name='Editor test';await lib.save(custom);return ['builtin:achmage','builtin:command-space','custom:editor-test','builtin:achmage'];});
  for(const id of templates){await page.evaluate(id=>__view.applySavedTemplate(id),id);const state=await page.evaluate(async()=>({id:__view.project.preset.template.id,raw:await app.vault.read(app.vault.getAbstractFileByPath('paper.md'))}));assert.equal(state.id,id);assert.ok(state.raw.includes(id));assert.ok(state.raw.includes('JOURNAL {year}'));}
  await page.evaluate(()=>__view.exportPdf(false));
  const exporting=page.evaluate(()=>__view.exportPdf(true));await page.getByRole('button',{name:'그래도 출력',exact:true}).click();await exporting;
  assert.equal(await page.evaluate(()=>__saved.filter(s=>s.fileName.endsWith('.pdf')).length),2);
  const receipts=await page.evaluate(()=>__view.store.adapter?.list?.(__view.store.root+'/export-receipts').catch(()=>null));
  await page.screenshot({path:path.join(root,'integrated-editor.png'),fullPage:true});
  console.log('EDITOR CORE PASSED');

  assert.ok(receipts?.files.length,'Force export must record warnings');
  // Template undo is a single source undo. Failure preserves both applied and source state.
  await page.evaluate(()=>__view.applySavedTemplate('builtin:aaeu-demo'));
  await page.evaluate(()=>__view.undo());await page.evaluate(()=>__view.compose());
  assert.equal(await page.evaluate(()=>__view.project.preset.template.id),'builtin:achmage');
  const rollback=await page.evaluate(async()=>{const lib=__view.library(),t=structuredClone((await lib.list()).find(t=>t.id==='builtin:aaeu-demo'));t.id='custom:missing-font';t.name='Missing font';t.appearance.fonts.body='No Such Typeface 2026';await lib.save(t);let error='';try{await __view.applySavedTemplate(t.id);}catch(e){error=e.message;}return {error,id:__view.project.preset.template.id,source:__view.sourceDraft};});
  assert.ok(rollback.error);assert.equal(rollback.id,'builtin:achmage');assert.ok(!rollback.source.includes('custom:missing-font'));
  // An open native note is updated too, without clobbering independent external edits.
  await page.evaluate(async()=>{const file=app.vault.getAbstractFileByPath('paper.md');const leaf=app.workspace.getLeaf('split');await leaf.openFile(file);await app.workspace.revealLeaf(__view.leaf);});
  await focus('aaeu-received');await property('aaeu-received').fill('September 18, 2026');await page.waitForTimeout(650);
  assert.equal(await page.evaluate(()=>app.workspace.getLeavesOfType('markdown').some(l=>l.view.editor.getValue().includes('September 18, 2026'))),true);
  // Force same-field edit conflict before the debounced save. Both sides remain recoverable.
  await page.evaluate(async()=>{const file=app.vault.getAbstractFileByPath('paper.md');const remote=__view.sourceBase.replace('September 18, 2026','External date');for(const leaf of app.workspace.getLeavesOfType('markdown'))leaf.view.editor.setValue(remote);await app.vault.modify(file,remote);await __view.changeFields({'aaeu-received':'My date'});try{await __view.flushSourceDraft();}catch{}});
  await page.locator('.aaeu-source-conflict').waitFor();
  const conflicts=await page.evaluate(()=>app.vault.getMarkdownFiles().filter(f=>f.path.includes('-conflict-')).map(f=>f.path));assert.ok(conflicts.length);
  await page.getByRole('button',{name:'외부 원문 사용 · 내 사본 유지',exact:true}).click();await page.waitForFunction(()=>!__view.sourceConflict&&!__view.compositionTask);
  assert.match(await property('aaeu-received').inputValue(),/External date/);
  // Invalid source and composition failures cannot save the stale preview.
  const badYaml=await page.evaluate(async()=>{const good=__view.sourceDraft,count=__saved.length;__view.changeSource(good.replace('aaeu-schema: 1','aaeu-schema: [broken'));await __view.flushSourceDraft();let error='';try{await __view.exportPdf(false);}catch(e){error=e.message;}__view.changeSource(good);await __view.compose();return {error,saved:__saved.length-count};});assert.match(badYaml.error,/YAML/);assert.equal(badYaml.saved,0);
  const badComposition=await page.evaluate(async()=>{const original=__view.composer.compose,count=__saved.length;await __view.changeFields({'aaeu-running-title':'Updated running title'});__view.composer.compose=async()=>{throw Error('Test compilation failure');};let error='';try{await __view.exportPdf(false);}catch(e){error=e.message;}finally{__view.composer.compose=original;}await __view.compose();return {error,saved:__saved.length-count};});assert.match(badComposition.error,/compilation failure/);assert.equal(badComposition.saved,0);
  // Auto-preview is opt-in; rapid typing is batched and the focused input survives.
  await page.locator('.aaeu-auto-preview input').check();await focus('aaeu-corresponding-name');
  const count=await page.evaluate(()=>__compositions);await property('aaeu-corresponding-name').pressSequentially(' ABC',{delay:70});await page.waitForTimeout(1000);assert.equal(await page.evaluate(()=>__compositions),count);
  await page.waitForFunction(count=>__compositions>count&&!__view.compositionTask,count);assert.equal(await page.evaluate(()=>__compositions),count+1);assert.equal(await property('aaeu-corresponding-name').evaluate(e=>e===document.activeElement),true);await page.locator('.aaeu-auto-preview input').uncheck();
  // AF embeds exactly the original public preset PDF, with separate display caches and hashes.
  const afTask=page.evaluate(()=>__view.exportAf());await page.locator('.modal').getByRole('button',{name:'내보내기',exact:true}).click();await afTask;
  const savedAf=await page.evaluate(()=>__saved.at(-1));assert.ok(savedAf.fileName.endsWith('.af.zip'));
  const zip=await JSZip.loadAsync(Buffer.from(savedAf.bytes));const report=JSON.parse(await zip.file('export-report.json').async('string'));
  const achmagePdf=await fs.readFile('assets/brands/journal-of-achmage.pdf');
  const logo=report.originalAssets.find(a=>a.sha256===createHash('sha256').update(achmagePdf).digest('hex'));assert.ok(logo,JSON.stringify(report.originalAssets));
  const embedded=report.embeddedAssets.find(a=>a.sha256===logo.sha256);assert.ok(embedded);assert.equal(createHash('sha256').update(await zip.file(embedded.file).async('uint8array')).digest('hex'),logo.sha256);
  await fs.writeFile(path.join(root,'editor-test.af'),await zip.file('document.af').async('uint8array'));await fs.writeFile(path.join(root,'af-report.json'),JSON.stringify(report,null,2));
  // Close/reopen the saved Markdown project, then exercise the shared Word adapter.
  const restored=await page.evaluate(async()=>{const leaf=__view.leaf,root=__view.store.root;await __view.save();await leaf.setViewState({type:'empty'});await leaf.setViewState({type:'aaeu-journal',state:{root},active:true});window.__view=leaf.view;await __view.compose();return {name:__view.project.document.journalMetadata.correspondence,template:__view.project.preset.template.id};});assert.match(restored.name,/Editor Test ABC/);assert.equal(restored.template,'builtin:achmage');
  await page.evaluate(()=>{__view.history.change(p=>{delete p.markdown;});__view.refresh();});
  for(const [id,key,value] of [['publication:correspondence','aaeu-corresponding-name','Word Editor'],['abstract','aaeu-abstract','Word abstract: preserved in the project.'],['publication:issue','aaeu-year','2027'],['publication:header-even','aaeu-header-even-text','WORD HEADER'],['property:aaeu-data-text','aaeu-data-text','Word data statement']]){
    await page.evaluate(id=>__view.selectNode(id),id);await property(key).fill(value);
  }
  await page.evaluate(async()=>{await __view.save();await __view.compose();});
  const word=await page.evaluate(async()=>{const p=await __view.store.load();return {abstract:p.document.abstract[0].content.map(x=>x.text).join(''),year:p.document.year,correspondence:p.document.journalMetadata.correspondence,header:p.document.journalMetadata.overrides['header-even'],data:p.document.endMatter.find(e=>e.kind==='data').content[0].content[0].text};});assert.equal(word.year,'2027');assert.match(word.correspondence,/Word Editor/);assert.equal(word.header,'WORD HEADER');assert.equal(word.data,'Word data statement');assert.match(word.abstract,/Word abstract/);
  console.log('SOURCE CONFLICT, EXPORT, TEMPLATE, AF AND WORD ADAPTER PASSED');

  // Body-origin metadata points back to the body; legacy YAML stays in its original key.
  await page.evaluate(async()=>{const text='---\naaeu-schema: 1\naaeu-template: builtin:achmage\naaee-other: keep\nyear: "2026"\n---\n\n# Body-origin title\n\n## Abstract\n\nA *formatted* body abstract.\n\n## Introduction\n\nThe body remains editable.\n\n## Data availability statement\n\nData from the body.\n';const file=await app.vault.create('body-source.md',text);await __view.importMarkdownNote(file,text);await __view.compose();});
  await page.evaluate(()=>__view.manuscript.focusProperty('aaeu-year'));await property('aaeu-year').fill('2028');await page.evaluate(()=>__view.flushSourceDraft());
  const bodySource=await page.evaluate(()=>__view.sourceDraft);assert.match(bodySource,/year: ['"]?2028/);assert.ok(!bodySource.includes('aaeu-year:'));
  await page.locator('.aaeu-journal-box[data-node-id="abstract"]').first().click();
  assert.equal(await page.locator('.aaeu-manuscript-body .cm-content').evaluate(e=>e===document.activeElement),true);
  assert.equal(await property('aaeu-abstract').inputValue(),'A formatted body abstract.');assert.equal(await property('aaeu-abstract').evaluate(e=>e.readOnly),true);
  assert.ok(!bodySource.includes('aaeu-abstract:'));assert.match(bodySource,/A \*formatted\* body abstract/);
  await page.evaluate(()=>__view.manuscript.focusProperty('aaeu-data-text'));
  assert.equal(await page.locator('.aaeu-manuscript-body .cm-content').evaluate(e=>e===document.activeElement),true);

  // Exercise the actual DOCX import route, not only the shared data adapter.
  const docx=new JSZip(),para=text=>`<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
  docx.file('word/document.xml',`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${['A real DOCX route test','Abstract','A Word abstract to edit.','Introduction','A body paragraph from a Word file.'].map(para).join('')}</w:body></w:document>`);
  const bytes=Array.from(await docx.generateAsync({type:'uint8array'}));
  await page.evaluate(async bytes=>{const leaf=app.workspace.getLeaf('tab');await leaf.setViewState({type:'aaeu-journal',active:true});window.__docxView=leaf.view;__docxView.gateway.pickFiles=async()=>[{name:'fixture.docx',bytes:new Uint8Array(bytes)}];},bytes);
  const importing=page.evaluate(()=>__docxView.importFiles());await page.locator('.modal').getByRole('button',{name:'가져오기',exact:true}).click();await importing;
  await page.evaluate(()=>{window.__view=__docxView;__view.manuscript.focusProperty('aaeu-corresponding-name');});
  await page.locator('.workspace-leaf.mod-active [data-property-input="aaeu-corresponding-name"]').fill('DOCX Editor');
  const docxResult=await page.evaluate(async()=>{await __view.save();await __view.compose();const root=__view.store.root,leaf=__view.leaf;await leaf.setViewState({type:'empty'});await leaf.setViewState({type:'aaeu-journal',state:{root},active:true});window.__view=leaf.view;return {source:__view.project.sources[0].name,correspondence:__view.project.document.journalMetadata.correspondence,markdown:!!__view.project.markdown};});
  assert.equal(docxResult.source,'fixture.docx');assert.match(docxResult.correspondence,/DOCX Editor/);assert.equal(docxResult.markdown,false);

  // Keep machine-readable evidence, including actual exported PDF files.
  for(const saved of await page.evaluate(()=>__saved))await fs.writeFile(path.join(root,saved.fileName),Buffer.from(saved.bytes));
  await fs.writeFile(path.join(root,'editor-host-result.json'),JSON.stringify({status:'passed',version:status.version,manualTypingCompositions:0,oneClickCompositions:1,templates,sourceConflictCopies:conflicts.length,forceExportReceipts:receipts.files.length,vectorLogoSha256:logo.sha256,word,docxResult,errors},null,2));
  console.log(JSON.stringify({root,status:'passed',errors}));
}catch(error){
  console.error(error);
  if(page){console.error(await page.evaluate(()=>({status:document.querySelector('.aaeu-journal-status')?.textContent,modals:[...document.querySelectorAll('.modal')].map(e=>e.textContent)})).catch(()=>null));await page.screenshot({path:path.join(root,'failure.png'),fullPage:true}).catch(()=>{});}
  process.exitCode=1;
}finally{
  if(browser){try{const cdp=await browser.newBrowserCDPSession();await Promise.race([cdp.send('Browser.close'),new Promise(r=>setTimeout(r,1000))]);}catch{}}
  if(!child.killed)child.kill();
}
