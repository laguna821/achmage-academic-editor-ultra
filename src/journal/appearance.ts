import {publicationSuffix,canonicalDoi} from './publication';
import type {JournalPreset,JournalProject,JournalStyleRole} from "./types";

export type FontGroup="body"|"heading"|"auxiliary";
export interface JournalAppearance {
  version:1; kind:"academic"|"general"; referenceChecks:boolean;
  fonts:Partial<Record<FontGroup,string>>;
  substitutions?:Record<string,string>;
  colors:{key:string;rule:string;abstract:string};
  journalName:string;
  logo:{mode:"hnmr"|"none"|"asset";assetId?:string};
  mark:{mode:"crossmark"|"none"|"asset";assetId?:string;crossmark?:boolean};
  publicationText?:string;
  copyrightText?:string;
  leftHeader:{mode:"legacy"|"journal"|"title"|"text"|"none";text:string};
  rightHeader:{mode:"page"|"text"|"text-page"|"none";text:string};
}
export const FONT_GROUPS:Record<FontGroup,JournalStyleRole[]>={
  body:["body","abstract","table","caption","note","reference"],
  heading:["title","heading1","heading2","heading3","heading4","heading5","abstractLabel"],
  auxiliary:["publication","authors","affiliations","keywords","sidebar","sidebarLabel","copyright","runningHeader","pageNumber"]
};
export const academicChecks=(p:JournalProject):boolean=>p.preset.appearance?.kind!=="general";
export const referenceChecks=(p:JournalProject):boolean=>p.document.journalMetadata?.referenceChecks??p.preset.appearance?.referenceChecks??true;
export const TEXT_LIMITS={name:100,publication:400,copyright:1600,header:160,font:160} as const;
export const TEXT_TOKENS=["journal","year","copyrightYear","title","runningTitle","volume","issue","firstPage","lastPage","page","doi","publication","doiUrl"] as const;
export function validateAppearance(value:unknown):JournalAppearance{
  if(!value||typeof value!=="object")throw new Error("템플릿 외형 정보가 없습니다.");
  const a=value as JournalAppearance;
  const text=(v:unknown,max:number):boolean=>typeof v==="string"&&v.length<=max&&!Array.from(v).some(c=>c.charCodeAt(0)<32&&!"\t\n\r".includes(c));
  const templateText=(v:unknown,max:number):boolean=>text(v,max)&&!(v as string).match(/\{([^{}]+)\}/g)?.some(t=>!(TEXT_TOKENS as readonly string[]).includes(t.slice(1,-1)));
  if(a.version!==1||!["academic","general"].includes(a.kind)||typeof a.referenceChecks!=="boolean"||!a.fonts||!a.colors||!text(a.journalName,100))throw new Error("잘못된 저널 템플릿입니다.");
  for(const [key,font]of Object.entries(a.fonts))if(!Object.keys(FONT_GROUPS).includes(key)||!text(font,160)||!font.trim())throw new Error("잘못된 템플릿 글꼴입니다.");
  if(a.substitutions&&(!Object.keys(a.substitutions).length||Object.keys(a.substitutions).length>32||Object.entries(a.substitutions).some(([key,v])=>!text(key,160)||!key.trim()||!text(v,160)||!v.trim()||["__proto__","prototype","constructor"].includes(key))))throw new Error("잘못된 글꼴 대체 정보입니다.");
  for(const c of [a.colors.key,a.colors.rule,a.colors.abstract])if(typeof c!=="string"||!/^#[0-9a-f]{6}$/i.test(c))throw new Error("색상은 #RRGGBB 형식으로 입력하세요.");
  for(const [image,modes]of [[a.logo,["hnmr","none","asset"]],[a.mark,["crossmark","none","asset"]]] as const)if(!image||!(modes as readonly string[]).includes(image.mode)||image.mode==="asset"&&(!text(image.assetId,160)||!image.assetId))throw new Error("로고 파일을 선택하세요.");
  if(!a.leftHeader||!["legacy","journal","title","text","none"].includes(a.leftHeader.mode)||!templateText(a.leftHeader.text,160)||!a.rightHeader||!["page","text","text-page","none"].includes(a.rightHeader.mode)||!templateText(a.rightHeader.text,160))throw new Error("머리말 문구를 확인하세요.");
  for(const [value,max]of [[a.publicationText,400],[a.copyrightText,1600]] as const)if(value!==undefined&&!templateText(value,max))throw new Error("문구 길이나 삽입 변수를 확인하세요.");
  // Whitelist the public shape. Imported JSON cannot introduce engine settings.
  return {version:1,kind:a.kind,referenceChecks:a.referenceChecks,fonts:{...a.fonts},...(a.substitutions?{substitutions:{...a.substitutions}}:{}),colors:{key:a.colors.key,rule:a.colors.rule,abstract:a.colors.abstract},journalName:a.journalName,logo:{mode:a.logo.mode,assetId:a.logo.assetId},mark:{mode:a.mark.mode,assetId:a.mark.assetId,...(a.mark.crossmark===true?{crossmark:true}:{})},publicationText:a.publicationText,copyrightText:a.copyrightText,leftHeader:{mode:a.leftHeader.mode,text:a.leftHeader.text},rightHeader:{mode:a.rightHeader.mode,text:a.rightHeader.text}};
}
export function appearanceFromPreset(p:JournalPreset):JournalAppearance{
  if(p.appearance)return validateAppearance(p.appearance);
  const m=p.master;
  return {version:1,kind:"academic",referenceChecks:true,fonts:{},colors:{key:p.keyColor,rule:p.keyColor,abstract:p.abstract.fill},journalName:m?.journalName??"ACADEMIC EDITOR ULTRA",
    logo:m?.showLogo===false?{mode:"none"}:m?.logoAssetId?{mode:"asset",assetId:m.logoAssetId}:{mode:"none"},
    mark:m?.showCrossmark===false?{mode:"none"}:m?.crossmarkAssetId?{mode:"asset",assetId:m.crossmarkAssetId}:{mode:"none"},
    leftHeader:{mode:"legacy",text:""},rightHeader:{mode:"page",text:""}};
}
export function templateValues(p:JournalProject,page=1,lastPage=p.document.firstPage):Record<string,string>{
  const d=p.document,a=p.preset.appearance,issue=d.publication?.mode!=="aop";
  const journal=a?.journalName??p.preset.master?.journalName??"";
  return {publication:journal+publicationSuffix(d,lastPage),doiUrl:d.doi.trim()?"https://doi.org/"+canonicalDoi(d.doi):"",journal:a?.journalName??p.preset.master?.journalName??"",year:d.year,copyrightYear:d.publication?.copyrightYear?.trim()||d.year,title:d.title,runningTitle:d.runningTitle||d.title,doi:d.doi,
    volume:issue?d.volume:"",issue:issue?d.issue:"",firstPage:issue?String(d.firstPage):"",lastPage:issue?String(lastPage):"",page:issue?String(page):""};
}
export function resolveTemplateText(text:string,p:JournalProject,page=1,lastPage=p.document.firstPage):string{
  const values=templateValues(p,page,lastPage);
  return text.replace(/\{([^{}]+)\}/g,(_,key:string)=>values[key]??"");
}
export function customHeader(p:JournalProject,side:"left"|"right",page=1,lastPage=p.document.firstPage):string|undefined{
  const override=p.document.journalMetadata?.overrides[side==='left'?(page%2?'header-odd':'header-even'):'folio'];
  if(override!==undefined)return resolveTemplateText(override,p,page,lastPage);
  const a=p.preset.appearance;if(!a)return;
  if(side==="left"){
    const h=a.leftHeader;
    if(h.mode==="legacy")return;
    return h.mode==="none"?"":h.mode==="journal"?a.journalName:h.mode==="title"?p.document.runningTitle||p.document.title:resolveTemplateText(h.text,p,page,lastPage);
  }
  const h=a.rightHeader,num=p.document.publication?.mode==="aop"?"":String(page),text=resolveTemplateText(h.text,p,page,lastPage);
  return h.mode==="none"?"":h.mode==="page"?num:h.mode==="text"?text:[text,num].filter(Boolean).join(" · ");
}
