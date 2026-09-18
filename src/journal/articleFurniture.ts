import {appearanceFromPreset} from './appearance';
import type {JournalProject} from './types';

/** Apply article overrides only to the composition snapshot; the shared template stays intact. */
export function applyArticleOverrides(p:JournalProject):void{
  const meta=p.document.journalMetadata;if(!meta)return;
  const a=appearanceFromPreset(p.preset),o=meta.overrides;
  if(o.publication!==undefined)a.publicationText=o.publication;
  if(o.copyright!==undefined)a.copyrightText=o.copyright;
  if(o.folio!==undefined)a.rightHeader={mode:'text',text:o.folio};
  if(meta.referenceChecks!==undefined)a.referenceChecks=meta.referenceChecks;
  p.preset.appearance=a;
}
export interface SidebarItem {id:string;label:string;text:string;separate:boolean}
export function sidebarItems(p:JournalProject):SidebarItem[]{
  const d=p.document,m=d.journalMetadata;
  const correspondence=m?.correspondence??d.authors.filter(a=>a.corresponding).map(a=>[a.name,a.address||a.affiliations.map(index=>d.affiliations[Number(index)-1]??'').join('\n'),a.email?'Email: '+a.email:''].filter(Boolean).join('\n')).join('\n\n');
  const dates:SidebarItem[]=[['received','Received: ',d.received],['revised','Revised: ',d.revised],['accepted','Accepted: ',d.accepted]].filter(([, ,v])=>!!v).map(([id,label,text])=>({id,label,text,separate:false}));
  const corr:SidebarItem[]=correspondence.trim()?[{id:'correspondence',label:'Corresponding author:',text:correspondence,separate:true}]:[];
  const custom=(m?.sidebar??[]).filter(s=>s.text.trim()).map(s=>({...s,separate:true}));
  const all=[...dates,...corr,...custom],order=m?.sidebarOrder??['received','revised','accepted','correspondence','custom'];
  const requested=order.flatMap(id=>id==='custom'?custom:all.filter(s=>s.id===id));
  return [...new Map([...requested,...all].map(item=>[item.id,item])).values()].filter(item=>!m?.hiddenSidebar.includes(item.id));
}
export const headerOverride=(p:JournalProject,page:number):string|undefined=>p.document.journalMetadata?.overrides[page%2?'header-odd':'header-even'];
