import {OCR_WORKER,OCR_RESOURCES,OCR_VERSION} from './ocr.generated';
import {unpackResource} from './resources';
import {assetPreview} from './assetPreview';
import type {CaptionDetection,JournalAsset} from './types';
export {OCR_VERSION};
export interface OcrLine {text:string;confidence:number;bbox:{x0:number;y0:number;x1:number;y1:number}}

/** Detection suggests; it never edits image bytes or approves a crop. */
export function captionCandidates(lines:OcrLine[],width:number,height:number,pixels?:Uint8ClampedArray):CaptionDetection['candidates']{
  const result:CaptionDetection['candidates']=[];
  const ink=(y:number):boolean=>{
    if(!pixels)return true;
    let count=0;for(let x=0;x<width;x++){const i=(Math.floor(y)*width+x)*4;if(pixels[i+3]>24&&Math.min(pixels[i],pixels[i+1],pixels[i+2])<225)count++;}
    return count>Math.max(1,width*.001);
  };
  for(const line of lines){
    if(!/^\s*(?:fig(?:ure)?\.?|table|그림|표)\s*[A-Z]?\d+(?:[a-z])?(?:\b|[.:\s])/i.test(line.text)||line.confidence<55)continue;
    const b=line.bbox,candidate:CaptionDetection['candidates'][number]={text:line.text.trim(),confidence:line.confidence,x:b.x0/width,y:b.y0/height,width:(b.x1-b.x0)/width,height:(b.y1-b.y0)/height};
    // A full horizontal blank strip separates a marginal caption from artwork.
    // If a legend or axis crosses the strip there is no automatic crop proposal.
    if(line.confidence>=80&&pixels){
      const top=b.y1<height*.25,bottom=b.y0>height*.75;
      if(top){
        let gap=0;
        for(let y=Math.ceil(b.y1+2);y<Math.min(height*.3,b.y1+height*.08);y++){
          gap=ink(y)?0:gap+1;
          if(gap>=Math.max(3,Math.ceil(height*.003))){const edge=(y+2)/height;candidate.crop={x:0,y:edge,width:1,height:1-edge};break;}
        }
      }else if(bottom){
        let gap=0;
        for(let y=Math.floor(b.y0-2);y>Math.max(height*.7,b.y0-height*.08);y--){
          gap=ink(y)?0:gap+1;
          if(gap>=Math.max(3,Math.ceil(height*.003))){candidate.crop={x:0,y:0,width:1,height:(y-1)/height};break;}
        }
      }
    }
    result.push(candidate);
  }
  return result;
}
async function resource(name:keyof typeof OCR_RESOURCES):Promise<Uint8Array>{return unpackResource(OCR_RESOURCES[name]);}
export class CaptionOcr {
  private worker:Worker|null=null;
  private sequence=0;
  private generation=0;
  private pending=new Map<string,{resolve:(value:unknown)=>void;reject:(reason:Error)=>void;timer:number}>();
  private initialized:Promise<void>|null=null;
  private queue:Promise<unknown>=Promise.resolve();
  private progress:((message:string)=>void)|undefined;
  private call(action:string,payload:Record<string,unknown>,wasm?:Uint8Array):Promise<unknown>{
    if(!this.worker)return Promise.reject(new Error('OCR 검사가 취소됐습니다.'));
    const jobId=String(++this.sequence);
    return new Promise((resolve,reject)=>{
      const timer=window.setTimeout(()=>{this.cancel(new Error('OCR 작업 시간이 초과되었습니다.'));},120000);
      this.pending.set(jobId,{resolve,reject,timer});this.worker!.postMessage({workerId:'journal-ocr',jobId,action,payload,wasm});
    });
  }
  private init():Promise<void>{
    if(this.initialized)return this.initialized;
    const generation=this.generation;
    const active=():void=>{if(generation!==this.generation)throw new Error('OCR 검사가 취소됐습니다.');};
    this.initialized=(async()=>{
      const url=URL.createObjectURL(new Blob([OCR_WORKER],{type:'application/javascript'}));
      try{this.worker=new Worker(url);}finally{URL.revokeObjectURL(url);}
      this.worker.onmessage=(event:MessageEvent<{jobId:string;status:string;data:unknown}>)=>{
        const {jobId,status,data}=event.data;
        if(status==='progress'){const progress=data as {status?:string;progress?:number};this.progress?.(`이미지 캡션 검사 · ${progress.status??''} ${Math.round((progress.progress??0)*100)}%`);return;}
        const pending=this.pending.get(jobId);if(!pending)return;window.clearTimeout(pending.timer);this.pending.delete(jobId);
        if(status==='resolve')pending.resolve(data);else pending.reject(new Error(String(data)));
      };
      this.worker.onerror=e=>this.cancel(new Error(e.message||'로컬 OCR 오류'));
      const wasm=await resource('wasm');active();await this.call('load',{options:{lstmOnly:true,logging:false}},wasm);
      const langs=await Promise.all((['eng','kor'] as const).map(async code=>({code,data:await resource(code)})));
      active();
      await this.call('loadLanguage',{langs,options:{cacheMethod:'none',gzip:false,lstmOnly:true}});
      await this.call('initialize',{langs:'eng+kor',oem:1,config:{}});
      await this.call('setParameters',{params:{tessedit_pageseg_mode:'11',user_defined_dpi:'300'}});
    })().catch(e=>{if(generation===this.generation)this.cancel(e instanceof Error?e:new Error(String(e)));throw e;});
    return this.initialized;
  }
  detect(asset:JournalAsset,bytes:Uint8Array,signal?:AbortSignal,progress?:(message:string)=>void):Promise<CaptionDetection>{
    const generation=this.generation;
    const job=this.queue.then(async()=>{
      const abort=():void=>this.cancel(new Error('OCR 검사가 취소됐습니다.'));
      if(signal?.aborted||generation!==this.generation)throw new Error('OCR 검사가 취소됐습니다.');
      signal?.addEventListener('abort',abort,{once:true});this.progress=progress;
      try{
        await this.init();if(signal?.aborted)throw new Error('OCR 검사가 취소됐습니다.');
        const preview=await assetPreview(bytes,asset.mime,signal);
        const image=await createImageBitmap(new Blob([preview.bytes.slice().buffer],{type:preview.mime}));
        const scale=Math.min(2,2400/Math.max(image.width,image.height)),width=Math.max(1,Math.round(image.width*scale)),height=Math.max(1,Math.round(image.height*scale));
        const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d');if(!ctx){image.close();throw new Error('이미지 검사 캔버스를 만들 수 없습니다.');}
        ctx.fillStyle='white';ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);image.close();
        const blob=await canvas.convertToBlob({type:'image/png'}),input=new Uint8Array(await blob.arrayBuffer());
        if(signal?.aborted||generation!==this.generation)throw new Error('OCR 검사가 취소됐습니다.');
        const output=await this.call('recognize',{image:input,options:{},output:{text:true,blocks:true}}) as {blocks?:{paragraphs?:{lines?:OcrLine[]}[]}[]};
        const lines=(output.blocks??[]).flatMap(b=>(b.paragraphs??[]).flatMap(p=>p.lines??[]));
        return {assetId:asset.id,assetSha256:asset.sha256,engine:OCR_VERSION,status:'complete' as const,candidates:captionCandidates(lines,width,height,ctx.getImageData(0,0,width,height).data)};
      }finally{signal?.removeEventListener('abort',abort);this.progress=undefined;}
    });this.queue=job.catch(()=>undefined);return job;
  }
  cancel(reason=new Error('OCR 검사가 취소됐습니다.')):void{
    this.generation++;
    this.worker?.terminate();this.worker=null;this.initialized=null;
    for(const p of this.pending.values()){window.clearTimeout(p.timer);p.reject(reason);}this.pending.clear();
  }
}
