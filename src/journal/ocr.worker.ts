import Core from 'tesseract.js-core/tesseract-core-lstm.js';
import {dispatchHandlers,setAdapter} from 'tesseract.js/src/worker-script/index.js';

let wasm:Uint8Array|undefined;
// The pinned scalar LSTM build has a single execution path on all hosts.
// No URL is accepted by the adapter; code, WASM and language bytes are embedded.
setAdapter({
  getCore:async()=>async(options:Record<string,unknown>)=>{
    if(!wasm)throw new Error('Embedded OCR WASM is required');
    return Core({...options,wasmBinary:wasm});
  },
  readCache:async()=>undefined,writeCache:async()=>undefined,deleteCache:async()=>undefined,
  gunzip:()=>{throw new Error('OCR expects verified uncompressed language bytes');},
  fetch:()=>{throw new Error('Network OCR resources are disabled');}
});
self.onmessage=(event:MessageEvent<{wasm?:Uint8Array;action:string;payload:Record<string,unknown>;jobId:string;workerId:string}>)=>{
  if(event.data.wasm)wasm=event.data.wasm;
  dispatchHandlers(event.data,(packet:unknown)=>self.postMessage(packet));
};
