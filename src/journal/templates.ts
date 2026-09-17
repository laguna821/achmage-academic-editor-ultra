import JSZip from "jszip";
import { appearanceFromPreset,validateAppearance,type JournalAppearance } from "./appearance";
import { HNMR_PRESET } from "./project";
import { resolvedMaster } from "./master";
import { digestBytes,jsonBytes } from "./storage";
import {cloneJournal,newId,type BinaryStore,type JournalAsset,type JournalProject} from "./types";

export interface JournalTemplate {format:"hanmark-journal-template";version:1;id:string;name:string;appearance:JournalAppearance;assets:JournalAsset[]}
export const HNMR_TEMPLATE:JournalTemplate={format:"hanmark-journal-template",version:1,id:"builtin:hnmr",name:"HNMR 기본",appearance:appearanceFromPreset(HNMR_PRESET),assets:[]};
export const GENERAL_TEMPLATE:JournalTemplate={...cloneJournal(HNMR_TEMPLATE),id:"builtin:general",name:"일반 간행물",appearance:{...cloneJournal(HNMR_TEMPLATE.appearance),kind:"general",referenceChecks:false,journalName:"",logo:{mode:"none"},mark:{mode:"none"},publicationText:"{journal}",copyrightText:"",leftHeader:{mode:"title",text:""},rightHeader:{mode:"page",text:""}}};
export const blankTemplate=():JournalTemplate=>({...cloneJournal(GENERAL_TEMPLATE),id:newId("template"),name:"내 템플릿"});
export function validateTemplate(value:unknown):JournalTemplate{
  if(!value||typeof value!=="object")throw new Error("저널 템플릿이 아닙니다.");
  const t=value as JournalTemplate;
  if(t.format!=="hanmark-journal-template"||t.version!==1||typeof t.id!=="string"||!t.id||t.id.length>160||typeof t.name!=="string"||!t.name.trim()||t.name.length>100||!Array.isArray(t.assets)||t.assets.length>4)throw new Error("지원하지 않는 저널 템플릿입니다.");
  const appearance=validateAppearance(t.appearance);
  const assets=t.assets.map(a=>{
    if(!a||typeof a.id!=="string"||!a.id||typeof a.name!=="string"||a.name.length>250||!/^image\/(png|jpeg|svg\+xml)$|^application\/pdf$/.test(a.mime)||!Number.isInteger(a.bytes)||a.bytes<1||a.bytes>20*1024*1024||!/^[a-f0-9]{64}$/.test(a.sha256)||!new RegExp("^assets/"+a.sha256+"\\.(png|jpg|jpeg|pdf|svg)$").test(a.path))throw new Error("잘못된 템플릿 로고 파일입니다.");
    return cloneJournal(a);
  });
  if(new Set(assets.map(a=>a.id)).size!==assets.length)throw new Error("중복된 로고 ID입니다.");
  for(const image of [appearance.logo,appearance.mark])if(image.mode==="asset"&&!assets.some(a=>a.id===image.assetId))throw new Error("템플릿 로고가 없습니다.");
  return {format:"hanmark-journal-template",version:1,id:t.id,name:t.name.trim(),appearance,assets};
}
export function templateFromProject(p:JournalProject):JournalTemplate{
  const appearance=appearanceFromPreset(p.preset),ids=[appearance.logo.assetId,appearance.mark.assetId];
  const selected=p.assets.filter(a=>ids.includes(a.id)),originals=selected.flatMap(a=>a.derivedFrom?[a.derivedFrom]:[]);
  return {format:"hanmark-journal-template",version:1,id:p.preset.template?.id??newId("template"),name:p.preset.template?.name??"현재 프로젝트 템플릿",appearance,assets:cloneJournal(p.assets.filter(a=>ids.includes(a.id)||originals.includes(a.id)))};
}
/** Only the permitted appearance changes. Existing geometry and article fields survive. */
export function applyTemplate(p:JournalProject,t:JournalTemplate):void{
  const a=validateAppearance(t.appearance),previous=p.preset.keyColor;
  p.preset.appearance=a;p.preset.template={id:t.id,name:t.name,version:1};
  p.preset.keyColor=a.colors.key;p.preset.abstract.fill=a.colors.abstract;
  for(const s of Object.values(p.preset.textStyles??{}))if(s?.color===previous)s.color=a.colors.key;
  const m=resolvedMaster(p.preset);
  p.preset.master={...m,journalName:a.journalName,showLogo:a.logo.mode!=="none",showCrossmark:a.mark.mode!=="none",logoAssetId:a.logo.mode==="asset"?a.logo.assetId:undefined,crossmarkAssetId:a.mark.mode==="asset"?a.mark.assetId:undefined};
  for(const asset of t.assets){const existing=p.assets.find(a=>a.id===asset.id);if(existing&&existing.sha256!==asset.sha256)throw new Error("원고와 템플릿의 로고 ID가 충돌합니다.");if(!existing)p.assets.push(cloneJournal(asset));}
}
export async function copyTemplateAssets(t:JournalTemplate,from:BinaryStore,to:BinaryStore):Promise<void>{
  for(const a of t.assets){const bytes=await from.get(a.path);if(!bytes||await digestBytes(bytes)!==a.sha256)throw new Error("로고 파일이 없거나 바뀌었습니다: "+a.name);await to.put(a.path,bytes);}
}
export class JournalTemplateLibrary{
  private queue:Promise<unknown>=Promise.resolve();
  constructor(readonly store:BinaryStore){}
  async list():Promise<JournalTemplate[]>{
    const bytes=await this.store.get("templates.json");
    if(!bytes)return [cloneJournal(HNMR_TEMPLATE),cloneJournal(GENERAL_TEMPLATE)];
    if(bytes.length>1024*1024)throw new Error("템플릿 목록이 너무 큽니다.");
    const value:unknown=JSON.parse(new TextDecoder().decode(bytes));if(!Array.isArray(value)||value.length>100)throw new Error("템플릿 목록 형식이 잘못됐습니다.");
    return [cloneJournal(HNMR_TEMPLATE),cloneJournal(GENERAL_TEMPLATE),...value.map(validateTemplate).filter(t=>!t.id.startsWith("builtin:"))];
  }
  private update(fn:(list:JournalTemplate[])=>JournalTemplate[]):Promise<void>{
    const task=this.queue.then(async()=>{const list=fn((await this.list()).filter(t=>!t.id.startsWith("builtin:")));if(list.length>100)throw new Error("템플릿은 최대 100개까지 저장할 수 있습니다.");await this.store.put("templates.json",jsonBytes(list));});
    this.queue=task.catch(()=>undefined);return task;
  }
  async save(input:JournalTemplate,source:BinaryStore):Promise<JournalTemplate>{
    const t=validateTemplate(input);
    if(t.id.startsWith("builtin:")){
      const original=[HNMR_TEMPLATE,GENERAL_TEMPLATE].find(b=>b.id===t.id);
      if(original&&JSON.stringify(validateTemplate(original))===JSON.stringify(t))return cloneJournal(original);
      t.id=newId("template");if(original&&t.name===original.name)t.name+=" 복사";
    }
    await copyTemplateAssets(t,source,this.store);
    await this.update(list=>[...list.filter(x=>x.id!==t.id),t]);return t;
  }
  remove(id:string):Promise<void>{if(id.startsWith("builtin:"))throw new Error("기본 템플릿은 삭제할 수 없습니다.");return this.update(list=>list.filter(t=>t.id!==id));}
}
export async function exportTemplate(input:JournalTemplate,store:BinaryStore):Promise<Uint8Array>{
  const t=validateTemplate(input),zip=new JSZip();zip.file("template.json",jsonBytes(t));
  for(const a of t.assets){const bytes=await store.get(a.path);if(!bytes||await digestBytes(bytes)!==a.sha256)throw new Error("로고 파일이 없습니다.");zip.file(a.path,bytes);}
  return zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
}
export async function importTemplate(bytes:Uint8Array,store:BinaryStore):Promise<JournalTemplate>{
  if(bytes.length>40*1024*1024)throw new Error("템플릿 파일은 40MB 이하여야 합니다.");
  const zip=await JSZip.loadAsync(bytes);if(Object.keys(zip.files).length>12)throw new Error("템플릿에 파일이 너무 많습니다.");
  const meta=zip.file("template.json");if(!meta)throw new Error("저널 템플릿 ZIP이 아닙니다.");
  const raw=await meta.async("string");if(raw.length>65536)throw new Error("템플릿 정보가 너무 큽니다.");
  const t=validateTemplate(JSON.parse(raw) as unknown),files:{path:string;bytes:Uint8Array}[]=[];let total=0;
  for(const a of t.assets){const file=zip.file(a.path);if(!file)throw new Error("로고 파일 누락");const bytes=await file.async("uint8array");total+=bytes.length;if(total>40*1024*1024||bytes.length!==a.bytes||await digestBytes(bytes)!==a.sha256)throw new Error("로고 파일 검증 실패");files.push({path:a.path,bytes});}
  for(const f of files)await store.put(f.path,f.bytes);t.id=newId("template");return t;
}
