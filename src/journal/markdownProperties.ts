import {localizedProperty} from './propertyLanguage';
import {cloneJournal,inlineText,newId,type JournalProject,type Paragraph,type EndMatter,type JournalIssue} from './types';
import {endMatterLabels} from './editorial';
import {TEXT_TOKENS} from './appearance';

export type PropertyGroup='basic'|'authors'|'abstract'|'publication'|'statements'|'furniture';
type Kind='text'|'long'|'boolean'|'integer'|'list'|'mode';
export interface PropertySpec {key:string;label:string;kind:Kind;default:string|number|boolean|string[];target:string;group:PropertyGroup;description:string;example:string;location:string;requirement:'required'|'recommended'|'optional'}
function guide(key:string,label:string):Pick<PropertySpec,'group'|'description'|'example'|'location'|'requirement'>{
  const group:PropertyGroup=/^(author-|affiliation-)/.test(key)?'authors':/^(abstract|keywords)$/.test(key)?'abstract':/^(data|funding|conflict|acknowledgments|ethics|contributions|statement-)/.test(key)?'statements':/^(received|revised|accepted|corresponding-|sidebar-|year$|volume$|issue$|doi$|first-page$|publication-mode|copyright-year)/.test(key)?'publication':/^(running-|publication-|copyright-|header-|folio-)/.test(key)?'furniture':'basic';
  const location=group==='statements'?'참고문헌 직전':group==='furniture'?(key.startsWith('copyright')?'첫 페이지 하단':key.startsWith('publication')?'첫 페이지 왼쪽 상단':'두 번째 페이지부터 머리말·쪽번호'):group==='publication'?(/^(corresponding|sidebar|received|revised|accepted)/.test(key)?'첫 페이지 초록 오른쪽':'첫 페이지 발행정보'):group==='abstract'?'첫 페이지 초록 영역':'첫 페이지 제목·저자 영역';
  const examples:Record<string,string>={title:'AI와 함께 생각하기',abstract:'연구 목적, 방법, 결과를 여러 문단으로 입력할 수 있습니다.',keywords:'AI, 학습, 글쓰기',doi:'10.1234/example.2026.001',received:'September 1, 2026',revised:'September 10, 2026',accepted:'September 18, 2026','corresponding-name':'Min Kim','corresponding-email':'editor@example.org','corresponding-address':'Department, University, City, Country','running-title':'AI and Learning','running-authors':'Kim et al.','header-even-text':'{journal} {year}','folio-text':'{page}'};
  const requirement=key==='title'||/^(abstract|doi|year|received|revised|accepted|corresponding-name|corresponding-email|data-text|funding-text|conflict-text)$/.test(key)?'required':/^(keywords|author-\{n\}-name|affiliation-\{n\}-text|running-title)$/.test(key)?'recommended':'optional';
  const description=key.endsWith('-hide')?'켜면 해당 정보와 표제를 출력하지 않습니다. 입력한 값은 보존됩니다.':key.endsWith('-omission-reason')?'저널에서 요구하는 항목을 생략한 이유를 기록합니다. 출력 본문에는 들어가지 않습니다.':/^(publication|copyright|header-even|header-odd|folio)-text$/.test(key)?'비우면 템플릿 문구를 사용합니다. 직접 입력한 문구는 템플릿을 바꿔도 유지됩니다. {year}, {page} 등의 변수를 사용할 수 있습니다.':key==='abstract'?'길이에 맞춰 초록 상자의 높이가 자동 조정됩니다. 빈 줄로 문단을 나눌 수 있습니다.':group==='statements'?'실제 원고에 맞는 내용을 입력하세요. 자동으로 사실을 가정하거나 선언문을 채우지 않습니다.':key.includes('affiliations')?'이 저자가 속한 소속의 번호를 입력합니다. 소속 추가 후 해당 번호를 선택하세요.':`${label}에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다.`;
  return {group,location,description,example:examples[key]??(key.includes('email')?'name@example.org':key.includes('year')?'2026':''),requirement};
}
const spec=(key:string,label:string,kind:Kind='text',value:PropertySpec['default']='',target=key):PropertySpec=>({key:'aaeu-'+key,label,kind,default:value,target,...guide(key,label)});
/** One registry supplies templates, validation and documentation, including indexed fields. */
export const MARKDOWN_PROPERTIES:readonly PropertySpec[]=[
  spec('schema','속성 형식 버전','integer',1),spec('template','저널 템플릿 ID','text','builtin:aaeu-demo'),
  ...[['title','논문 제목'],['running-title','머리말 축약 제목'],['running-authors','머리말 저자'],['doi','DOI'],['year','발행 연도'],['volume','권'],['issue','호'],['received','접수일'],['revised','수정일'],['accepted','승인일'],['copyright-year','판권 연도']].map(([k,l])=>spec(k,l)),
  spec('first-page','시작 페이지','integer',1),spec('publication-mode','발행 상태','mode','aop'),spec('abstract','초록','long'),spec('keywords','키워드','list',[]),
  spec('reference-checks','참고문헌 검사','boolean',true),
  ...['publication','copyright','header-even','header-odd','folio'].flatMap(k=>[spec(k+'-text',k+' 문구 (빈 값: 템플릿 상속)',k==='copyright'?'long':'text'),spec(k+'-hide',k+' 의도적으로 숨김','boolean',false)]),
  spec('sidebar-order','오른쪽 정보 순서','list',['received','revised','accepted','correspondence','custom']),
  ...['received','revised','accepted','correspondence'].map(k=>spec('sidebar-'+k+'-hide',k+' 숨김','boolean',false)),
  ...['name','affiliations','email','address'].map(k=>spec('author-{n}-'+k,'저자 {n} '+k,k==='affiliations'?'list':k==='address'?'long':'text',k==='affiliations'?[]:'')),
  spec('author-{n}-corresponding','저자 {n} 교신저자','boolean',false),spec('affiliation-{n}-text','소속 {n}','long'),
  ...['name','email','address'].map(k=>spec('corresponding-'+k,'별도 교신저자 '+k,k==='address'?'long':'text')),
  spec('sidebar-{n}-label','사용자 정보 {n} 표제'),spec('sidebar-{n}-text','사용자 정보 {n} 내용','long'),spec('sidebar-{n}-hide','사용자 정보 {n} 숨김','boolean',false),
  ...(['data','funding','conflict','acknowledgments','ethics','contributions'] as const).flatMap(k=>[spec(k+'-text',endMatterLabels[k],'long'),spec(k+'-hide',endMatterLabels[k]+' 숨김','boolean',false),spec(k+'-omission-reason',endMatterLabels[k]+' 제외 사유 (필수 항목을 숨길 때)')]),
  spec('statement-{n}-title','추가 말미 정보 {n} 제목'),spec('statement-{n}-text','추가 말미 정보 {n} 내용','long'),spec('statement-{n}-hide','추가 말미 정보 {n} 숨김','boolean',false),
];
const matcher=(s:PropertySpec)=>new RegExp('^'+s.key.replace('{n}','([1-9][0-9]{0,2})')+'$');
export const propertySpec=(key:string):PropertySpec|undefined=>MARKDOWN_PROPERTIES.find(s=>matcher(s).test(key));
export function propertyTemplate(templateId='builtin:aaeu-demo',language='en'):string{
  return MARKDOWN_PROPERTIES.map(raw=>{const s=localizedProperty(raw,language);const key=s.key.replace('{n}','1'),value=s.key==='aaeu-template'?templateId:s.key==='aaeu-reference-checks'&&templateId==='builtin:general'?false:s.default;return `# ${s.label.split('{n}').join('1')}\n${key}: ${s.kind==='long'?'|\n  ':JSON.stringify(value)}`;}).join('\n');
}
export const manuscriptTemplate=(templateId='builtin:aaeu-demo',language='en'):string=>`---\n${propertyTemplate(templateId,language)}\n---\n\n## Introduction\n\n\n## Methods\n\n### Study design\n\n\n## Results\n\n\n## Discussion\n\n\n## References\n\n`;
export function validateMarkdownProperties(m:Record<string,unknown>):JournalIssue[]{
  const issues:JournalIssue[]=[];
  const error=(key:string,message:string)=>issues.push({id:'property:'+key,code:'markdown-property',severity:'error',nodeId:'property:'+key,message:key+': '+message});
  for(const [key,v]of Object.entries(m)){
    if(!key.startsWith('aaeu-'))continue;const s=propertySpec(key);if(!s){error(key,'알 수 없는 속성입니다. 속성 안내에서 이름을 확인하세요.');continue;}
    if(v===null||v===undefined||v==='')continue;
    const valid=s.kind==='boolean'?typeof v==='boolean':s.kind==='integer'?Number.isSafeInteger(v)&&Number(v)>0&&Number(v)<=100000:s.kind==='list'?typeof v==='string'||Array.isArray(v)&&v.every(x=>typeof x==='string'||typeof x==='number'):s.kind==='mode'?typeof v==='string'&&['aop','issue'].includes(v):typeof v==='string'||typeof v==='number';
    if(!valid)error(key,'속성 형식이 잘못되었습니다 ('+s.kind+').');
    if(typeof v==='string'&&v.length>(s.kind==='long'?100000:2000))error(key,'문구가 너무 깁니다.');
    if(/^aaeu-(publication|copyright|header-even|header-odd|folio)-text$/.test(key)&&typeof v==='string'&&Array.from(v.matchAll(/\{([^{}]+)\}/g)).some(m=>!(TEXT_TOKENS as readonly string[]).includes(m[1])))error(key,'지원하지 않는 문구 변수입니다.');
    if(key==='aaeu-sidebar-order'&&list(v).some(k=>!['received','revised','accepted','correspondence','custom'].includes(k)&&!/^custom-[1-9][0-9]{0,2}$/.test(k)))error(key,'오른쪽 정보의 순서 이름을 확인하세요.');
  }
  if(m['aaeu-schema']!==undefined&&m['aaeu-schema']!==1)error('aaeu-schema','지원 버전은 1입니다.');
  return issues;
}
const string=(v:unknown):string=>typeof v==='string'||typeof v==='number'?String(v):'';
const list=(v:unknown):string[]=>Array.isArray(v)?v.map(string).map(s=>s.trim()).filter(Boolean):string(v).split(/[,;\n]/).map(s=>s.trim()).filter(Boolean);
export function indexed(m:Record<string,unknown>,group:string):number[]{return [...new Set(Object.keys(m).flatMap(k=>{const n=k.match(new RegExp('^aaeu-'+group+'-([1-9][0-9]{0,2})-'));return n?[Number(n[1])]:[];}))].sort((a,b)=>a-b);}
const normalized=(s:string)=>s.replace(/\s+/g,' ').trim();
const paragraphs=(text:string,key:string,sourceId:string):Paragraph[]=>text.trim().split(/\r?\n\s*\r?\n/).filter(Boolean).map((s,i)=>({id:newId('metadata'),kind:'paragraph',content:[{text:s}],origin:{sourceId,path:'markdown/frontmatter/'+key+'/'+i,text:s}}));
export function markdownMetadata(m:Record<string,unknown>):Record<string,unknown>{
  const next={...m},pairs:Record<string,string>={'running-title':'runningTitle','running-authors':'runningAuthors','first-page':'firstPage'};
  for(const key of ['title','abstract','keywords','doi','volume','issue','year','received','revised','accepted','running-title','running-authors','first-page']){const value=m['aaeu-'+key];if(value!==undefined&&value!==null&&value!=='')next[pairs[key]??key]=value;}
  return next;
}
export function applyMarkdownProperties(p:JournalProject,m:Record<string,unknown>,sourceId:string):void{
  const d=p.document,meta=markdownMetadata(m);p.issues.push(...validateMarkdownProperties(m));
  const conflict=(key:string)=>p.issues.push({id:'property-conflict:'+key,code:'markdown-property-conflict',severity:'error',nodeId:'property:'+key,message:`${key}: YAML과 본문 내용이 다릅니다. YAML을 출력에 사용했습니다. 원문에서 한쪽을 수정하거나 제거하세요.`});
  const text=(key:string)=>string(m['aaeu-'+key]);
  for(const key of ['runningAuthors','runningTitle'] as const)if(meta[key]!==undefined)d[key]=string(meta[key]);
  if(Number.isSafeInteger(meta.firstPage)&&Number(meta.firstPage)>0)d.firstPage=Number(meta.firstPage);
  if(meta.abstract!==undefined&&string(meta.abstract).trim()){
    const value=string(meta.abstract),body=d.abstract.filter(a=>!a.origin?.path.includes('frontmatter'));
    if(body.length&&normalized(body.map(a=>inlineText(a.content)).join('\n'))!==normalized(value))conflict('aaeu-abstract');
    d.abstract=paragraphs(value,'aaeu-abstract',sourceId).map(a=>({...a,role:'abstract'}));
  }
  if(meta.keywords!==undefined)d.keywords=list(meta.keywords);
  const affiliations=indexed(m,'affiliation').filter(n=>text(`affiliation-${n}-text`).trim()),indices=new Map(affiliations.map((n,i)=>[String(n),String(i+1)]));
  if(affiliations.length){d.affiliations=affiliations.map(n=>text(`affiliation-${n}-text`));d.affiliationMarkers=affiliations.map(String);}
  const authors=indexed(m,'author').filter(n=>text(`author-${n}-name`).trim());
  if(authors.length)d.authors=authors.map(n=>{
    const aff=list(m[`aaeu-author-${n}-affiliations`]);for(const id of aff)if(!indices.has(id))p.issues.push({id:`affiliation:${n}:${id}`,code:'markdown-affiliation',severity:'error',message:`aaeu-author-${n}-affiliations: 소속 ${id}가 없습니다.`,nodeId:`property:aaeu-author-${n}-affiliations`});
    return {name:text(`author-${n}-name`),affiliations:aff.map(id=>indices.get(id)??id),email:text(`author-${n}-email`),address:text(`author-${n}-address`),corresponding:m[`aaeu-author-${n}-corresponding`]===true};
  });
  d.journalMetadata={overrides:{},sidebar:[],sidebarOrder:list(m['aaeu-sidebar-order']),hiddenSidebar:[]};
  if(!d.journalMetadata.sidebarOrder.length)d.journalMetadata.sidebarOrder=['received','revised','accepted','correspondence','custom'];
  for(const key of ['received','revised','accepted','correspondence'])if(m[`aaeu-sidebar-${key}-hide`]===true)d.journalMetadata.hiddenSidebar.push(key);
  const cn=text('corresponding-name'),ce=text('corresponding-email'),ca=text('corresponding-address');
  if(cn||ce||ca)d.journalMetadata.correspondence=[cn,ca,ce?'Email: '+ce:''].filter(Boolean).join('\n');
  for(const n of indexed(m,'sidebar'))if(text(`sidebar-${n}-text`).trim()&&m[`aaeu-sidebar-${n}-hide`]!==true)d.journalMetadata.sidebar.push({id:'custom-'+n,label:text(`sidebar-${n}-label`),text:text(`sidebar-${n}-text`)});
  for(const key of ['publication','copyright','header-even','header-odd','folio']){const value=text(key+'-text');if(m[`aaeu-${key}-hide`]===true)d.journalMetadata.overrides[key]='';else if(value.trim())d.journalMetadata.overrides[key]=value;}
  if(typeof m['aaeu-reference-checks']==='boolean')d.journalMetadata.referenceChecks=m['aaeu-reference-checks'];
  const mode=m['aaeu-publication-mode'];if(mode==='aop'||mode==='issue')d.publication={...d.publication,mode};
  if(text('copyright-year'))d.publication={...d.publication,mode:d.publication?.mode??'aop',copyrightYear:text('copyright-year')};
  for(const kind of ['data','funding','conflict','acknowledgments','ethics','contributions'] as const){
    const value=text(kind+'-text'),hidden=m[`aaeu-${kind}-hide`]===true,existing=d.endMatter?.find(e=>e.kind===kind);
    if(!value.trim()&&!hidden)continue;
    if(value.trim()&&existing?.content.length&&normalized(existing.content.map(a=>inlineText(a.content)).join('\n'))!==normalized(value))conflict('aaeu-'+kind+'-text');
    const item:EndMatter=existing??{id:newId('end-matter'),kind,title:endMatterLabels[kind],content:[],enabled:true,required:false};
    if(value.trim())item.content=paragraphs(value,'aaeu-'+kind+'-text',sourceId);item.enabled=!hidden;item.omissionReason=text(kind+'-omission-reason');delete item.reviewed;
    if(!existing){d.endMatter??=[];d.endMatter.push(item);}
  }
  for(const n of indexed(m,'statement'))if(text(`statement-${n}-text`).trim()){d.endMatter??=[];d.endMatter.push({id:newId('statement'),kind:'custom',title:text(`statement-${n}-title`)||'Statement',content:paragraphs(text(`statement-${n}-text`),`aaeu-statement-${n}-text`,sourceId),enabled:m[`aaeu-statement-${n}-hide`]!==true,required:false});}
  if(p.editorial)p.editorial.markdownBaseline={sourceId,document:cloneJournal(d),references:cloneJournal(p.references)};
}
