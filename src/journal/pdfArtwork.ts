import {PDFDocument, degrees, pushGraphicsState, popGraphicsState, rectangle, clip, endPath} from 'pdf-lib';
import {digestBytes} from './storage';
import type {BinaryStore, JournalAsset, JournalProject} from './types';

/** PDF artwork stays PDF. A transparent SVG is used only to measure its box. */
export async function selectPdfPage(bytes:Uint8Array,page=1):Promise<{bytes:Uint8Array;width:number;height:number;pages:number}>{
  const doc=await PDFDocument.load(bytes,{updateMetadata:false});
  if(!Number.isInteger(page)||page<1||page>doc.getPageCount())throw Error('PDF 그림의 페이지 번호를 확인하세요.');
  const src=doc.getPage(page-1),box=src.getCropBox(),rotation=((src.getRotation().angle%360)+360)%360;
  if(![0,90,180,270].includes(rotation))throw Error('지원하지 않는 PDF 페이지 회전입니다.');
  const swap=rotation===90||rotation===270,width=swap?box.height:box.width,height=swap?box.width:box.height;
  if(![width,height].every(n=>Number.isFinite(n)&&n>0))throw Error('PDF 그림 크기를 확인하세요.');
  if(doc.getPageCount()===1)return {bytes,width,height,pages:1};
  const selected=await PDFDocument.create();selected.addPage((await selected.copyPages(doc,[page-1]))[0]);
  return {bytes:await selected.save(),width,height,pages:doc.getPageCount()};
}
export {pdfMeasurePath} from "./imageInfo";
export function pdfMeasureSvg(a:JournalAsset):Uint8Array{
  return new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="${a.widthPt??100}" height="${a.heightPt??100}"/>`);
}
/** Upgrade retained PDF -> PNG derivatives on the composition copy. Never trace pixels. */
export async function preparePdfAssets(project:JournalProject,store:BinaryStore):Promise<Map<string,Uint8Array>>{
  const result=new Map<string,Uint8Array>(),originals=project.assets.map(a=>({...a}));
  const used=new Set<string>();
  const collect=(value:unknown):void=>{if(Array.isArray(value)){value.forEach(collect);return;}if(!value||typeof value!=="object")return;for(const [key,v]of Object.entries(value)){if(["assetId","logoAssetId","crossmarkAssetId"].includes(key)&&typeof v==="string")used.add(v);else collect(v);}};
  collect(project.document);collect(project.preset);
  for(const a of project.assets){
    if(!used.has(a.id))continue;
    const original=originals.find(o=>o.id===a.derivedFrom&&o.mime==='application/pdf');
    if(a.mime!=='application/pdf'&&!original)continue;
    const src=a.mime==='application/pdf'?a:original!,bytes=await store.get(src.path);
    if(!bytes)throw Error('원본 PDF 그림 파일이 없습니다: '+src.name);
    const match=a.name.match(/-page-(\d+)\.png$/i),page=src===a?1:match?Number(match[1]):1;
    const pdf=await selectPdfPage(bytes,page);
    if(src!==a&&pdf.pages>1&&!match)throw Error('기존 PDF 그림의 사용할 페이지를 다시 선택하세요: '+a.name);
    const sha256=await digestBytes(pdf.bytes),path=`assets/${sha256}.pdf`;
    if(path!==src.path)await store.put(path,pdf.bytes);
    // Normalized crop coordinates describe the same selected page. Keep a
    // previously confirmed crop valid when recovering its retained PDF source.
    const priorHash=a.sha256;
    for(const b of project.document.blocks)if(b.kind==='figure'&&b.assetId===a.id&&b.crop?.assetSha256===priorHash)b.crop.assetSha256=sha256;
    Object.assign(a,{mime:'application/pdf',name:src.name.replace(/\.pdf$/i,pdf.pages>1?`-page-${page}.pdf`:'.pdf'),sha256,path,bytes:pdf.bytes.length,widthPt:pdf.width,heightPt:pdf.height,aspectRatio:pdf.width/pdf.height});
    delete a.widthPx;delete a.heightPx;
    result.set(a.id,pdf.bytes);
  }
  return result;
}
export interface PdfArtworkPlacement {assetId:string;page:number;x:number;y:number;width:number;height:number;crop?:{x:number;y:number;width:number;height:number}}
/** Embed the original page as a PDF Form XObject; no bitmap or font substitution. */
export async function placePdfArtwork(pdf:Uint8Array,assets:Map<string,Uint8Array>,placements:PdfArtworkPlacement[]):Promise<Uint8Array>{
  if(!placements.length)return pdf;
  const out=await PDFDocument.load(pdf,{updateMetadata:false});
  const embedded=new Map<string,{page:Awaited<ReturnType<PDFDocument['embedPage']>>;rotation:number;width:number;height:number}>();
  for(const p of placements){
    if(!embedded.has(p.assetId)){
      const bytes=assets.get(p.assetId);if(!bytes)throw Error('PDF 그림 원본이 없습니다: '+p.assetId);
      const source=await PDFDocument.load(bytes,{updateMetadata:false}),page=source.getPage(0),b=page.getCropBox(),rotation=((page.getRotation().angle%360)+360)%360;
      embedded.set(p.assetId,{page:await out.embedPage(page,{left:b.x,bottom:b.y,right:b.x+b.width,top:b.y+b.height}),rotation,width:rotation%180?b.height:b.width,height:rotation%180?b.width:b.height});
    }
    const a=embedded.get(p.assetId)!,page=out.getPage(p.page-1),crop=p.crop;
    let w=p.width,h=p.height,x=p.x,y=p.y;
    if(crop){w/=crop.width;h/=crop.height;x-=w*crop.x;y-=h*crop.y;page.pushOperators(pushGraphicsState(),rectangle(p.x,page.getHeight()-p.y-p.height,p.width,p.height),clip(),endPath());}
    else {const fit=Math.min(w/a.width,h/a.height);const nw=a.width*fit,nh=a.height*fit;x+=(w-nw)/2;y+=(h-nh)/2;w=nw;h=nh;}
    y=page.getHeight()-y-h;
    const rot=a.rotation;
    page.drawPage(a.page,{x:x+(rot===180||rot===270?w:0),y:y+(rot===90||rot===180?h:0),width:rot%180?h:w,height:rot%180?w:h,rotate:degrees(rot===90?-90:rot===270?90:rot)});
    if(crop)page.pushOperators(popGraphicsState());
  }
  return out.save();
}
