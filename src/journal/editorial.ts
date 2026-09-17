import {academicChecks} from "./appearance";
import {cloneJournal,inlineText,newId,type EndMatter,type EditorialChange,type JournalIssue,type JournalNode,type JournalProject,type Paragraph,type TableNode} from './types';

export const editorialDefaults=():NonNullable<JournalProject['editorial']>=>({enabled:true,numbering:'layout',sortReferences:true,preserveCharts:true,changes:[],detections:[]});
export const endMatterDefaults=():EndMatter[]=>[
  ['data','Data availability statement'],['funding','Funding Information'],['conflict','Conflict of Interest']
].map(([kind,title])=>({id:newId('end-matter'),kind:kind as EndMatter['kind'],title,content:[],enabled:true,required:true}));
export const endMatterLabels:Record<EndMatter['kind'],string>={data:'Data availability statement',funding:'Funding Information',conflict:'Conflict of Interest',acknowledgments:'Acknowledgments',ethics:'Ethics statement',contributions:'Author Contributions',custom:'Additional statement'};
const paragraph=(n:JournalNode):n is Paragraph=>n.kind==='paragraph'||n.kind==='heading';
const label=(s:string):string=>s.trim().replace(/[:.：]$/,'').toLowerCase().replace(/\s+/g,' ');
export function endMatterKind(text:string):EndMatter['kind']|undefined{
  const s=label(text);
  if(/^data availability(?: statement)?$/.test(s))return 'data';
  if(/^(?:funding(?: information| statement)?|financial support)$/.test(s))return 'funding';
  if(/^(?:conflicts? of interest(?: statement)?|declaration of competing interests?)$/.test(s))return 'conflict';
  if(/^acknowledg(?:e)?ments?$/.test(s))return 'acknowledgments';
  if(/^(?:ethics?(?: statement| approval)?|ethical approval)$/.test(s))return 'ethics';
  if(/^authors?'? contributions?(?: statement)?$/.test(s))return 'contributions';
}
export const isReferenceHeading=(n:JournalNode):boolean=>paragraph(n)&&/^(references?|bibliography|참고문헌)[:.]?$/i.test(inlineText(n.content).trim());
export const captionMatch=(text:string):RegExpMatchArray|null=>text.match(/^[\s\u200b]*(Table|Figure|Fig\.?|표|그림)\s*([A-Z]?\d+[a-z]?)[.:]?\s*(.*)$/is);
const kindOf=(match:RegExpMatchArray):'table'|'figure'=>/^(table|표)$/i.test(match[1])?'table':'figure';
export function embeddedTableCaption(n:TableNode):{match:RegExpMatchArray;content:Paragraph['content']}|undefined{
  const first=n.rows[0];if(n.rows.length<2||first?.cells.length!==1||first.cells[0].rowspan!==1||first.cells[0].colspan!==Math.max(n.columnWeights.length,...n.rows.map(r=>r.cells.reduce((s,c)=>s+c.colspan,0))))return;
  const content=first.cells[0].blocks.flatMap((b,i)=>[...(i?[{text:' '}]:[]),...b.content]),match=captionMatch(inlineText(content));
  if(match&&kindOf(match)==='table'&&match[3].trim())return {match,content};
}
export function resolveEmbeddedTableCaption(p:JournalProject,id:string,choice:'inside'|'outside'):void{
  const index=p.document.blocks.findIndex(n=>n.id===id),n=p.document.blocks[index];if(n?.kind!=='table')return;
  const embedded=embeddedTableCaption(n);if(!embedded)return;
  record(p,'table-caption-row',[n],n.id,choice==='inside'?'편집자가 표 안의 제목을 선택하고 중복 행을 제거':'편집자가 표 밖의 제목을 선택하고 중복 행을 제거',index);
  const first=cloneJournal(n.rows[0]);n.caption??={number:'',title:[],notes:[]};
  if(choice==='inside'){n.caption.number=embedded.match[2];n.caption.sourceNumber=embedded.match[2];n.caption.title=sliceRuns(embedded.content,embedded.match[0].length-embedded.match[3].length);}
  n.caption.sourceRows=[first];n.rows.shift();
}
/** Slice by source character offsets without losing emphasis, links or revision marks. */
export function sliceRuns(content:Paragraph['content'],start:number,end=Infinity):Paragraph['content']{
  const out:Paragraph['content']=[];let offset=0;
  for(const run of content){const length=run.break?1:run.text.length,a=Math.max(0,start-offset),b=Math.min(length,end-offset);if(b>a)out.push({...cloneJournal(run),text:run.break?'\n':run.text.slice(a,b)});offset+=length;}
  return out;
}
function record(p:JournalProject,rule:string,source:JournalNode[],targetId:string|undefined,reason:string,index:number):void{
  const e=p.editorial!;
  e.changes.push({id:newId('cleanup'),rule,status:'applied',source:cloneJournal(source),targetId,reason,beforeId:p.document.blocks[index-1]?.id,afterId:p.document.blocks[index+source.length]?.id});
}
function suppressed(p:JournalProject,rule:string,id:string):boolean{return !!p.editorial?.changes.some(c=>c.rule===rule&&c.status==='reverted'&&c.source.some(n=>n.id===id));}
export function enableEditorial(p:JournalProject):void{
  p.editorial??=editorialDefaults();p.editorial.enabled=true;p.editorial.numbering='layout';p.editorial.sortReferences=true;p.editorial.preserveCharts=true;
  p.document.endMatter??=endMatterDefaults();normalizeEditorial(p);
}
/** High-confidence structural cleanup is shared by both input adapters. All removals have a ledger entry. */
export function normalizeEditorial(p:JournalProject):void{
  if(!p.editorial?.enabled)return;
  const nodes=p.document.blocks;
  for(let i=0;i<nodes.length;i++){
    const n=nodes[i];
    if(n.kind==='table'&&n.rows.length>1&&!n.caption?.number&&!inlineText(n.caption?.title??[]).trim()&&!suppressed(p,'table-caption-row',n.id)){
      const first=n.rows[0],width=Math.max(n.columnWeights.length,...n.rows.map(r=>r.cells.reduce((s,c)=>s+c.colspan,0)));
      if(first.cells.length===1&&first.cells[0].colspan===width&&first.cells[0].rowspan===1){
        const content=first.cells[0].blocks.flatMap((b,j)=>[...(j?[{text:' ',break:false}]:[]),...b.content]);
        const match=captionMatch(inlineText(content));
        if(match&&kindOf(match)==='table'&&match[3].trim()){
          record(p,'table-caption-row',[n],n.id,'표의 첫 병합 행을 정식 캡션으로 이동',i);
          n.caption={number:match[2],sourceNumber:match[2],title:sliceRuns(content,match[0].length-match[3].length),notes:n.caption?.notes??[],source:cloneJournal(first.cells[0].blocks[0]),sourceRows:[cloneJournal(first)]};n.rows.shift();
        }
      }
    }
    if(!paragraph(n))continue;
    const text=inlineText(n.content).trim();
    const orphan=captionMatch(text);
    if(orphan&&kindOf(orphan)==='figure'&&orphan[3].trim()&&(n.role==='caption'||/caption/i.test(n.style??''))&&!suppressed(p,'orphan-caption',n.id)){
      record(p,'orphan-caption',[n],n.id,'그림 원본이 연결되지 않은 캡션을 확인용 그림 항목으로 변환',i);
      nodes[i]={id:n.id,kind:'figure',assetId:'',width:'auto',origin:n.origin,sourceObject:{type:'missing-image',part:n.origin?.path??'',description:'캡션에 해당하는 그림 원본을 연결하세요.'},caption:{number:orphan[2],sourceNumber:orphan[2],title:sliceRuns(n.content,inlineText(n.content).length-orphan[3].length),notes:[],source:cloneJournal(n)}};continue;
    }
    const marker=text.match(/^[[(]?\s*(?:insert|place)\s+(table|figure|fig\.?)\s*([A-Z]?\d+[a-z]?)\s+(?:about\s+)?here\s*[\])]?[.!]?$/i);
    if(marker&&!suppressed(p,'placement-anchor',n.id)){
      record(p,'placement-anchor',[n],n.id,'삽입 지시문을 출력되지 않는 배치 지점으로 변환',i);
      nodes[i]={id:n.id,kind:'anchor',targetKind:/table/i.test(marker[1])?'table':'figure',sourceNumber:marker[2],targetIds:[],source:cloneJournal(n),origin:n.origin};continue;
    }
    if(/^(figures|tables)[:.]?$/i.test(text)&&!suppressed(p,'object-group-heading',n.id)){
      const kind=/^tables/i.test(text)?'table':'figure';
      const next=nodes.slice(i+1).find(b=>!paragraph(b)||inlineText(b.content).trim());
      if(next?.kind===kind){record(p,'object-group-heading',[n],next.id,'개체 묶음의 원고 정리용 제목을 출력에서 제외',i);nodes.splice(i--,1);continue;}
    }
    const kind=endMatterKind(text);
    if(kind&&!suppressed(p,'end-matter',n.id)){
      let end=i+1;
      while(end<nodes.length&&nodes[end].kind==='paragraph'&&!endMatterKind(inlineText((nodes[end] as Paragraph).content))&&!isReferenceHeading(nodes[end]))end++;
      if(end===i+1)continue;
      const source=nodes.slice(i,end),existing=p.document.endMatter?.find(e=>e.kind===kind);
      if(existing?.content.length)continue;
      p.document.endMatter??=[];
      const item=existing??{id:newId('end-matter'),kind,title:endMatterLabels[kind],content:[],enabled:true,required:false};
      item.source=cloneJournal(source);item.content=cloneJournal(source.slice(1) as Paragraph[]);item.enabled=true;delete item.reviewed;
      if(!existing)p.document.endMatter.push(item);
      record(p,'end-matter',source,item.id,'논문 말미 정보를 편집자 확인 항목으로 연결',i);nodes.splice(i,end-i);i--;continue;
    }
  }
  for(const n of nodes){
    if((n.kind==='table'||n.kind==='figure')&&n.caption)n.caption.sourceNumber??=n.caption.number;
    if(n.kind==='anchor')n.targetIds=nodes.filter(b=>(b.kind==='table'||b.kind==='figure')&&b.kind===n.targetKind&&(b.caption?.sourceNumber??b.caption?.number)===n.sourceNumber).map(b=>b.id);
  }
  // Reference scope ends at an explicit following section, not at the end of the file.
  let refs=false;
  for(const n of nodes){
    if(isReferenceHeading(n)){refs=true;continue;}
    if(n.kind==='heading')refs=false;
    if(paragraph(n)&&n.role==='reference'&&!refs)n.role='body';
  }
  const referenceIds=new Set(nodes.filter(n=>paragraph(n)&&n.role==='reference').map(n=>n.id));
  p.references=p.references.filter(r=>!r.sourceParagraphIds?.length||r.sourceParagraphIds.some(id=>referenceIds.has(id)));
  // Word often stores each visual reference line as a separate paragraph.
  // Keep every paragraph ID, but sort and edit the complete entry as one record.
  const grouped:typeof p.references=[];
  for(const r of p.references){
    const prior=grouped.at(-1),starts=/^\s*.+?\((?:\d{4}[a-z]?(?:,[^)]*)?|n\.d\.|in press)\)/i.test(r.raw)||/^\s*[\p{L}\p{M}'’ .-]+,\s*[A-Z]\./u.test(r.raw);
    const previousId=prior?.sourceParagraphIds?.at(-1),currentId=r.sourceParagraphIds?.[0];
    const consecutive=previousId&&currentId&&nodes.findIndex(n=>n.id===currentId)===nodes.findIndex(n=>n.id===previousId)+1;
    if(prior&&!starts&&consecutive&&!r.confirmed&&!prior.confirmed){prior.raw+=(/-$/.test(prior.raw)?'':' ')+r.raw;prior.sourceParagraphIds!.push(...r.sourceParagraphIds!);}
    else grouped.push(r);
  }
  p.references=grouped;
}
export function restoreEditorialChange(p:JournalProject,id:string):void{
  const c=p.editorial?.changes.find(c=>c.id===id);if(!c||c.status!=='applied')return;
  if(c.rule==='table-caption-row'){
    const n=p.document.blocks.find(n=>n.id===c.targetId),old=c.source[0];
    if(n?.kind==='table'&&old?.kind==='table'){
      // Restore the source title row without overwriting subsequent data edits.
      n.rows.unshift(...cloneJournal(n.caption?.sourceRows??old.rows.slice(0,1)));
      const notes=n.caption?.notes??[];n.caption=old.caption?cloneJournal(old.caption):notes.length?{number:'',title:[],notes}:undefined;
    }
  }else{
    if(c.rule==='end-matter')p.document.endMatter=p.document.endMatter?.filter(e=>e.id!==c.targetId);
    p.document.blocks=p.document.blocks.filter(n=>!c.source.some(s=>s.id===n.id));
    const before=p.document.blocks.findIndex(n=>n.id===c.beforeId),after=p.document.blocks.findIndex(n=>n.id===c.afterId);
    p.document.blocks.splice(after>=0?after:before>=0?before+1:p.document.blocks.length,0,...cloneJournal(c.source));
  }
  c.status='reverted';
}
export function endMatterSnapshot(e:EndMatter):string{return JSON.stringify([e.title,e.enabled,e.required,e.omissionReason,e.content]);}
export function endMatterBlocks(p:JournalProject):JournalNode[]{
  return (p.document.endMatter??[]).filter(e=>e.enabled&&e.content.some(n=>inlineText(n.content).trim())).flatMap(e=>[{id:e.id,kind:'heading' as const,level:1,content:[{text:e.title}]},...cloneJournal(e.content)]);
}
export function editorialIssues(p:JournalProject):JournalIssue[]{
  const out:JournalIssue[]=[];
  const add=(nodeId:string,code:string,message:string,severity:JournalIssue['severity']='error'):void=>{out.push({id:`${nodeId}:${code}`,code,nodeId,severity,message});};
  for(const n of p.document.blocks){
    if(n.kind==='table'&&n.caption?.number&&embeddedTableCaption(n))add(n.id,'table-caption-duplicate','표 안팎에 제목이 있습니다. 개체 패널에서 사용할 제목을 선택하세요.');
    if(n.kind==='anchor'&&n.targetIds.length!==1)add(n.id,'anchor-unresolved',`삽입 표시 ${n.targetKind} ${n.sourceNumber}의 대상을 하나로 연결하세요.`);
    if(n.kind==='figure'&&!n.assetId&&!n.chart)add(n.id,'figure-source-required',n.sourceObject?.description??'그림 원본을 연결하세요.');
    if(n.kind==='figure'){
      const asset=p.assets.find(a=>a.id===n.assetId),scan=p.editorial?.detections.find(d=>d.assetId===n.assetId&&d.assetSha256===asset?.sha256);
      if(scan?.candidates.length&&!scan.review)add(n.id,'embedded-caption-review','이미지 안의 캡션 후보를 확인하고 크롭 또는 원본 유지를 선택하세요.');
      if(n.crop&&(!n.crop.confirmed||n.crop.assetSha256!==asset?.sha256))add(n.id,'crop-stale','그림이 바뀌었습니다. 크롭 영역을 다시 확인하세요.');
    }
  }
  for(const c of p.editorial?.changes??[])if(c.status==='pending')add(c.targetId??c.id,'editorial-change-pending',c.reason);
  for(const e of academicChecks(p)?p.document.endMatter??[]:[]){
    if(e.required&&!e.enabled&&!e.omissionReason?.trim())add(e.id,'end-matter-omission','필수 말미 항목을 제외한 사유를 입력하세요.');
    if(e.enabled){
      if(!e.title.trim()||!e.content.some(n=>inlineText(n.content).trim())){if(e.required)add(e.id,'end-matter-empty',`${e.title}: 내용을 입력하거나 제외 사유를 지정하세요.`);}
      else if(e.reviewed!==endMatterSnapshot(e))add(e.id,'end-matter-review',`${e.title}: 현재 내용을 확인하세요.`,'warning');
    }
  }
  return out;
}
/** Source blocks stay immutable in the project; generated sections exist only in the composition view. */
export function insertEndMatter(p:JournalProject):void{
  const blocks=endMatterBlocks(p);if(!blocks.length)return;
  const i=p.document.blocks.findIndex(isReferenceHeading);p.document.blocks.splice(i<0?p.document.blocks.length:i,0,...blocks);
}
export function sourceChangeText(c:EditorialChange):string{return c.source.map(n=>paragraph(n)?inlineText(n.content):n.kind==='table'?n.rows[0]?.cells.map(c=>c.blocks.map(b=>inlineText(b.content)).join(' ')).join(' | '):n.kind).join('\n');}
