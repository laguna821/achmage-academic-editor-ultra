import {applyMarkdownProperties,indexed, type PropertySpec} from './markdownProperties';
import {cloneJournal,inlineText,newId,type JournalProject} from './types';
import {academicChecks} from './appearance';


const valueText=(value:unknown):string=>typeof value==='string'?value:typeof value==='number'||typeof value==='boolean'?String(value):'';
export function fieldRequirement(p:JournalProject,s:PropertySpec):'required'|'recommended'|'optional'{
  if(!academicChecks(p)&&s.requirement==='required')return 'optional';
  if(['aaeu-volume','aaeu-issue'].includes(s.key))return p.document.publication?.mode==='issue'?'required':'optional';
  return s.requirement;
}
/** Resolve the actual field source without creating a second metadata copy. */
export function manuscriptPropertySource(p:JournalProject,key:string,values:Record<string,unknown>):{kind:'yaml'|'body'|'new';key:string;value?:unknown;line?:number}{
  const hasValue=(value:unknown)=>value!==undefined&&value!==null&&value!=='';
  if(hasValue(values[key]))return {kind:'yaml',key,value:values[key]};
  const aliases:Record<string,string>={'aaeu-running-title':'runningTitle','aaeu-running-authors':'runningAuthors','aaeu-first-page':'firstPage'};
  const plain=key.slice(5),alias=aliases[key]??(['title','abstract','keywords','doi','volume','issue','year','received','revised','accepted'].includes(plain)?plain:'');
  if(alias&&hasValue(values[alias]))return {kind:'yaml',key:alias,value:values[alias]};
  const nodes=key==='aaeu-abstract'?p.document.abstract:key==='aaeu-title'||key==='aaeu-keywords'?(p.document.importedMetadata??[]).filter(m=>m.field===plain).flatMap(m=>m.blocks):p.document.endMatter?.find(e=>key===`aaeu-${e.kind}-text`)?.content??[];
  const body=nodes.filter(n=>n.origin?.path.includes('/lines[')),line=body[0]?.origin?.path.match(/lines\[(\d+):/);
  if(line)return {kind:'body',key,line:Number(line[1])-1,value:key==='aaeu-title'?p.document.title:key==='aaeu-keywords'?p.document.keywords:body.map(n=>inlineText(n.content)).join('\n\n')};
  return {kind:'new',key,value:values[key]};
}
export function manuscriptProperties(p:JournalProject):Record<string,unknown>{
  if(p.markdown)return p.markdown.properties;
  const d=p.document,m:Record<string,unknown>={};
  for(const key of ['title','doi','year','volume','issue','received','revised','accepted'] as const)m['aaeu-'+key]=d[key];
  Object.assign(m,{'aaeu-template':p.preset.template?.id,'aaeu-running-title':d.runningTitle,'aaeu-running-authors':d.runningAuthors,'aaeu-first-page':d.firstPage,'aaeu-publication-mode':d.publication?.mode??'issue','aaeu-copyright-year':d.publication?.copyrightYear??'','aaeu-abstract':d.abstract.map(a=>inlineText(a.content)).join('\n\n'),'aaeu-keywords':d.keywords,'aaeu-reference-checks':d.journalMetadata?.referenceChecks??true});
  const corresponding=d.authors.find(a=>a.corresponding),explicit=d.journalMetadata?.correspondence?.split('\n');
  m['aaeu-corresponding-name']=explicit?.[0]??corresponding?.name??'';
  m['aaeu-corresponding-email']=explicit?.find(l=>/^Email:\s*/i.test(l))?.replace(/^Email:\s*/i,'')??corresponding?.email??'';
  m['aaeu-corresponding-address']=explicit?.slice(1).filter(l=>!/^Email:/i.test(l)).join('\n')??corresponding?.address??'';
  d.authors.forEach((a,i)=>{for(const k of ['name','affiliations','email','address','corresponding'] as const)m[`aaeu-author-${i+1}-${k}`]=a[k]??'';});
  d.affiliations.forEach((a,i)=>{m[`aaeu-affiliation-${i+1}-text`]=a;});
  for(const e of d.endMatter??[])if(e.kind!=='custom'){m[`aaeu-${e.kind}-text`]=e.content.map(n=>inlineText(n.content)).join('\n\n');m[`aaeu-${e.kind}-hide`]=!e.enabled;m[`aaeu-${e.kind}-omission-reason`]=e.omissionReason??'';}
  (d.endMatter??[]).filter(e=>e.kind==='custom').forEach((e,i)=>{m[`aaeu-statement-${i+1}-title`]=e.title;m[`aaeu-statement-${i+1}-text`]=e.content.map(n=>inlineText(n.content)).join('\n\n');m[`aaeu-statement-${i+1}-hide`]=!e.enabled;});
  for(const [k,v]of Object.entries(d.journalMetadata?.overrides??{})){m[`aaeu-${k}-text`]=v;m[`aaeu-${k}-hide`]=v==='';}
  if(d.journalMetadata){m['aaeu-sidebar-order']=d.journalMetadata.sidebarOrder;for(const key of d.journalMetadata.hiddenSidebar)m[`aaeu-sidebar-${key}-hide`]=true;for(const [i,s]of d.journalMetadata.sidebar.entries()){m[`aaeu-sidebar-${i+1}-label`]=s.label;m[`aaeu-sidebar-${i+1}-text`]=s.text;m[`aaeu-sidebar-${i+1}-hide`]=d.journalMetadata.hiddenSidebar.includes(s.id);}}
  return m;
}
/** Word keeps rich runs and review identities unless that field was actually edited. */
export function updateWordProperties(p:JournalProject,changes:Record<string,unknown>):void{
  const values={...manuscriptProperties(p),...changes},next=cloneJournal(p),d=p.document;
  const plain=(key:string)=>valueText(values['aaeu-'+key]??'');
  applyMarkdownProperties(next,values,'editor');
  for(const key of ['title','doi','year','volume','issue','received','revised','accepted'] as const)if('aaeu-'+key in changes)d[key]=plain(key);
  for(const key of ['running-title','running-authors','first-page','publication-mode','copyright-year','keywords','abstract'])if('aaeu-'+key in changes){
    if(key==='running-title')d.runningTitle=plain(key);else if(key==='running-authors')d.runningAuthors=plain(key);
    else if(key==='first-page')d.firstPage=Number(values['aaeu-'+key]);else if(key==='keywords')d.keywords=next.document.keywords;
    else if(key==='abstract')d.abstract=plain(key).trim()?next.document.abstract:[];
    else d.publication=next.document.publication;
  }
  if(Object.keys(changes).some(k=>/^aaeu-(author|affiliation)-/.test(k))){
    const aff=indexed(values,'affiliation').filter(n=>values[`aaeu-affiliation-${n}-text`]!==undefined);
    d.affiliations=aff.map(n=>valueText(values[`aaeu-affiliation-${n}-text`]??''));d.affiliationMarkers=aff.map(String);
    d.authors=indexed(values,'author').filter(n=>values[`aaeu-author-${n}-name`]!==undefined).map(n=>{const ids=values[`aaeu-author-${n}-affiliations`];return {name:valueText(values[`aaeu-author-${n}-name`]??''),affiliations:(Array.isArray(ids)?ids:valueText(ids??'').split(/[,;\n]/)).map(String).filter(Boolean).map(id=>aff.includes(Number(id))?String(aff.indexOf(Number(id))+1):id),email:valueText(values[`aaeu-author-${n}-email`]??''),address:valueText(values[`aaeu-author-${n}-address`]??''),corresponding:values[`aaeu-author-${n}-corresponding`]===true};});
  }
  for(const kind of ['data','funding','conflict','acknowledgments','ethics','contributions'] as const)if(Object.keys(changes).some(k=>k.startsWith(`aaeu-${kind}-`))){
    const updated=next.document.endMatter?.find(e=>e.kind===kind);if(updated){if(!plain(kind+'-text').trim())updated.content=[];d.endMatter??=[];const i=d.endMatter.findIndex(e=>e.kind===kind);if(i>=0)d.endMatter[i]=updated;else d.endMatter.push(updated);}
  }
  if(Object.keys(changes).some(k=>k.startsWith('aaeu-statement-'))){
    const old=(d.endMatter??[]).filter(e=>e.kind==='custom');
    const custom=indexed(values,'statement').filter(n=>values[`aaeu-statement-${n}-title`]!==undefined).map(n=>({...old[n-1],id:old[n-1]?.id??newId('statement'),kind:'custom' as const,title:plain(`statement-${n}-title`),content:plain(`statement-${n}-text`).trim()?[{id:newId('p'),kind:'paragraph' as const,content:[{text:plain(`statement-${n}-text`)}]}]:[],enabled:values[`aaeu-statement-${n}-hide`]!==true,required:false}));
    d.endMatter=[...(d.endMatter??[]).filter(e=>e.kind!=='custom'),...custom];
  }
  if(Object.keys(changes).some(k=>/^aaeu-(corresponding-|sidebar-|publication-(text|hide)|copyright-(text|hide)|header-|folio-|reference-checks)/.test(k)))d.journalMetadata=next.document.journalMetadata;
  if(Object.keys(changes).some(k=>/^aaeu-sidebar-[0-9]+-/.test(k))&&d.journalMetadata){
    d.journalMetadata.sidebar=indexed(values,'sidebar').filter(n=>values[`aaeu-sidebar-${n}-label`]!==undefined).map(n=>({id:'custom-'+n,label:plain(`sidebar-${n}-label`),text:plain(`sidebar-${n}-text`)}));
    for(const n of indexed(values,'sidebar'))if(values[`aaeu-sidebar-${n}-hide`]===true)d.journalMetadata.hiddenSidebar.push('custom-'+n);
  }
}
export function fieldForSelection(p:JournalProject,id:string):string|undefined{
  const zones:Record<string,string>={title:'aaeu-title',issue:'aaeu-year',correspondence:'aaeu-corresponding-name',copyright:'aaeu-copyright-year',brand:'aaeu-template',header:'aaeu-header-even-text','header-even':'aaeu-header-even-text','header-odd':'aaeu-header-odd-text',folio:'aaeu-folio-text'};
  if(id.startsWith('property:'))return id.slice(9);
  if(id.startsWith('publication:'))return zones[id.slice(12)]??'aaeu-title';
  if(id==='front-matter')return 'aaeu-title';
  if(id==='abstract'||p.document.abstract.some(n=>n.id===id))return 'aaeu-abstract';
  if(id==='correspondence')return 'aaeu-corresponding-name';
  const e=p.document.endMatter?.find(e=>e.id===id||e.content.some(n=>n.id===id));return e&&e.kind!=='custom'?`aaeu-${e.kind}-text`:undefined;
}
