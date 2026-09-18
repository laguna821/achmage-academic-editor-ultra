/** Actual isolated Obsidian UI + desktop recording; no reconstructed application screens. */
import {connectDemo} from './demo-connect.mjs';
import {connectObs} from './demo-obs.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import JSZip from 'jszip';
const run=promisify(execFile),language=process.argv[2]??'en',ko=language==='ko',out=path.resolve('test-artifacts/launch-media');
const {browser,page}=await connectDemo(),obs=await connectObs();let started=false,start=0;const marks=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));const mark=name=>{marks.push({name,time:(Date.now()-start)/1000});console.log(name,marks.at(-1).time);};
const ps=async(file,args=[])=>run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',file,...args],{windowsHide:true});
const button=(en,kr,scope=page)=>scope.getByRole('button',{name:ko?kr:en,exact:true});
try{
  if((await obs.call('GetRecordStatus')).outputActive)throw Error('An existing recording is active');
  await page.evaluate(language=>localStorage.setItem('language',language),language);await page.reload();await page.waitForFunction(()=>!!window.app?.plugins?.plugins['achmage-academic-editor-ultra']&&app.workspace.layoutReady&&app.workspace.leftSplit);
  await page.evaluate(async language=>{
    require('electron').webFrame.setZoomFactor(.85);app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();
    app.commands.executeCommandById('achmage-academic-editor-ultra:open-journal-editor');
    const v=app.workspace.getLeavesOfType('aaeu-journal')[0].view;await v.openSampleManuscript(language,true);await v.compose();
    const source=v.project.markdown.path;for(const leaf of app.workspace.getLeavesOfType('markdown'))if(leaf.view.file?.path!==source)leaf.detach();
    const leaf=app.workspace.getLeavesOfType('markdown').find(l=>l.view.file?.path===source);await leaf.setViewState({type:'markdown',state:{file:source,mode:'source',source:true}});
    window.__demoSource=source;window.__originalSave=v.gateway.saveFile;window.__demoSaved=[];v.gateway.saveFile=async(bytes,fileName)=>{window.__demoSaved.push({fileName,bytes:Array.from(bytes)});return{cancelled:false,fileName,method:'vault'};};
    app.workspace.revealLeaf(v.leaf);
  },language);
  if(await button('Expand proof','지면 크게 보기').count())await button('Expand proof','지면 크게 보기').click();
  await ps('scripts/demo-window.ps1',['-ProcessId','32732','-Topmost','-Focus']);
  await pause(1500);await obs.call('StartRecord');started=true;
  for(let i=0;i<50;i++){if((await obs.call('GetRecordStatus')).outputActive)break;await pause(100);}start=Date.now();
  mark('proof');await pause(4500);
  await page.locator('.workspace-tab-header').filter({hasText:'Start here'}).last().click();
  await page.evaluate(()=>{const v=app.workspace.getLeavesOfType('markdown').find(l=>l.view.file?.path===window.__demoSource).view;v.editor.setCursor({line:0,ch:0});v.editor.scrollTo(0,0);});
  mark('markdown');await pause(4500);
  await page.evaluate(()=>{const e=app.workspace.getLeavesOfType('markdown').find(l=>l.view.file?.path===window.__demoSource).view.editor;const lines=e.getValue().split('\n'),line=lines.findIndex(l=>l.startsWith('aaeu-title:'));e.focus();e.setSelection({line,ch:lines[line].indexOf('"')+1},{line,ch:lines[line].lastIndexOf('"')});});
  await page.keyboard.type(ko?'당신의 생각을, 아름다운 지면으로.':'Your ideas. Beautifully presented.',{delay:70});await pause(3000);mark('title-edited');
  for(const [name,needle] of [['abstract','aaeu-abstract:'],['headings','## '],['figure','!['],['table','| ']]){
    await page.evaluate(needle=>{const v=app.workspace.getLeavesOfType('markdown').find(l=>l.view.file?.path===window.__demoSource).view;const e=v.editor,line=e.getValue().split('\n').findIndex(l=>l.startsWith(needle));e.setCursor({line,ch:0});e.scrollIntoView({from:{line,ch:0},to:{line:line+8,ch:0}},true);},needle);mark(name);await pause(name==='table'?5000:4000);
  }
  await page.locator('.workspace-tab-header').filter({hasText:'Academic Editor Ultra'}).first().click();
  mark('compose');await button('Compose','조판').click();await page.waitForFunction(()=>!app.workspace.getLeavesOfType('aaeu-journal')[0].view.controller,null,{timeout:180000});await pause(5000);
  await button('Journal template','저널 템플릿').click();mark('switch');await pause(1800);
  await page.getByRole('combobox',{name:ko?'저장된 템플릿':'Saved templates',exact:true}).selectOption('builtin:command-space');await pause(2000);
  await button('3. Color & type','3. 색상·글꼴',page.locator('.modal')).click();await pause(2500);
  await button('5. Preview & save','5. 미리보기·저장',page.locator('.modal')).click();await button('Preview this manuscript','현재 원고로 미리보기',page.locator('.modal')).click();
  await page.waitForFunction(label=>[...document.querySelectorAll('.modal button')].some(b=>b.textContent===label&&!b.disabled),ko?'템플릿 저장 및 원고에 적용':'Save and apply template',{timeout:180000});mark('template-preview');await pause(3500);
  await button('Save and apply template','템플릿 저장 및 원고에 적용',page.locator('.modal')).click();await page.waitForFunction(()=>!app.workspace.getLeavesOfType('aaeu-journal')[0].view.controller,null,{timeout:180000});mark('new-journal');await pause(5000);
  await button('Proof PDF','검토용 PDF').click();await page.waitForFunction(()=>window.__demoSaved.some(s=>s.fileName.endsWith('.pdf')));
  const pdf=await page.evaluate(()=>window.__demoSaved.find(s=>s.fileName.endsWith('.pdf')));await fs.writeFile(path.join(out,`recorded-${language}.pdf`),Buffer.from(pdf.bytes));mark('pdf-export');await pause(1800);
  await button('Export AF','AF로 내보내기').click();await pause(1800);await button('Export','내보내기',page.locator('.modal')).click();await page.waitForFunction(()=>!app.workspace.getLeavesOfType('aaeu-journal')[0].view.afController,null,{timeout:180000});
  const af=await page.evaluate(()=>window.__demoSaved.at(-1));if(!af.fileName.endsWith('.zip'))throw Error('AF export did not save');const zip=await JSZip.loadAsync(Buffer.from(af.bytes));const afPath=path.join(out,`AAEU-Demo-${language}.af`);await fs.writeFile(afPath,await zip.file('document.af').async('uint8array'));mark('af-export');
  await ps('scripts/demo-open-af.ps1',['-Path',afPath]);await pause(2000);
  await ps('scripts/demo-window.ps1',['-ProcessId','11048','-Topmost','-Focus']);
  await ps('scripts/inspect-affinity.ps1',['-Expand','보기(V)']);await ps('scripts/inspect-affinity.ps1',['-Expand','확대/축소(Z)']);await ps('scripts/inspect-affinity.ps1',['-Invoke','맞춤으로(F)']);mark('affinity');await pause(7000);
  const result=await obs.call('StopRecord');started=false;mark('end');await fs.writeFile(path.join(out,`take-${language}.json`),JSON.stringify({language,...result,marks,editing:'Actual UI and engine output. File chooser capture bypassed by the isolated test save gateway; the PDF and AF bytes are saved alongside the take.'},null,2));console.log(result.outputPath);
  for(let i=0;i<50&&(await obs.call('GetRecordStatus')).outputActive;i++)await pause(100);
}finally{
  if(started&&(await obs.call('GetRecordStatus')).outputActive)await obs.call('StopRecord');
  await page.evaluate(()=>{const v=app.workspace.getLeavesOfType('aaeu-journal')[0]?.view;if(v&&window.__originalSave)v.gateway.saveFile=window.__originalSave;}).catch(()=>{});
  for(const pid of ['11048','32732'])await ps('scripts/demo-window.ps1',['-ProcessId',pid]).catch(()=>{});
  obs.close();await browser.close();
}
