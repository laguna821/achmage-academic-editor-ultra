import {digestBytes,jsonBytes} from './storage';
import {cloneJournal,type BinaryStore,type JournalProject,type MarkdownDependency} from './types';
import {imageInfo} from './imageInfo';

export interface SourceImage {bytes:Uint8Array;mime?:string;name?:string;localPath?:string}
/** Remote bytes are immutable project snapshots until the user explicitly refreshes URLs. */
export function snapshotImages(store:BinaryStore,previous:MarkdownDependency[],load:(src:string)=>Promise<SourceImage>,refreshRemote=false){
  const dependencies:MarkdownDependency[]=[],pending=new Map<string,Promise<SourceImage>>();
  const resolve=(src:string):Promise<SourceImage>=>{
    const found=pending.get(src);if(found)return found;
    const task=(async()=>{
      if(src==='uploading'||/^paste[-_]/i.test(src))throw new Error('이미지 업로드가 아직 완료되지 않았습니다: '+src);
      const kind=/^https?:\/\//i.test(src)?'remote':/^data:/i.test(src)?'data':'local',old=previous.find(d=>d.src===src);
      if(kind==='remote'&&old&&!refreshRemote){const bytes=await store.get(old.path);if(bytes&&await digestBytes(bytes)===old.sha256){dependencies.push(cloneJournal(old));return {bytes,mime:old.mime,name:old.name};}}
      const file=await load(src);if(file.bytes.length>64*1024*1024)throw new Error('이미지는 64 MiB 이하여야 합니다.');
      const name=file.name??src.split(/[/?#]/).filter(Boolean).at(-1)??'image';
      const prefix=new TextDecoder().decode(file.bytes.slice(0,256));
      if(/text\/html/i.test(file.mime??'')||/^\s*<!doctype html|^\s*<html/i.test(prefix))throw new Error('이미지 대신 HTML 오류 페이지가 반환되었습니다: '+src);
      const info=imageInfo(file.bytes,name,file.mime);
      if(!info.mime.startsWith('image/')&&info.mime!=='application/pdf')throw new Error('지원하는 이미지/PDF 파일이 아닙니다: '+src);
      const sha256=await digestBytes(file.bytes),path='sources/'+sha256+'.image';await store.put(path,file.bytes);
      dependencies.push({src,kind,path,sha256,mime:file.mime??info.mime,name,checkedAt:old?.sha256===sha256?old.checkedAt:new Date().toISOString(),localPath:file.localPath});
      return {...file,name,mime:file.mime??info.mime};
    })();pending.set(src,task);return task;
  };
  return {resolve,dependencies};
}
/** Identical source objects retain identity and reviews. Changed content cannot inherit approval. */
export function reconcileMarkdown(previous:JournalProject,incoming:JournalProject):JournalProject{
  const next=cloneJournal(incoming),ids=new Map<string,string>();
  const shape=(value:unknown):string=>JSON.stringify(value,(k,v:unknown)=>['id','origin','sourceId','reviewed','confirmed','provenance','sort'].includes(k)?undefined:v);
  const mapTree=(fresh:unknown,old:unknown):void=>{
    if(!fresh||!old||typeof fresh!=='object'||typeof old!=='object')return;
    if(Array.isArray(fresh)&&Array.isArray(old)){fresh.forEach((v,i)=>mapTree(v,old[i]));return;}
    const f=fresh as Record<string,unknown>,o=old as Record<string,unknown>;
    if(typeof f.id==='string'&&typeof o.id==='string')ids.set(f.id,o.id);
    for(const key of Object.keys(f))if(key!=='origin')mapTree(f[key],o[key]);
  };
  for(const asset of next.assets){const old=previous.assets.find(a=>a.sha256===asset.sha256);if(old)ids.set(asset.id,old.id);}
  const remap=(value:unknown):void=>{if(!value||typeof value!=='object')return;for(const [k,v]of Object.entries(value)){if(typeof v==='string'&&ids.has(v))(value as Record<string,unknown>)[k]=ids.get(v)!;else remap(v);}};
  remap(next.document);
  const used=new Set<string>();
  for(const n of next.document.blocks){const old=previous.document.blocks.find(o=>!used.has(o.id)&&shape(o)===shape(n));if(old){used.add(old.id);mapTree(n,old);}}
  for(const [key,values]of [['abstract',next.document.abstract],['endMatter',next.document.endMatter??[]]] as const){const old=previous.document[key]??[];for(const item of values){const match=old.find(x=>shape(x)===shape(item));if(match){mapTree(item,match);if('reviewed' in match&&'kind' in item&&item.kind!=='paragraph'&&item.kind!=='heading')(item as import('./types').EndMatter).reviewed=match.reviewed;}}}
  for(const ref of next.references){const old=previous.references.find(r=>r.raw===ref.raw);if(old){ids.set(ref.id,old.id);ref.confirmed=old.confirmed;ref.sort=cloneJournal(old.sort??{authorKey:'',confirmed:false});}}
  remap(next);next.id=previous.id;next.created=previous.created;next.revision=previous.revision+1;next.modified=new Date().toISOString();
  next.overrides=cloneJournal(previous.overrides.filter(o=>used.has(o.id)||next.document.blocks.some(n=>n.id===o.id)));
  next.acknowledgements=Object.fromEntries(Object.entries(previous.acknowledgements).filter(([id])=>used.has(id.split(':')[0])||next.issues.some(i=>i.id===id&&previous.issues.some(j=>j.id===id&&j.message===i.message))));
  if(next.editorial)next.editorial.detections=cloneJournal(previous.editorial?.detections.filter(d=>next.assets.some(a=>a.sha256===d.assetSha256))??[]);
  return next;
}
export const sourceTextHash=(text:string):Promise<string>=>digestBytes(new TextEncoder().encode(text));
export function sourceLine(p:JournalProject,id:string,text:string):number{
  if(id.startsWith('property:')){const key=id.slice(9),line=text.split(/\r?\n/).findIndex(l=>l.startsWith(key+':'));return Math.max(0,line);}
  const all=[...p.document.blocks,...p.document.abstract,...(p.document.endMatter??[]).flatMap(e=>e.content)];
  const node=all.find(n=>n.id===id),ref=p.references.find(r=>r.id===id),origin=node?.origin??all.find(n=>ref?.sourceParagraphIds?.includes(n.id))?.origin;
  const match=origin?.path.match(/lines\[(\d+):/);if(match)return Number(match[1])-1;
  const key=origin?.path.match(/frontmatter\/([^/]+)/)?.[1];return key?Math.max(0,text.split(/\r?\n/).findIndex(l=>l.startsWith(key+':'))):0;
}
export async function projectSourceDigest(p:JournalProject):Promise<string>{return digestBytes(jsonBytes([p.document,p.sources.map(s=>s.sha256),p.assets.map(a=>a.sha256)]));}
