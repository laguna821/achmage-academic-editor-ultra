import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Screen/OCR pixels only. Callers must keep the source asset bytes unchanged. */
export async function assetPreview(bytes:Uint8Array,mime:string,signal?:AbortSignal):Promise<{bytes:Uint8Array;mime:string}>{
  if(mime!=='application/pdf')return {bytes,mime};
  const active=():void=>{if(signal?.aborted)throw new DOMException('그림 미리보기가 취소됐습니다.','AbortError');};
  active();
  const task=getDocument({data:bytes.slice(),isEvalSupported:false,useSystemFonts:false,isOffscreenCanvasSupported:false,isImageDecoderSupported:false});
  const abort=():void=>{void task.destroy();};signal?.addEventListener('abort',abort,{once:true});
  const canvas=createEl('canvas');
  try{
    const pdf=await task.promise;active();const page=await pdf.getPage(1),base=page.getViewport({scale:1});
    const viewport=page.getViewport({scale:Math.min(3,1800/Math.max(base.width,base.height))});
    canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    const context=canvas.getContext('2d');if(!context)throw Error('그림 미리보기를 만들 수 없습니다.');
    await page.render({canvasContext:context,viewport}).promise;active();
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PDF 미리보기를 만들 수 없습니다.')),'image/png'));
    return {bytes:new Uint8Array(await blob.arrayBuffer()),mime:'image/png'};
  }finally{canvas.width=canvas.height=0;signal?.removeEventListener('abort',abort);await task.destroy();}
}
