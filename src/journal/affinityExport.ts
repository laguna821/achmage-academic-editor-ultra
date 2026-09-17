import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {JournalEngine} from './engine';
import {digestBytes} from './storage';
import {afFontFaces} from '../io/affinity/fonts';
import {afActive,afPreflight,exportAf} from '../io/affinity/export';
import {withContinuationPages} from '../io/affinity/continuation';
import type {AfFont,AfResource,AfExportResult,AfProgress,AfExportOptions} from '../io/affinity/types';
import type {EditableLayoutSnapshot,EditRect} from '../io/editableLayout';
import type {JournalProject,BinaryStore} from './types';

function checkSvg(bytes:Uint8Array):void{
  const xml=new TextDecoder().decode(bytes),doc=new DOMParser().parseFromString(xml,'image/svg+xml');
  if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg'||doc.querySelector('script,foreignObject'))throw Error('SVG 그림 형식을 확인하세요.');
  for(const el of Array.from(doc.querySelectorAll('*')))for(const attr of Array.from(el.attributes)){
    if(/^on/i.test(attr.name)||/href$/i.test(attr.name)&&!attr.value.startsWith('#')&&!/^data:image\/(png|jpeg);base64,/i.test(attr.value))throw Error('외부 파일·스크립트를 참조하는 SVG는 AF로 내보낼 수 없습니다.');
  }
  if(/@import/i.test(xml)||Array.from(xml.matchAll(/url\(([^)]*)\)/gi)).some(m=>!/^#[\w:.-]+$/.test(m[1].trim().replace(/^['"]|['"]$/g,''))))throw Error('외부 리소스를 참조하는 SVG를 확인하세요.');
}
export async function prepareAfResources(s:EditableLayoutSnapshot,engine:JournalEngine,options:AfProgress={}):Promise<AfResource[]>{
  const result:AfResource[]=[];let total=0;
  for(const [i,a]of s.assets.entries()){
    if(!s.images.some(image=>image.assetId===a.id))continue;
    afActive(options.signal);options.progress?.(`그림 준비 ${i+1}/${s.assets.length} · ${a.name}`);
    if(a.bytes.length>64*1024*1024||(total+=a.bytes.length)>256*1024*1024)throw Error('AF 그림 용량은 그림당 64MB·합계 256MB까지 지원합니다.');
    let bytes=a.bytes;
    if(a.mime!=='application/pdf'){
      const extension:Record<string,string>={'image/svg+xml':'svg','image/png':'png','image/jpeg':'jpg'};
      const ext=extension[a.mime];if(!ext)throw Error(`${a.name}: AF는 PNG·JPEG·SVG·단일 페이지 PDF 그림을 지원합니다.`);
      if(ext==='svg')checkSvg(bytes);
      const file='/af-image.'+ext;
      const converted=await engine.compile(`#set document(date:none)\n#set page(width:auto,height:auto,margin:0pt)\n#image(${JSON.stringify(file)},width:100pt)`,[{path:file,bytes}],true);
      if(!converted.pdf)throw Error(`${a.name}: 그림 변환 결과가 없습니다.`);bytes=converted.pdf;
    }
    afActive(options.signal);
    options.progress?.(`그림 미리보기 ${i+1}/${s.assets.length} · ${a.name}`);
    // Obsidian's in-process PDF worker can stall in the offscreen bitmap path.
    // Use the canvas decoder for this small preview; embedded PDF bytes stay intact.
    const task=getDocument({data:bytes.slice(),isEvalSupported:false,useSystemFonts:false,disableFontFace:false,isOffscreenCanvasSupported:false,isImageDecoderSupported:false});
    const abort=():void=>{void task.destroy();};options.signal?.addEventListener('abort',abort,{once:true});
    try{
      const pdf=await task.promise;afActive(options.signal);
      options.progress?.(`그림 페이지 읽기 ${i+1}/${s.assets.length} · ${a.name}`);
      if(pdf.numPages!==1)throw Error(`${a.name}: 그림 PDF는 한 페이지만 선택해서 등록하세요.`);
      const page=await pdf.getPage(1),base=page.getViewport({scale:1});
      const placed=s.images.filter(image=>image.assetId===a.id);
      const display=Math.max(...placed.map(image=>Math.min(image.width/base.width,image.height/base.height)));
      // Cache at 600 dpi of placed size, independent of the source PDF page size.
      const scale=Math.min(Math.max(2,display*600/72),2400/Math.max(base.width,base.height),Math.sqrt(4_000_000/(base.width*base.height)));
      if(![base.width,base.height].every(n=>Number.isFinite(n)&&n>0))throw Error(`${a.name}: 그림 크기가 올바르지 않습니다.`);
      const viewport=page.getViewport({scale}),canvas=createEl('canvas');
      canvas.width=Math.max(1,Math.ceil(viewport.width));canvas.height=Math.max(1,Math.ceil(viewport.height));
      const context=canvas.getContext('2d');if(!context)throw Error('그림 미리보기를 만들 수 없습니다.');
      try{
        options.progress?.(`그림 미리보기 그리기 ${i+1}/${s.assets.length} · ${a.name}`);
        await page.render({canvasContext:context,viewport,background:'rgba(0,0,0,0)'}).promise;afActive(options.signal);
        const pixels=context.getImageData(0,0,canvas.width,canvas.height);
        result.push({id:a.id,name:a.name.replace(/\.[^.]+$/,''),mime:'application/pdf',bytes,width:base.width,height:base.height,preview:new Uint8Array(pixels.data),previewWidth:canvas.width,previewHeight:canvas.height});
      }finally{canvas.width=canvas.height=0;}
    }finally{options.signal?.removeEventListener('abort',abort);await task.destroy();}
  }
  return result;
}

export async function journalAfExport(project:JournalProject,store:BinaryStore,snapshot:EditableLayoutSnapshot,pdf:Uint8Array,options:AfExportOptions&{continuationPages?:number;columns?:EditRect[]}={}):Promise<AfExportResult>{
  const fonts:AfFont[]=[],fontBytes:Uint8Array[]=[];
  options.progress?.('조판에 사용한 글꼴을 확인하는 중…');
  for(const path of new Set(project.fonts.map(f=>f.path))){
    afActive(options.signal);const bytes=await store.get(path),expected=project.fonts.filter(f=>f.path===path);
    if(!bytes||expected.some(f=>!f.sha256))throw Error('등록한 글꼴 파일을 확인하세요.');
    const hash=await digestBytes(bytes);if(expected.some(f=>f.sha256!==hash))throw Error('조판에 사용한 글꼴 파일이 변경됐습니다. 다시 등록하고 조판하세요.');
    fontBytes.push(bytes);fonts.push(...afFontFaces(bytes));
  }
  const s=withContinuationPages(snapshot,options.continuationPages??0,options.columns??[]);
  const errors=afPreflight(s,fonts).filter(i=>i.severity==='error');if(errors.length)throw Error(errors.slice(0,6).map(i=>i.message).join('\n'));
  const engine=new JournalEngine(),abort=():void=>engine.cancel();
  options.signal?.addEventListener('abort',abort,{once:true});
  try{
    afActive(options.signal);
    if(s.assets.some(a=>a.mime!=='application/pdf'))await engine.initialize(fontBytes);
    afActive(options.signal);const resources=await prepareAfResources(s,engine,options);
    return await exportAf(s,resources,fonts,pdf,{...options,pageLayout:options.pageLayout??'facing'});
  }finally{options.signal?.removeEventListener('abort',abort);engine.dispose();}
}
