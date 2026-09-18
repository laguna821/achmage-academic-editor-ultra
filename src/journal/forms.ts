import {t} from './i18n';
import { Modal, type App } from "obsidian";
import type { ReferenceRecord, ReferenceType } from "./types";
import { cloneJournal } from "./types";
import { splitAuthor } from "./references";

export function action(host:HTMLElement,text:string,run:()=>void|Promise<void>):HTMLButtonElement{
  const button=host.createEl("button",{text,attr:{type:"button"}});button.onclick=()=>{void run();};return button;
}
export function field(host:HTMLElement,label:string,value:string,change:(value:string)=>void,multiline=false):HTMLInputElement|HTMLTextAreaElement{
  const row=host.createEl("label",{cls:"aaeu-journal-field"});row.createSpan({text:label});
  const input=multiline?row.createEl("textarea"):row.createEl("input",{type:"text"});
  input.setAttribute("aria-label",label);
  input.value=value;input.onchange=()=>change(input.value);return input;
}
export function choose(host:HTMLElement,label:string,value:string,choices:Record<string,string>,change:(value:string)=>void):HTMLSelectElement{
  const row=host.createEl("label",{cls:"aaeu-journal-field"});row.createSpan({text:label});const select=row.createEl("select");
  select.setAttribute("aria-label",label);
  for(const [id,text]of Object.entries(choices))select.createEl("option",{text,value:id});select.value=value;select.onchange=()=>change(select.value);return select;
}
export function textDialog(app:App,title:string,label:string,value:string,multiline=false):Promise<string|null>{
  return new Promise(resolve=>{
    const modal=new Modal(app);modal.titleEl.setText(title);let result:string|null=null;
    const input=field(modal.contentEl,label,value,()=>undefined,multiline);
    action(modal.contentEl,t("확인"),()=>{result=input.value;modal.close();});action(modal.contentEl,t("취소"),()=>modal.close());
    modal.onClose=()=>resolve(result);modal.open();input.focus();
  });
}
export function referenceDialog(app:App,reference:ReferenceRecord):Promise<ReferenceRecord|null>{
  return new Promise(resolve=>{
    const modal=new Modal(app),r=cloneJournal(reference);let result:ReferenceRecord|null=null;
    modal.titleEl.setText(t("참고문헌 서지정보"));
    if(r.raw)modal.contentEl.createEl("p",{text:r.raw,cls:"aaeu-journal-original"});
    choose(modal.contentEl,t("자료 유형"),r.type,{"article-journal":t("학술지 논문"),book:t("책"),chapter:t("편저서 장"),report:t("보고서"),webpage:t("웹페이지"),thesis:t("학위논문"),"paper-conference":t("학술대회"),dataset:t("데이터"),software:t("소프트웨어"),unknown:t("미확인")},v=>r.type=v as ReferenceType);
    field(modal.contentEl,"저자 · 한 줄에 성, 이름 또는 단체명",r.author.map(a=>a.literal??`${a.family??""}, ${a.given??""}`).join("\n"),v=>r.author=v.split("\n").filter(v=>v.trim()).map(splitAuthor),true);
    const labels:Partial<Record<keyof ReferenceRecord,string>>={title:"제목 · 고유명사를 보존한 문장식 대소문자",year:t("연도"),containerTitle:"학술지·책·사이트명",volume:t("권"),issue:t("호"),pages:t("쪽"),publisher:"출판사",edition:"판",doi:"DOI",url:"URL",accessed:"조회 날짜 (YYYY-MM-DD)",number:"보고서 번호",genre:"자료 설명",institution:"기관",version:"버전"};
    for(const [key,label]of Object.entries(labels))field(modal.contentEl,label,typeof r[key as keyof ReferenceRecord]==="string"?r[key as keyof ReferenceRecord] as string:"",v=>{(r as unknown as Record<string,unknown>)[key]=v;});
    field(modal.contentEl,"편집자 · 한 줄에 성, 이름",r.editors?.map(a=>a.literal??`${a.family??""}, ${a.given??""}`).join("\n")??"",v=>r.editors=v.split("\n").filter(v=>v.trim()).map(splitAuthor),true);
    choose(modal.contentEl,"날짜 없는 자료",r.knownNoDate?"yes":"no",{no:t("아니요"),yes:t("실제 무연도 자료")},v=>r.knownNoDate=v==="yes");
    choose(modal.contentEl,"내용 변경 가능",r.changing?"yes":"no",{no:t("고정된 자료"),yes:t("계속 변경됨")},v=>r.changing=v==="yes");
    action(modal.contentEl,t("서지정보 확정"),()=>{r.confirmed=true;r.provenance.push({source:"Editor confirmation",date:new Date().toISOString(),fields:Object.keys(r)});result=r;modal.close();});
    action(modal.contentEl,t("미확정으로 저장"),()=>{r.confirmed=false;result=r;modal.close();});action(modal.contentEl,t("취소"),()=>modal.close());
    modal.onClose=()=>resolve(result);modal.open();
  });
}
