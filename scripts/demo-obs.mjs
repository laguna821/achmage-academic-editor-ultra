import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const digest=s=>crypto.createHash('sha256').update(s).digest('base64');
export async function connectObs(){
  const config=JSON.parse(await fs.readFile(path.join(process.env.LOCALAPPDATA,'Programs/OBS-Studio-Portable/config/obs-studio/plugin_config/obs-websocket/config.json'),'utf8').then(t=>t.replace(/^\uFEFF/,'')));
  const ws=new WebSocket(`ws://127.0.0.1:${config.server_port}`),pending=new Map();let next=0;
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('OBS WebSocket connection timed out')),10000);
    ws.onerror=()=>reject(Error('Start the configured portable OBS first'));
    ws.onmessage=event=>{const {op,d}=JSON.parse(event.data);if(op===0){const authentication=d.authentication?digest(digest(config.server_password+d.authentication.salt)+d.authentication.challenge):undefined;ws.send(JSON.stringify({op:1,d:{rpcVersion:1,authentication,eventSubscriptions:0}}));}else if(op===2){clearTimeout(timer);resolve();}else if(op===7){const p=pending.get(d.requestId);if(p){pending.delete(d.requestId);d.requestStatus.result?p.resolve(d.responseData):p.reject(Error(d.requestStatus.comment??JSON.stringify(d.requestStatus)));}}};
  });
  return {close:()=>ws.close(),call:(requestType,requestData={})=>new Promise((resolve,reject)=>{const requestId=String(++next);pending.set(requestId,{resolve,reject});ws.send(JSON.stringify({op:6,d:{requestType,requestData,requestId}}));})};
}
if(process.argv[2]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const obs=await connectObs();try{console.log(JSON.stringify(await obs.call(process.argv[2],JSON.parse(process.argv[3]??'{}')),null,2));}finally{obs.close();}}
