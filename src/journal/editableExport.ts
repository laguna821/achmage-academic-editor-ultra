import {sidebarItems,headerOverride} from './articleFurniture';
import {finalizeEditableThreads,validateEditableLayout,type EditableLayoutSnapshot,type EditParagraph,type EditRun,type EditRect} from '../io/editableLayout';
import {captureParagraph,captureInlines,EDITABLE_WORD_SPACING,type CapturedParagraph} from './editableCapture';
import {NO_ADJUSTMENT} from './quality';
import type {ResolvedJournalSpec} from './master';
import {academicChecks,customHeader,resolveTemplateText} from './appearance';
import {copyrightYear,publicationMode,publicationRunning,articleRunning,publicationSuffix,canonicalDoi} from './publication';
import {JOURNAL_BRAND_ASSETS} from './embedded.generated';
import {chartSvg} from './charts';
import {reviewTitle,MISSING_CORRESPONDENCE,missingFigureSvg,missingFigureMessage} from './missingContent';
import {tableGrid} from './tableGeometry';
import {imageInfo} from './imageInfo';
import {tableNoteGroups,tableNoteStyle} from './tableNotes';
import {sliceInlines,withoutSourceIndent} from './typst';
import {inlineText,visibleInlines,type JournalProject,type LayoutResult,type BinaryStore,type Paragraph,type Inline} from './types';
const MM=72/25.4;
export interface JournalEditableSource {
  version:2;
  regions?:({page:number}&EditRect)[];
  text:{boxId:string;page:number;slice:CapturedParagraph}[];
  geometry:{kind:string;nodeId:string;fragment:number;page:number;x:number;y:number;width:number;height:number}[];
  project:JournalProject;
  resolved:ResolvedJournalSpec;
  referenceRuns:{kind?:string;key?:string;text?:string;italic?:boolean;bold?:boolean}[];
  tables:{nodeId:string;page:number;fragment:number;columns:number[];padding:number}[];
  typography:Record<string,{trackingEm:number;scaleX:number;leadingPt:number}>;
  headers?:{even:string;odd:string};
}
const sameRect=(a:EditRect,b:EditRect):boolean=>Math.abs(a.x-b.x)<.2&&Math.abs(a.width-b.width)<.2;
/** Reassemble a composed manuscript from its structured source, never from PDF text. */
export async function journalEditableSnapshot(result:LayoutResult,store:BinaryStore):Promise<EditableLayoutSnapshot>{
  const source=result.editableSource;if(!source)throw new Error('편집용 조판 정보가 없습니다. 조판을 다시 실행하세요.');
  const p=source.project,d=p.document,{master:m,styles,spacing}=source.resolved,boxes=result.boxes;
  const s:EditableLayoutSnapshot={version:2,title:d.title||'HanMark',fingerprint:result.fingerprint,pageWidth:p.preset.page.widthMm*MM,pageHeight:p.preset.page.heightMm*MM,pageCount:result.pageCount,firstPage:d.firstPage,pageMargins:{left:p.preset.page.marginLeftMm*MM,right:p.preset.page.marginRightMm*MM,top:p.preset.page.topMm*MM,bottom:p.preset.page.bottomMm*MM},styles:{},stories:[],frames:[],tables:[],images:[],shapes:[],assets:[],issues:result.issues.map(i=>({severity:i.severity==='error'?'warning':i.severity,sourceSeverity:i.severity,code:'source-'+i.code,message:i.message,sourceId:i.nodeId}))};
  for(const [key,st]of Object.entries(styles)){
    const top=key==='body'||key==='reference'||key==='table'?.8:.75;
    s.styles[key]={font:st.font,size:st.sizePt,leading:st.leadingPt,color:st.color,bold:st.bold,italic:st.italic,align:st.align,indent:st.indentMm*MM,tracking:st.trackingEm,
      blockTop:st.sizePt*top,blockBottom:st.sizePt*(1-top),hyphenate:key==='table'||st.align==='justify',language:p.preset.body.language,wordSpacing:{...EDITABLE_WORD_SPACING}};
  }
  s.styles.reference={...s.styles.reference,leftIndent:p.preset.references.hangingMm*MM,indent:-p.preset.references.hangingMm*MM,after:3};
  for(let level=1;level<=5;level++){const space=source.resolved.headings[level-1];s.styles['heading'+level]={...s.styles['heading'+level],before:space.beforePt,after:space.afterPt,keepNext:true};}
  const inlines=(runs:Inline[]):EditRun[]=>captureInlines(runs,p);
  const para=(node:Paragraph,style?:string):EditParagraph=>({id:node.id,sourceId:node.id,style:style??(node.kind==='heading'?'heading'+Math.min(5,node.level??1):node.role&&s.styles[node.role]?node.role:'body'),runs:inlines(node.content)});
  let seq=0;
  const text=(key:string,rect:EditRect,page:number,paragraphs:EditParagraph[],group?:string,fill?:string,layer:'body'|'furniture'|'artwork'='body'):void=>{const id=`journal:${key}:${++seq}`;s.stories.push({id:id+':story',paragraphs});s.frames.push({id:id+':frame',storyId:id+':story',page,x:rect.x,y:rect.y,width:rect.width,height:Math.max(1,rect.height),order:0,group,fill,layer});};
  const simple=(id:string,value:string,style:string):EditParagraph=>({id,sourceId:id,style,runs:[{text:value}]});
  const usedAssets=new Set<string>();
  // Resolved bibliography entries use referenceRuns below. Inline citations
  // and raw code need their own rendered-run capture before editable export;
  // do not silently substitute the author's source spelling or another font.
  const textNodes=[...d.abstract,...d.blocks.flatMap(n=>n.kind==='paragraph'||n.kind==='heading'?[n]:n.kind==='table'?[...n.rows.flatMap(r=>r.cells.flatMap(c=>c.blocks)),...(n.caption?.notes??[])]:n.kind==='figure'?n.caption?.notes??[]:[])];
  for(const n of textNodes){
    if(n.role==='code')s.issues.push({severity:'error',code:'editable-code-capture',sourceId:n.id,message:'코드 블록의 최종 서식은 아직 편집용 출력에 연결되지 않았습니다.'});
    if(visibleInlines(n.content,p.changes).some(r=>r.citationIds?.length&&r.citationIds.every(id=>p.references.some(ref=>ref.id===id&&ref.confirmed))))s.issues.push({severity:'error',code:'editable-citation-capture',sourceId:n.id,message:'자동 생성한 본문 인용의 최종 글자 정보를 편집용 출력에 연결해야 합니다.'});
  }
  const useAsset=async(assetId:string):Promise<string>=>{if(usedAssets.has(assetId))return assetId;const asset=p.assets.find(a=>a.id===assetId);if(!asset)throw new Error('편집용 그림 정보가 없습니다: '+assetId);const bytes=await store.get(asset.path);if(!bytes)throw new Error('그림 파일이 없습니다: '+asset.name);s.assets.push({id:asset.id,name:asset.name,mime:asset.mime,bytes,width:asset.widthPt??asset.widthPx,height:asset.heightPt??asset.heightPx});usedAssets.add(assetId);return assetId;};
  const left=p.preset.page.marginLeftMm*MM,full=(p.preset.page.widthMm-p.preset.page.marginLeftMm-p.preset.page.marginRightMm)*MM,right=left+full;
  // Consume composition-time fragments; never infer source ranges from PDF text.
  const body=boxes.filter(b=>['paragraph','heading','reference'].includes(b.kind));
  const paragraphs:EditParagraph[]=[];
  let frame:EditableLayoutSnapshot['frames'][number]|undefined,previousBody:typeof body[number]|undefined;
  let previousRegion:EditRect|undefined;
  for(const [index,b]of body.entries()){
    const capture=source.text.find(t=>t.boxId===b.id&&t.page===b.page)?.slice;
    if(!capture&&b.kind!=='reference')throw new Error('확정 본문 조각이 없습니다: '+b.id);
    const region=source.regions?.find(r=>r.page===b.page&&Math.abs(r.x-b.x)<.2&&Math.abs(r.width-b.width)<.2&&r.y<=b.y+.2&&r.y+r.height>=b.y+b.height-.2);
    const separate=!frame||frame.page!==b.page||!sameRect(frame,b)||(region?region!==previousRegion:b.y<frame.y-.1||b.y>frame.y+frame.height+styles.body.leadingPt);
    if(separate){frame={id:'journal:body-frame:'+index,storyId:'journal:body-story',page:b.page,x:region?.x??b.x,y:region?.y??b.y,width:region?.width??b.width,height:region?.height??b.height,contentInsetTop:region?Math.max(0,b.y-region.y):0,order:index,paragraphIds:[]};s.frames.push(frame);}
    else if(!region)frame!.height=Math.max(frame!.height,b.y+b.height-frame!.y);
    const gap=!separate&&previousBody?Math.max(0,b.y-previousBody.y-previousBody.height):0;
    previousBody=b;previousRegion=region;
    const key='placed:'+index;
    s.styles[key]={...(capture?.style??s.styles.reference),before:gap+Math.max(0,(b.contentY??b.y)-b.y),after:Math.max(0, b.height-((b.contentY??b.y)-b.y)-(b.contentHeight??b.height))};
    const runs=capture?.runs??source.referenceRuns.filter(r=>r.key===b.nodeId&&r.text).map(r=>({text:r.text!,italic:r.italic,bold:r.bold}));
    if(!runs.length&&b.text)throw new Error('확정 참고문헌 조각이 없습니다: '+b.nodeId);
    const item:EditParagraph={id:'body:'+index,sourceId:b.nodeId,style:key,runs,start:capture?.start,end:capture?.end,continued:capture?.continued};
    const before=p.document.blocks.findIndex(n=>n.id===b.nodeId),original=p.document.blocks[before],previous=p.document.blocks[before-1];
    if(!capture?.continued){if(previous?.kind==='break')item.breakBefore=previous.target;
      else if(p.preset.sectionNewPage&&original?.kind==='heading'&&original.level===1&&index>0)item.breakBefore='page';}
    paragraphs.push(item);frame!.paragraphIds!.push(item.id);
  }
  if(paragraphs.length)s.stories.push({id:'journal:body-story',paragraphs});
  const front=boxes.find(b=>b.nodeId==='front-matter');
  if(front){
    const authors:EditRun[]=d.authors.flatMap((a,i)=>[...(i?[{text:', '}]:[]),{text:a.name},{text:a.affiliations.join(','),superscript:true}]);
    s.styles.title={...s.styles.title,after:m.titleAfterPt};s.styles.authors={...s.styles.authors,after:m.authorsAfterPt};s.styles.affiliations={...s.styles.affiliations,after:m.affiliationsAfterPt};
    text('front',front,1,[simple('title',reviewTitle(d),'title'),{id:'authors',sourceId:'authors',style:'authors',runs:authors},...d.affiliations.map((a,i)=>({id:'affiliation:'+i,sourceId:'affiliations',style:'affiliations',runs:[{text:d.affiliationMarkers?.[i]??String(i+1),superscript:true},{text:a}]}))]);
  }
  for(const b of boxes.filter(b=>b.kind==='abstract')){
    const padding={left:m.abstractPadLeftMm*MM,right:m.abstractPadRightMm*MM,top:m.abstractPadTopMm*MM,bottom:m.abstractPadBottomMm*MM};
    s.shapes.push({...b,id:'abstract-fill:'+b.page,fill:p.preset.abstract.fill});
    const label=simple('abstract-label:'+b.page,b.fragment?'Abstract (continued):':'Abstract:','abstractLabel');s.styles.abstractLabel.after=m.abstractLabelAfterPt;
    let offset=boxes.filter(q=>q.kind==='abstract'&&q.page<b.page).reduce((n,q)=>n+(q.text?.length??0),0),remaining=b.text?.length??0;const ps:EditParagraph[]=[];
    for(const a of d.abstract){const length=inlineText(visibleInlines(a.content,p.changes)).length;if(offset>=length+1){offset-=length+1;continue;}const take=Math.min(length-offset,remaining);if(take>0)ps.push({...para(a,'abstract'),id:a.id+':'+b.page,runs:inlines(sliceInlines(a.content,offset,offset+take))});remaining-=take+1;offset=0;if(remaining<=0)break;}
    const last=!boxes.some(q=>q.kind==='abstract'&&q.page>b.page);if(last){s.styles.keywords.before=m.keywordsBeforePt;ps.push(simple('keywords',d.keywords.join(', '),'keywords'));ps.at(-1)!.runs.unshift({text:'Keywords: ',color:p.preset.keyColor,bold:true});}
    text('abstract', {x:b.x+padding.left,y:b.y+padding.top,width:b.width-padding.left-padding.right,height:b.height-padding.top-padding.bottom},b.page,[label,...ps]);
  }
  const correspondence=boxes.find(b=>b.nodeId==='correspondence'&&b.kind==='front');
  if(correspondence){const ps:EditParagraph[]=[];
    if(!d.journalMetadata){for(const [label,value]of [['Received: ',d.received],['Revised: ',d.revised],['Accepted: ',d.accepted]])if(value)ps.push({id:label,sourceId:'correspondence',style:'sidebar',runs:[{text:label,bold:true,color:styles.sidebarLabel.color},{text:value}]});
    if(academicChecks(p)||d.authors.some(a=>a.corresponding)){s.styles['correspondence-label']={...s.styles.sidebarLabel,before:ps.length?m.correspondenceGapPt:0};ps.push(simple('correspondence-label','Corresponding author:','correspondence-label'));}
    for(const a of d.authors.filter(a=>a.corresponding))ps.push(simple('correspondence:'+a.name,[a.name,a.address||a.affiliations.map(index=>d.affiliations[Number(index)-1]??'').join('\n'),a.email?'Email: '+a.email:''].filter(Boolean).join('\n'),'sidebar'));
    if(academicChecks(p)&&!d.authors.some(a=>a.corresponding&&(a.name.trim()||a.address?.trim()||a.email?.trim()||a.affiliations.some(i=>d.affiliations[Number(i)-1]?.trim()))))ps.push(simple('correspondence-missing',MISSING_CORRESPONDENCE,'sidebar'));
    }else{
    for(const [i,item]of sidebarItems(p).entries()){
      const style='sidebar:'+item.id;s.styles[style]={...s.styles.sidebar,before:i&&item.separate?m.correspondenceGapPt:0};
      ps.push({id:item.id,sourceId:'correspondence',style,runs:[{text:item.label,bold:true,color:styles.sidebarLabel.color},...(item.separate?[{text:'\n'}]:[]),{text:item.text}]});
    }
    }
    text('correspondence',correspondence,correspondence.page,ps);s.frames.at(-1)!.contentInsetTop=m.correspondenceTopPt;
  }
  for(const [i,b]of boxes.filter(b=>b.kind==='table'||b.kind==='figure').entries()){
    const node=p.document.blocks.find(n=>n.id===b.nodeId);if(!node||(node.kind!=='table'&&node.kind!=='figure'))continue;
    const group=`float:${node.id}:${b.page}:${i}`,fragment=b.fragment??0,contentY=b.contentY??b.y;
    const marks=boxes.filter(q=>q.nodeId===b.nodeId&&q.page===b.page);
    const caption=marks.find(q=>q.kind==='caption'&&q.y>=b.y-.1&&q.y<=b.y+b.height);
    const notes=marks.filter(q=>q.kind==='table-note'&&q.y>=b.y-.1&&q.y<=b.y+b.height).sort((a,b)=>a.y-b.y);
    let start=contentY;
    if(node.kind==='table'){
      const cells=marks.filter(q=>q.kind==='cell'&&b.cellIds?.includes(q.id)&&q.y>=b.y-.1&&q.y<=b.y+b.height),metrics=source.tables.find(t=>t.nodeId===node.id&&t.page===b.page&&t.fragment===fragment);
      if(!metrics)throw new Error('표의 확정 열 너비가 없습니다: '+node.id);
      const rowList=(b.rowIds??[]).map(id=>node.rows.find(r=>r.id===id)).filter((r):r is NonNullable<typeof r>=>!!r);
      const geometry=source.geometry.find(g=>g.kind==='editable-table'&&g.nodeId===node.id&&g.page===b.page&&g.fragment===fragment);
      if(!geometry)throw new Error('표의 확정 위치와 높이가 없습니다: '+node.id);
      start=geometry.y;
      const starts=rowList.map((r,index)=>index===0?geometry.y:Math.min(...cells.filter(c=>r.cells.some(rc=>rc.id===c.id)).map(c=>c.y-p.preset.table.paddingMm*MM)));
      if(starts.some(y=>!Number.isFinite(y)))throw new Error('병합 표의 행 경계를 확정할 수 없습니다: '+node.id);
      const rows=rowList.map((r,index)=>({id:r.id,height:(starts[index+1]??geometry.y+geometry.height)-starts[index],header:r.header}));
      const grid=tableGrid(rowList);
      s.tables.push({id:'journal:table:'+i,sourceId:node.id,page:b.page,x:geometry.x,y:geometry.y,width:geometry.width,height:geometry.height,columns:metrics.columns,rows,cells:grid.map(c=>({id:c.cell.id,row:c.rowIndex,column:c.column,rowspan:Math.min(c.cell.rowspan,rowList.length-c.rowIndex),colspan:c.cell.colspan,paragraphs:c.cell.blocks.map(n=>{const key=`table:${i}:${c.cell.id}`;s.styles[key]={...s.styles.table,indent:0,align:rowList[c.rowIndex].header||(c.column>0&&c.cell.blocks.every(b=>/^[\s\d.+−\-*/()=<>≤≥%,;:†‡]+$/.test(inlineText(b.content))))?'center':'left'};return {...para(n,key),runs:inlines(withoutSourceIndent(n.content))};})})),padding:metrics.padding,paddingY:p.preset.table.paddingMm*MM,ruleColor:p.preset.table.ruleColor??'#000000',outerRule:p.preset.table.outerRulePt,innerRule:p.preset.table.innerRulePt,ruleMode:p.preset.table.ruleMode??'apa',fragment,group});
    }else{
      let assetId=node.assetId;const asset=p.assets.find(a=>a.id===node.assetId);let crop:EditRect|undefined;
      if(node.chart){assetId='chart:'+node.id;s.assets.push({id:assetId,name:node.id+'.svg',mime:'image/svg+xml',bytes:chartSvg(node.chart,p.preset.keyColor),width:720,height:420});s.issues.push({severity:'info',code:'chart-vector',sourceId:node.id,message:'차트는 벡터 그림으로 전달됩니다. 차트 데이터 편집은 HanMark에서 수행하세요.'});}
      else if(!asset){assetId='missing:'+node.id;s.assets.push({id:assetId,name:'missing-figure-'+(node.caption?.number||node.id)+'.svg',mime:'image/svg+xml',bytes:missingFigureSvg(),width:480,height:160});s.issues.push({severity:'warning',sourceSeverity:'error',code:'figure-placeholder',sourceId:node.id,message:missingFigureMessage(node)});}
      else {await useAsset(assetId);if(node.crop?.confirmed&&node.crop.assetSha256===asset?.sha256)crop=node.crop;}
      const geometry=source.geometry.find(g=>g.kind==='editable-image'&&g.nodeId===node.id&&g.page===b.page);
      if(!geometry)throw new Error('그림의 확정 위치와 높이가 없습니다: '+node.id);
      start=geometry.y;
      s.images.push({id:'journal:image:'+i,sourceId:node.id,page:b.page,x:geometry.x,y:geometry.y,width:geometry.width,height:geometry.height,assetId,group,crop,fit:'contain'});
    }
    if(caption&&node.caption){const label=node.kind==='table'?'Table':'Figure',continued=fragment?' (continued)':'';text(group+':caption',{x:b.x,y:caption.y,width:b.width,height:Math.max(1,start-caption.y-spacing.captionGapPt)},b.page,[{id:node.id+':caption:'+fragment,sourceId:node.id,style:'caption',runs:[{text:`${label} ${node.caption.number}${continued}\n`,bold:true},...inlines(node.caption.title).map(r=>({...r,italic:true}))]}],group);}
    if(node.caption)for(const note of notes){const groupNote=tableNoteGroups(node.caption.notes,p).find(g=>g.kind===note.noteKind);if(!groupNote)continue;const st=tableNoteStyle(p.preset).style;s.styles['table-note']={...s.styles.note,size:st.sizePt,leading:st.leadingPt,align:'left',indent:0};text(group+':note:'+note.noteKind,note,b.page,[para(groupNote.paragraph,'table-note')],group);}
    if(node.kind==='figure')for(const note of node.caption?.notes??[]){
      const g=source.geometry.find(g=>g.kind==='editable-note'&&g.nodeId===note.id&&g.page===b.page);
      if(!g)throw new Error('그림 주석의 확정 위치가 없습니다: '+note.id);
      const captured=captureParagraph(note,p,0,inlineText(note.content).length,false,NO_ADJUSTMENT),key='figure-note:'+note.id;
      s.styles[key]=captured.style;text(group+':note:'+note.id,g,b.page,[{id:note.id,sourceId:note.id,style:key,runs:captured.runs}],group);
    }
    // A heading carried with a float is measured by the same composition pass.
    for(const g of source.geometry.filter(g=>g.kind==='editable-heading'&&g.page===b.page&&g.x>=b.x-.1&&g.x<b.x+b.width&&g.y>=b.y-.1&&g.y<start)){
      const n=p.document.blocks.find(n=>n.id===g.nodeId);if(n?.kind!=='heading')throw new Error('연결 제목의 원문이 없습니다: '+g.nodeId);
      const c=captureParagraph(n,p,0,inlineText(n.content).length,false,NO_ADJUSTMENT),key='float-heading:'+n.id;s.styles[key]=c.style;
      text(group+':lead:'+n.id,g,b.page,[{id:n.id,sourceId:n.id,style:key,runs:c.runs}],group);
    }
  }

  if(m.enabled){
    const last=d.firstPage+s.pageCount-1,a=p.preset.appearance;
    const rule=(id:string,page:number,y:number,width:number):void=>{s.shapes.push({id,page,x:left,y:y-width/2,width:full,height:width,fill:a?.colors.rule??p.preset.keyColor,layer:'furniture'});};
    rule('master:top',1,m.topRuleYpt,m.topRulePt);rule('master:bottom',1,m.bottomRuleYpt,m.bottomRulePt);
    const publication=a?.publicationText!==undefined?resolveTemplateText(a.publicationText,p,d.firstPage,last):`${m.journalName}${publicationSuffix(d,last)}\npISSN ${m.printIssn} · eISSN ${m.onlineIssn}${d.doi?'\nhttps://doi.org/'+canonicalDoi(d.doi):''}`;
    text('publication',{x:left,y:m.publicationYpt,width:full-(m.showLogo===false?0:m.logoWidthPt+10),height:m.topRuleYpt-m.publicationYpt-4},1,[simple('publication',publication,'publication')],undefined,undefined,'furniture');
    const copyright=a?.copyrightText!==undefined?resolveTemplateText(a.copyrightText,p,d.firstPage,last):`Copyright © ${copyrightYear(d)} ${m.copyrightOwner}\n${m.licenseText}`;
    if(copyright)text('copyright',{x:left,y:m.copyrightYpt,width:full,height:s.pageHeight-p.preset.page.bottomMm*MM-m.copyrightYpt},1,[simple('copyright',copyright,'copyright')],undefined,undefined,'furniture');
    for(const kind of ['logo','crossmark'] as const){if(kind==='logo'?m.showLogo===false:m.showCrossmark===false)continue;const assetId=kind==='logo'?m.logoAssetId:m.crossmarkAssetId;const w=kind==='logo'?m.logoWidthPt:m.crossmarkWidthPt,y=kind==='logo'?m.logoYpt:m.crossmarkYpt,inset=kind==='logo'?m.logoRightInsetPt:m.crossmarkRightInsetPt;let actualId=assetId;
      if(actualId)await useAsset(actualId);else{actualId='brand:'+kind;const bytes=new TextEncoder().encode(JOURNAL_BRAND_ASSETS[kind==='logo'?'hnmr-logo.svg':'crossmark.svg']),ratio=imageInfo(bytes,kind+'.svg').aspectRatio;s.assets.push({id:actualId,name:kind+'.svg',mime:'image/svg+xml',bytes,width:ratio,height:ratio?1:undefined});}
      const asset=s.assets.find(a=>a.id===actualId),height=kind==='crossmark'?w:Math.max(1,m.topRuleYpt-m.topRulePt/2-y-4);const ratio=asset?.width&&asset.height?asset.width/asset.height:kind==='logo'?3.34:1;const iw=assetId?Math.min(w,height*ratio):w,ih=iw/ratio;
      s.images.push({id:'master:image:'+kind,sourceId:'master:'+kind,page:1,x:right-inset-w+(w-iw)/2,y:y+(assetId?(height-ih)/2:0),width:iw,height:ih,assetId:actualId});
    }
    for(let page=2;page<=s.pageCount;page++){const folio=d.firstPage+page-1;rule('master:rule:'+page,page,m.runningRuleYpt,m.runningRulePt);const header=customHeader(p,'left',folio,last)??(folio%2?source.headers?.odd??articleRunning(d):source.headers?.even??publicationRunning(d,m.journalName));const number=customHeader(p,'right',folio,last)??(publicationMode(d)==='aop'?'':String(folio));const rw=a&&['text','text-page'].includes(a.rightHeader.mode)?full*.35:22;
      const master={id:folio%2?'hnmr:recto':'hnmr:verso',name:folio%2?'Recto · Authors / Short title':'Verso · Journal / Year'};
      s.shapes.at(-1)!.master={...master,item:'running-rule'};
      text('header:'+page,{x:left,y:m.runningHeaderYpt,width:full-rw-6,height:m.runningRuleYpt-m.runningHeaderYpt},page,[simple('header:'+page,header,'runningHeader')],undefined,undefined,'furniture');s.styles.pageNumber.align='right';text('folio:'+page,{x:right-rw-3,y:m.runningHeaderYpt,width:rw,height:m.runningRuleYpt-m.runningHeaderYpt},page,[simple('folio:'+page,number,'pageNumber')],undefined,undefined,'furniture');
      const frames=s.frames.slice(-2);frames[0].master={...master,item:'running-header'};frames[1].master={...master,item:'page-number'};
      for(const [index,side]of (['left','right'] as const).entries()){
        const fieldText='\uFDD0';
        const pattern=(side==='left'?headerOverride(p,folio):d.journalMetadata?.overrides.folio)??(side==='left'?a?.leftHeader.mode==='text'?a.leftHeader.text:undefined:a?.rightHeader.mode==='text'?a.rightHeader.text:a?.rightHeader.mode==='text-page'?[a.rightHeader.text,'{page}'].filter(Boolean).join(' · '):!a||a.rightHeader.mode==='page'?'{page}':undefined);
        if(pattern?.includes('{page}')&&publicationMode(d)!=='aop'){
          const value=resolveTemplateText(pattern.split('{page}').join(fieldText),p,folio,last),parts=value.split(fieldText),runs:EditRun[]=[];
          for(const [i,t]of parts.entries()){if(i)runs.push({text:String(folio),field:'page-number'});if(t)runs.push({text:t});}
          s.stories.find(st=>st.id===frames[index].storyId)!.paragraphs[0].runs=runs;
        }
      }

    }
  }
  for(const run of [...s.stories.flatMap(st=>st.paragraphs.flatMap(p=>p.runs)),...s.tables.flatMap(t=>t.cells.flatMap(c=>c.paragraphs.flatMap(p=>p.runs)))])if(run.imageId)await useAsset(run.imageId);
  finalizeEditableThreads(s);
  s.issues.push(...validateEditableLayout(s));
  return s;
}
