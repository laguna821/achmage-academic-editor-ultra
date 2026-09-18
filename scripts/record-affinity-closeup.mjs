import fs from 'node:fs/promises';import path from 'node:path';import {promisify} from 'node:util';import {execFile} from 'node:child_process';import {connectObs} from './demo-obs.mjs';
const run=promisify(execFile),obs=await connectObs(),root=path.resolve('test-artifacts/launch-media'),lang=process.argv[2]??'en';
const ps=async(file,args=[])=>run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',file,...args],{windowsHide:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));let active=false;
try{
 if((await obs.call('GetRecordStatus')).outputActive)throw Error('Existing recording is active');
 const af=path.join(root,`Final-${lang}-${Date.now()}.af`);await fs.copyFile(path.join(root,`AAEU-Demo-${lang}.af`),af);
 console.log((await ps('scripts/demo-open-af.ps1',['-Path',af])).stdout);
 await ps('scripts/demo-window.ps1',['-ProcessId','11048','-Topmost','-Focus']);
 await ps('scripts/inspect-affinity.ps1',['-Expand','보기(V)']);await ps('scripts/inspect-affinity.ps1',['-Expand','확대/축소(Z)']);await ps('scripts/inspect-affinity.ps1',['-Invoke','맞춤으로(F)']);
 await wait(1000);await obs.call('StartRecord');active=true;await wait(8000);const result=await obs.call('StopRecord');active=false;
 const take=JSON.parse(await fs.readFile(path.join(root,`take-${lang}.json`),'utf8'));take.affinityClip=result.outputPath;take.affinityDocument=af;await fs.writeFile(path.join(root,`take-${lang}.json`),JSON.stringify(take,null,2));console.log(result);
 for(let i=0;i<50&&(await obs.call('GetRecordStatus')).outputActive;i++)await wait(100);
}finally{if(active&&(await obs.call('GetRecordStatus')).outputActive)await obs.call('StopRecord');await ps('scripts/demo-window.ps1',['-ProcessId','11048']).catch(()=>{});obs.close();}
