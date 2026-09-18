import {prepareBrandAssets} from './brandAssets';
import {preparePdfAssets,pdfMeasurePath,pdfMeasureSvg,placePdfArtwork,type PdfArtworkPlacement} from "./pdfArtwork";
import {applyArticleOverrides,sidebarItems} from './articleFurniture';
import {academicChecks,referenceChecks,customHeader,resolveTemplateText} from "./appearance";
import {reviewTitle,missingFigureSvg,missingFigureMessage} from './missingContent';
import { JournalEngine, type EngineFile } from "./engine";
import { chartSvg } from "./charts";
import { preferFullTable,measureTableMinimums } from "./tablePolicy";
import {tablePadding,tableHeaderCount} from "./tableGeometry";
import {orderedTableNotes} from "./tableNotes";
import {tableNotesContent} from "./tableNoteContent";
import {auditTableReadability} from "./tableReadability";
import {auditComposition} from "./coverage";
import {bibliographyOrder,referenceContent,type ReferenceRun} from './bibliography';
import {anchorFloats,boundedSearch,compositionQuality,NO_ADJUSTMENT,SEARCH_LIMITS} from './quality';
import {chooseTypography,TypographyMemo,typographyKey} from './typography';
import {captureParagraph,type CapturedParagraph} from './editableCapture';
import {balanceTerminalBand,type BalanceItem} from './balance';
import {editorialIssues,insertEndMatter} from './editorial';
import {bindObjectReferences,applyNumberAssignments,numberByPlacement} from './numbering';
import {sortReferenceBlocks} from './referenceOrder';
import { resolveJournalSpec, masterBackground, styled,headingSpacing,headingTransition } from "./master";
import {copyrightYear,publicationMissing,publicationMode,publicationRunning,articleRunning} from "./publication";
import { JOURNAL_BRAND_ASSETS } from "./embedded.generated";
import { digestBytes, jsonBytes } from "./storage";
import { hayagrivaRecords, validateReference } from "./references";
import { MM, captionContent, literal, paragraphContent, preamble, pt, sliceInlines, tableContent, tableColumns, textContent } from "./typst";
import { cloneJournal, inlineText, visibleInlines, type BinaryStore, type JournalIssue, type JournalProject, type LayoutBox, type LayoutResult, type Paragraph } from "./types";

interface Rect {x:number;y:number;width:number;height:number}
interface Placed extends LayoutBox {content:string;editableText?:CapturedParagraph}
interface Region extends Rect {frameId:string;column:number}
interface Page {number:number;placed:Placed[];full:Rect[]}
interface MeasureRequest {key:string;content:string;width:number;dimension?:"width"}
class ParagraphFitError extends Error {}
const intersects=(a:Rect,b:Rect):boolean=>a.x<b.x+b.width-.1&&a.x+a.width>b.x+.1&&a.y<b.y+b.height-.1&&a.y+a.height>b.y+.1;
function subtract(r:Rect,b:Rect):Rect[]{
  if(!intersects(r,b))return [r];
  const x=Math.max(r.x,b.x),right=Math.min(r.x+r.width,b.x+b.width),y=Math.max(r.y,b.y),bottom=Math.min(r.y+r.height,b.y+b.height);
  return [{x:r.x,y:r.y,width:r.width,height:y-r.y},{x:r.x,y:bottom,width:r.width,height:r.y+r.height-bottom},{x:r.x,y,width:x-r.x,height:bottom-y},{x:right,y,width:r.x+r.width-right,height:bottom-y}].filter(r=>r.width>1&&r.height>1);
}
export class JournalComposer {
  private measures=new Map<string,number>();
  private measureContext="";
  // Numbering may converge through five distinct inputs. One bounded entry per
  // pass avoids alternating original/final numbers evicting each other.
  private typographyCache=Array.from({length:5},()=>new TypographyMemo());
  get typographyStats(){return this.typographyCache.reduce((sum,memo)=>({hits:sum.hits+memo.stats.hits,misses:sum.misses+memo.stats.misses}),{hits:0,misses:0});}
  constructor(private readonly engine:JournalEngine){}
  async compose(projectInput:JournalProject,store:BinaryStore,signal?:AbortSignal,onProgress?:(message:string)=>void,captureEditable=false):Promise<LayoutResult>{
    const reads=new Map<string,Promise<Uint8Array|null>>();
    const cachedStore:BinaryStore={get(path){let read=reads.get(path);if(!read){read=store.get(path);reads.set(path,read);}return read;},put:async(path,bytes)=>{await store.put(path,bytes);reads.set(path,Promise.resolve(bytes));}};
    const prepared=cloneJournal(projectInput),extra=editorialIssues(prepared);
    applyArticleOverrides(prepared);
    if(prepared.editorial?.enabled){extra.push(...bindObjectReferences(prepared),...sortReferenceBlocks(prepared).filter(()=>referenceChecks(prepared)));insertEndMatter(prepared);}
    let assignments:NonNullable<LayoutResult['numbering']>=prepared.document.blocks.flatMap(n=>(n.kind==='table'||n.kind==='figure')?[{id:n.id,kind:n.kind,original:n.caption?.sourceNumber??n.caption?.number??'',number:n.caption?.number??'',page:0}]:[]),result:LayoutResult|undefined;
    const renumber=prepared.editorial?.enabled&&prepared.editorial.numbering==='layout';
    const key=(a:typeof assignments):string=>JSON.stringify(a.map(n=>[n.id,n.number]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0));
    let stable=!renumber;
    for(let pass=0;pass<(renumber?5:1);pass++){
      if(signal?.aborted)throw new Error('조판이 취소됐습니다.');
      const working=cloneJournal(prepared);if(renumber&&assignments.length)applyNumberAssignments(working,assignments);
      result=await this.composeOnce(working,cachedStore,signal,onProgress,captureEditable,pass);
      if(!renumber)break;
      const next=numberByPlacement(prepared,result.boxes);
      if(key(next)===key(assignments)){stable=true;assignments=next;break;}
      if(pass<4)assignments=next;onProgress?.(`표·그림 번호와 배치 순서 확인 ${pass+1}/5`);
    }
    if(!result)throw new Error('조판 결과가 없습니다.');
    if(!stable)extra.push({id:'numbering-convergence',code:'numbering-convergence',severity:'error',message:'번호와 배치 순서가 5회 조판 후에도 안정되지 않았습니다. 개체 위치를 고정한 뒤 확인하세요.'});
    result.numbering=assignments;result.issues.push(...extra);result.fingerprint=await digestBytes(jsonBytes(projectInput));return result;
  }
  private async composeOnce(projectInput:JournalProject,store:BinaryStore,signal?:AbortSignal,onProgress?:(message:string)=>void,captureEditable=false,pass=0):Promise<LayoutResult>{
    const start=performance.now(),project=cloneJournal(projectInput),p=project.preset;
    await prepareBrandAssets(project,store);
    const resolved=resolveJournalSpec(p),{master,styles,spacing}=resolved;
    Object.assign(p.body,styles.body);Object.assign(p.table,styles.table);Object.assign(p.references,styles.reference);
    const check=():void=>{if(signal?.aborted)throw new Error("조판이 취소됐습니다.");};
    const issues:JournalIssue[]=auditTableReadability(project);
    const addIssue=(code:string,message:string,nodeId?:string,severity:JournalIssue["severity"]="warning"):void=>{issues.push({id:`${nodeId??"journal"}:${code}`,code,message,nodeId,severity});};
    const missingFonts=[...Object.values(styles).map(s=>s.font),...(p.fallbackFonts??[])].filter(name=>!project.fonts.some(f=>f.family.toLowerCase()===name.toLowerCase()));
    if(missingFonts.length)throw new Error(`조판에 사용할 글꼴 파일을 등록하세요: ${[...new Set(missingFonts)].join(", ")}`);
    const pdfAssets=await preparePdfAssets(project,store);
    const files:EngineFile[]=[];
    for(const [name,svg]of Object.entries(JOURNAL_BRAND_ASSETS))files.push({path:"/brand/"+name,bytes:new TextEncoder().encode(svg)});
    for(const asset of project.assets){check();const bytes=await store.get(asset.path);if(!bytes){addIssue("asset-missing",`그림 파일 누락: ${asset.name}`,asset.id,"error");continue;}files.push(asset.mime==="application/pdf"?{path:pdfMeasurePath(asset),bytes:pdfMeasureSvg(asset)}:{path:"/"+asset.path,bytes});}
    for(const node of project.document.blocks)if(node.kind==="figure"&&node.chart){
      try{const path=`/charts/${node.id}.svg`,bytes=chartSvg(node.chart,p.keyColor);files.push({path,bytes});node.assetId=path;}
      catch(error){addIssue("chart-unsupported",error instanceof Error?error.message:String(error),node.id,"error");}
    }
    const hasBibliography=project.references.some(r=>r.confirmed);
    if(hasBibliography)files.push({path:"/works.yml",bytes:new TextEncoder().encode(hayagrivaRecords(project.references))});
    const bibliography=hasBibliography?'#bibliography("/works.yml",style:"apa",full:true,title:none)':"";
    for(const file of files)file.sha256=await digestBytes(file.bytes);
    const measureContext=JSON.stringify([this.engine.fontFingerprint,files.map(f=>[f.path,f.sha256]),project.references]);
    if(measureContext!==this.measureContext){this.measures.clear();this.measureContext=measureContext;}
    const measurementBibliography=hasBibliography?`#place(top+left)[#hide[${bibliography}]]`:"";
    const base=preamble(project);
    const measure=async(requests:MeasureRequest[]):Promise<Map<string,number>>=>{
      const cacheKey=(r:MeasureRequest):string=>base+(r.dimension??"height")+r.width+r.content;
      check();const result=new Map<string,number>(),needed=[...new Map(requests.filter(r=>!this.measures.has(cacheKey(r))).map(r=>[cacheKey(r),r])).values()];
      for(let batch=0;batch<needed.length;batch+=100){
        const group=needed.slice(batch,batch+100);
        // Citations depend on their real location in the complete CSL context.
        // Measuring an isolated cite raises an engine error. Lay those blocks
        // out on scratch pages and measure their actual start/end positions.
        const source=base+group.map((r,i)=>r.content.includes('#cite(')?`
#pagebreak(weak:true)
#set page(height:100000pt,margin:0pt)
#set block(above:0pt,below:0pt)
#block(height:0pt)[#metadata(none) <measure-start-${i}>]
#block(width:${pt(r.width)},${r.content})
#v(0pt,weak:false)
#block(height:0pt)[#metadata(none) <measure-end-${i}>]
#context metadata((key:${literal(String(i))},height:(query(<measure-end-${i}>).first().location().position().y - query(<measure-start-${i}>).first().location().position().y)/1pt))
#pagebreak()`:`#context metadata((key:${literal(String(i))},height:${r.dimension==="width"?`measure(${r.content}).width`:`measure(block(width:${pt(r.width)},${r.content})).height`}/1pt))`).join("\n")+"\n"+measurementBibliography;
        const output=await this.engine.compile(source,files,false);check();
        const values=Array.isArray(output.metadata)?output.metadata.filter(v=>v&&typeof v==='object') as {key?:string;height?:number}[]:[];
        for(const [i,r]of group.entries()){const height=values.find(v=>v.key===String(i))?.height;if(typeof height!=="number"||!Number.isFinite(height))throw new Error("조판 측정값이 없습니다.");this.measures.set(cacheKey(r),height);}
      }
      for(const r of requests)result.set(r.key,this.measures.get(cacheKey(r))!);
      while(this.measures.size>5000)this.measures.delete(this.measures.keys().next().value!);return result;
    };
    const height=async(content:string,width:number):Promise<number>=>(await measure([{key:"one",content,width}])).get("one")!;
    const left=p.page.marginLeftMm*MM,right=(p.page.widthMm-p.page.marginRightMm)*MM,top=p.page.topMm*MM,bottom=(p.page.heightMm-p.page.bottomMm)*MM;
    const fullWidth=right-left,gutter=p.page.gutterMm*MM,columnWidth=(fullWidth-gutter)/2;
    const anchored=anchorFloats(project),adjustments=anchored.adjustments;
    for(const id of anchored.unanchored)addIssue('float-anchor-review','본문의 명확한 그림·표 호출을 찾지 못했거나 직전 제목에 묶여 있어 원문 위치를 유지했습니다.',id);
    onProgress?.('본문의 단어 간격과 제한된 자간·가로폭 후보를 비교하고 있습니다.');
    const typeNodes=project.document.blocks.filter((n):n is Paragraph=>n.kind==='paragraph');
    const typeKey=await typographyKey(base,columnWidth,this.engine.fontFingerprint,files,project,typeNodes);check();
    const typography=await this.typographyCache[pass].get(typeKey,()=>chooseTypography(this.engine,base,files,project,typeNodes,columnWidth,check),check);
    // Keep the existing WASM lifetime bound even on a hit. Only candidate
    // selection is reused; final placement and validation still run freshly.
    if(compositionQuality(project).enabled){check();await this.engine.restart();check();}
    adjustments.push(...typography.adjustments);
    const paragraph=(node:Paragraph,width=columnWidth,continued=false,leading=0):string=>paragraphContent(node,project,continued,{...(typography.values.get(node.id)??NO_ADJUSTMENT),leadingPt:leading},width);
    let orderedReferences=project.references.filter(r=>r.confirmed);
    const referenceTexts=new Map<string,string>();
    let referenceRuns:import("./editableExport").JournalEditableSource["referenceRuns"]=[];
    if(hasBibliography){
      const capture=`#let capture-reference(key,body) = {show text: it => {context metadata((kind:"reference-run",key:key,text:it.text${captureEditable?",italic:text.style==\"italic\",bold:if type(text.weight)==int {text.weight>=600} else {text.weight in (\"semibold\",\"bold\",\"extrabold\",\"black\")}":""}));it};body}\n`;
      // Hayagriva assigns same-author/year suffixes from library order. First
      // obtain the CSL bibliography order, then supply that order to both the
      // measurement and final contexts (including 2025a/2025b disambiguation).
      for(let pass=0;pass<2;pass++){
        const result=await this.engine.compile(base+capture+orderedReferences.map(r=>`#block(width:${pt(columnWidth)})[#capture-reference(${literal(r.id)},${referenceContent(r,project)})]`).join('\n')+`\n#capture-reference("__bibliography__")[${bibliography}]`,files,false);check();
        const ordered=bibliographyOrder(orderedReferences,(result.metadata??[]) as ReferenceRun[]);
        if(captureEditable)referenceRuns=(result.metadata as import("./editableExport").JournalEditableSource["referenceRuns"]).filter(r=>r.kind==="reference-run");
        orderedReferences=ordered.references;for(const [key,text]of ordered.texts)referenceTexts.set(key,text);
        if(ordered.ambiguous){if(referenceChecks(project))addIssue('reference-order-review','APA 엔진의 참고문헌 정렬을 고유하게 대응시키지 못했습니다. 중복 레코드를 확인하세요.');break;}
        const works=files.find(f=>f.path==='/works.yml')!;works.bytes=new TextEncoder().encode(hayagrivaRecords(orderedReferences));works.sha256=await digestBytes(works.bytes);
      }
    }
    const floatBefore=spacing.floatBeforeMm*MM,floatAfter=spacing.floatAfterMm*MM;
    const padded=(content:string,before:number):string=>`[#pad(top:${pt(before)})[#block(width:100%,${content})]]`;
    let runningHeaders:{even:string;odd:string}|undefined;
    if(master.enabled){
      const copyright=p.appearance?.copyrightText!==undefined?styled(styles.copyright,`#text(${literal(resolveTemplateText(p.appearance.copyrightText,project))})`):styled(styles.copyright,`#text(${literal(`Copyright © ${copyrightYear(project.document)} ${master.copyrightOwner}`)})#linebreak()#text(${literal(master.licenseText)})`);
      if(master.copyrightYpt+await height(copyright,fullWidth+3)>bottom+.5)addIssue("master-copyright-overflow","판권 문구가 하단 영역보다 깁니다. 문구를 줄이거나 템플릿의 글꼴을 확인하세요.",undefined,"error");
      for(const key of [...(!project.document.title.trim()?["title"]:[]),...(academicChecks(project)?publicationMissing(project.document):[])])addIssue("metadata-"+key,`발행 정보가 비어 있습니다: ${key}`,key==='title'?'publication:title':undefined,key==='title'?'error':'warning');
      if(academicChecks(project)&&!project.document.journalMetadata?.correspondence&&!project.document.authors.some(a=>a.corresponding&&a.name.trim()&&a.email?.trim()))addIssue("corresponding-author","교신저자 이름과 이메일이 없습니다. 발행정보 확인에서 입력하거나 제목·저자 파일을 확인하세요.",'publication:correspondence','error');
      const fitHeader=async(value:string):Promise<string>=>{
        const limit=Math.min(styles.runningHeader.sizePt+.1,master.runningRuleYpt-master.runningHeaderYpt-master.runningRulePt/2-1);
        const fits=async(value:string):Promise<boolean>=>{
          const s=styles.runningHeader;
          // An unbreakable title may paint outside its block without increasing
          // block height. Measure its natural width as well as wrapped height.
          const key=base+"header-width:"+JSON.stringify(s)+value;
          let width=this.measures.get(key);
          if(width===undefined){
            const result=await this.engine.compile(base+`#context metadata((headerWidth:measure(text(font:journal-font(${literal(s.font)}),size:${pt(s.sizePt)},weight:${literal(s.bold?"bold":"regular")},style:${literal(s.italic?"italic":"normal")},tracking:${s.trackingEm}em,${literal(value)})).width/1pt))`,files,false);
            check();width=(result.metadata as {headerWidth?:number}[]).find(m=>typeof m.headerWidth==="number")?.headerWidth;
            if(width===undefined||!Number.isFinite(width))throw new Error("머리말 폭을 측정할 수 없습니다.");
            this.measures.set(key,width);
          }
          return width<=fullWidth-28&&await height(styled(s,`#text(${literal(value)})`),fullWidth-28)<=limit;
        };
        if(await fits(value))return value;
        addIssue("running-header-overflow","머리말이 한 줄 영역보다 길어 검토용 출력에는 줄임표를 표시했습니다. 짧은 머리말 제목이나 머리말 스타일을 지정하세요.",undefined,"error");
        const chars=Array.from(value);let low=0,high=chars.length,best="";
        while(low<=high){const mid=Math.floor((low+high)/2),candidate=chars.slice(0,mid).join("").trimEnd()+"…";if(await fits(candidate)){best=candidate;low=mid+1;}else high=mid-1;}
        return best;
      };
      if(!p.appearance||p.appearance.leftHeader.mode==="legacy")runningHeaders={even:await fitHeader(publicationRunning(project.document,master.journalName)),odd:await fitHeader(articleRunning(project.document))};
    }
    const pages:Page[]=[];
    const page=(number:number):Page=>{while(pages.length<number)pages.push({number:pages.length+1,placed:[],full:[]});return pages[number-1];};
    const frame=(number:number,column:number):Region=>{
      const id=`frame:${number}:${column}`,override=project.overrides.find(o=>o.id===id);
      return {frameId:id,column,x:override?.x??left+column*(columnWidth+gutter),y:override?.y??top,width:override?.width??columnWidth,height:override?.height??bottom-top};
    };
    const regions=(pg:Page,editing=false):Region[]=>{
      const bands=[top,...pg.full.flatMap(r=>[r.y,r.y+r.height]),bottom].sort((a,b)=>a-b);
      const result:Region[]=[];
      for(let i=0;i<bands.length-1;i++){
        if(bands[i+1]-bands[i]<2)continue;
        for(let col=0;col<2;col++){
          const f=frame(pg.number,col),y=Math.max(f.y,bands[i]),end=Math.min(f.y+f.height,bands[i+1]);if(end-y<2)continue;
          let rects:Rect[]=[{x:f.x,y,width:f.width,height:end-y}];
          // Failed fit attempts reserve the remaining band for PDF pagination,
          // not physical artwork. Native frames should still expose that space;
          // explicit breaks/heading keeps remain in the threaded story.
          for(const occupied of pg.placed.filter(b=>!editing||(!["paragraph","heading","reference"].includes(b.kind)&&!(b.kind==='reservation'&&b.nodeId==='skip'))))rects=rects.flatMap(r=>subtract(r,occupied));
          rects.filter(r=>r.width>=25*MM&&r.height>=p.body.sizePt).sort((a,b)=>a.y-b.y||a.x-b.x).forEach(r=>result.push({...r,frameId:f.frameId,column:col}));
        }
      }
      return result;
    };
    const place=(pg:Page,nodeId:string,kind:string,rect:Rect,content:string,extra:Partial<LayoutBox>={},full=false):Placed=>{
      pg.placed=pg.placed.filter(b=>!(b.kind==="pin-reservation"&&b.nodeId===nodeId));
      const box:Placed={id:`${nodeId}:${pg.placed.filter(b=>b.nodeId===nodeId).length}`,nodeId,page:pg.number,...rect,kind,content,...extra};
      if(box.x<left-.5||box.y<top-.5||box.x+box.width>right+.5||box.y+box.height>bottom+.5)addIssue("outside-body","항목이 본문 영역을 벗어났습니다. 위치와 크기를 확인하세요.",nodeId,"error");
      if(pg.placed.some(b=>intersects(b,box)))addIssue("overlap","고정한 항목과 다른 내용이 겹칩니다. 위치를 조정하세요.",nodeId,"error");
      pg.placed.push(box);if(full)pg.full.push(box);return box;
    };
    // Fixed non-text items reserve space before any body text is flowed.
    for(const override of project.overrides){
      if(!override.snapLane)continue;
      override.x=override.snapLane==='right'?left+columnWidth+gutter:left;
      override.width=override.snapLane==='full'?fullWidth:columnWidth;
    }
    const pins=new Map(project.overrides.filter(o=>!o.id.startsWith("frame:")&&o.locked).map(o=>[o.id,o]));
    const priorAt=(pg:Page,r:Rect):Placed|undefined=>pg.placed.filter(b=>["paragraph","heading","table","figure"].includes(b.kind)&&b.content&&b.y+b.height<=r.y+.2&&b.x<r.x+r.width-.2&&b.x+b.width>r.x+.2).sort((a,b)=>(b.y+b.height)-(a.y+a.height))[0];
    const bandStart=(pg:Page,r:Rect):number=>Math.max(top,...pg.full.filter(b=>b.y+b.height<=r.y+.1).map(b=>b.y+b.height));
    const beforeAt=(pg:Page,r:Rect,amount:number):number=>{
      const prior=priorAt(pg,r);
      if(r.y<=bandStart(pg,r)+.1)return 0;
      // Text may later fill the other column above a full-width float. Reserve
      // its clearance across both columns, even if only one has text so far.
      if(!prior||(r.width>columnWidth+1&&prior.width<r.width-.1))return amount;
      return Math.max(0,amount-(prior.clearanceAfterPt??0));
    };
    const headingBeforeAt=(pg:Page,r:Rect,node:Paragraph):number=>{
      if(atRegionStart(pg,r))return 0;
      const previous=priorAt(pg,r),source=previous&&project.document.blocks.find(b=>b.id===previous.nodeId);
      return beforeAt(pg,r,source?.kind==="heading"?headingTransition(p,source.level??1,node.level??1):headingSpacing(p,node.level??1).beforePt);
    };
    onProgress?.("본문과 표의 실제 폭을 측정하고 있습니다.");
    const initial:MeasureRequest[]=[];
    for(const node of project.document.blocks)if(node.kind==="paragraph"||node.kind==="heading")initial.push({key:node.id,content:paragraphContent(node,project),width:columnWidth});
    await measure(initial);
    // Master and abstract fragments use the same measured styles as the final PDF.
    const d=project.document;
    const authors=d.authors.map(a=>`#text(${literal(a.name)})#super(${literal(a.affiliations.join(","))})`).join('#text(", ")');
    const affiliations=d.affiliations.map((a,i)=>`#super(${literal(d.affiliationMarkers?.[i]??String(i+1))})#text(${literal(a)})`).join("#linebreak()");
    const front=`[#${styled(styles.title,`#text(${literal(reviewTitle(d))})`)}#v(${pt(master.titleAfterPt)})#${styled(styles.authors,authors)}#v(${pt(master.authorsAfterPt)})#${styled(styles.affiliations,affiliations)}#v(${pt(master.affiliationsAfterPt)})]`;
    const titleTop=master.enabled?master.titleYpt:top;
    const frontHeight=titleTop-top+await height(front,fullWidth);
    let abstractLastPage=1;
    if(titleTop>top)page(1).placed.push({id:"masthead-reserve",nodeId:"masthead-reserve",page:1,x:left,y:top,width:fullWidth,height:titleTop-top,kind:"reservation",content:""});
    if(master.enabled)page(1).placed.push({id:"copyright-reserve",nodeId:"copyright-reserve",page:1,x:left,y:master.bottomRuleYpt-master.bottomRulePt/2-4,width:fullWidth,height:bottom-(master.bottomRuleYpt-master.bottomRulePt/2-4),kind:"reservation",content:""});
    place(page(1),"front-matter","front",{x:left,y:titleTop,width:fullWidth,height:frontHeight-(titleTop-top)},front,{},true);
    const nodes=anchored.nodes;
    if(d.abstract.length){
      const abstractWidth=master.abstractWidthMm*MM,sidebarX=abstractWidth+master.sidebarGapMm*MM;
      const abstractRuns=d.abstract.map(b=>visibleInlines(b.content,project.changes));
      const abstractText=abstractRuns.map(inlineText).join("\n");
      const fragment=(from:number,to:number):string=>{
        let offset=0;const parts:string[]=[];
        for(const runs of abstractRuns){const len=inlineText(runs).length,a=Math.max(0,from-offset),b=Math.min(len,to-offset);if(b>a)parts.push(textContent(sliceInlines(runs,a,b),project));offset+=len+1;}
        return parts.join("#parbreak()");
      };
      const abstract=(from:number,to:number,minHeight=0):string=>`[#block(fill:rgb(${literal(p.abstract.fill)}),inset:(left:${master.abstractPadLeftMm}mm,right:${master.abstractPadRightMm}mm,top:${master.abstractPadTopMm}mm,bottom:${master.abstractPadBottomMm}mm),width:100%${minHeight?`,height:${pt(minHeight)}`:""})[#${styled(styles.abstractLabel,from?"Abstract (continued):":"Abstract:")}#v(${pt(master.abstractLabelAfterPt)})#${styled(styles.abstract,fragment(from,to))}${to===abstractText.length&&d.keywords.length?`#v(${pt(master.keywordsBeforePt)})#${styled(styles.keywords,`#text(fill:rgb(${literal(p.keyColor)}),"Keywords: ")#text(${literal(d.keywords.join(", "))})`)}`:""}]]`;
      const label=(text:string):string=>`#text(font:journal-font(${literal(styles.sidebarLabel.font)}),size:${pt(styles.sidebarLabel.sizePt)},weight:${literal(styles.sidebarLabel.bold?"bold":"regular")},style:${literal(styles.sidebarLabel.italic?"italic":"normal")},fill:rgb(${literal(styles.sidebarLabel.color)}),${literal(text)})`;
      const dates=[["Received: ",d.received],["Revised: ",d.revised],["Accepted: ",d.accepted]].filter(([,v])=>!!v).map(([l,v])=>label(l)+`#text(${literal(v)})`).join("#linebreak()");
      const correspondence=d.authors.filter(a=>a.corresponding).map(a=>[a.name,a.address||a.affiliations.map(index=>d.affiliations[Number(index)-1]??"").join("\n"),a.email?"Email: "+a.email:""].filter(Boolean).join("\n")).join("\n\n");
      const defaultInfo=`[#v(${pt(master.correspondenceTopPt)})#${styled(styles.sidebar,`${dates?dates+`#v(${pt(master.correspondenceGapPt)})`:""}${correspondence?label("Corresponding author:")+"#linebreak()":""}#text(${literal(correspondence)})`)}]`;
      const info=project.document.journalMetadata?`[#v(${pt(master.correspondenceTopPt)})#${styled(styles.sidebar,sidebarItems(project).map((item,i)=>`${i?item.separate?`#v(${pt(master.correspondenceGapPt)})`:"#linebreak()":""}${label(item.label)}${item.separate?"#linebreak()":""}#text(${literal(item.text)})`).join(''))}]`:defaultInfo;
      const infoHeight=await height(info,fullWidth-sidebarX);
      const firstBottom=master.enabled?master.bottomRuleYpt-master.bottomRulePt/2-4:bottom;
      const correspondenceBox=place(page(1),"correspondence","front",{x:left+sidebarX,y:top+frontHeight,width:fullWidth-sidebarX,height:infoHeight},info,{contentY:top+frontHeight,contentHeight:infoHeight});
      if(top+frontHeight+infoHeight>firstBottom)addIssue("correspondence-overflow","교신저자 영역이 판권 영역을 침범합니다. 소속·주소·제목 영역을 확인하세요.","correspondence","error");
      let from=0,fragmentNumber=0;
      const boundaries=[...abstractText.matchAll(/\s+/g)].map(match=>match.index+match[0].length).filter(n=>n<abstractText.length);
      do {
        const pg=page(abstractLastPage),y=abstractLastPage===1?top+frontHeight:top;
        const limit=(abstractLastPage===1?firstBottom:bottom)-y-master.abstractAfterPt;
        let to=abstractText.length,content=abstract(from,to),h=await height(content,abstractWidth);
        if(h>limit){
          const cuts=boundaries.filter(n=>n>from);let low=0,high=cuts.length-1,best=-1;
          while(low<=high){check();const mid=Math.floor((low+high)/2),candidate=abstract(from,cuts[mid]);const measured=await height(candidate,abstractWidth);if(measured<=limit){best=mid;low=mid+1;}else high=mid-1;}
          if(best<0){
            if(abstractLastPage===1){pg.placed.push({id:"abstract-next",nodeId:"abstract-next",page:1,x:left,y,width:fullWidth,height:Math.max(0,firstBottom-y),kind:"reservation",content:""});abstractLastPage++;continue;}
            throw new Error("초록 한 줄과 패널 여백이 페이지에 들어가지 않습니다. 초록 서식과 판형을 확인하세요.");
          }
          to=cuts[best];content=abstract(from,to);h=await height(content,abstractWidth);
        }
        const rowHeight=Math.max(h,abstractLastPage===1?infoHeight:0);
        if(abstractLastPage===1)correspondenceBox.height=rowHeight;
        if(rowHeight>h+.001)content=abstract(from,to,rowHeight);
        place(pg,"abstract","abstract",{x:left,y,width:abstractWidth,height:rowHeight},content,{fragment:fragmentNumber++,text:abstractText.slice(from,to),contentY:y,contentHeight:h});
        const reserved=rowHeight+master.abstractAfterPt;
        pg.full.push({x:left,y,width:fullWidth,height:reserved});
        pg.placed.push({id:"front-spacer:"+pg.number,nodeId:"front-spacer",page:pg.number,x:left,y,width:fullWidth,height:reserved,kind:"reservation",content:""});
        from=to;if(from<abstractText.length)abstractLastPage++;
        if(abstractLastPage>500)throw new Error("초록 페이지 한도를 넘었습니다.");
      }while(from<abstractText.length);
      if(abstractLastPage>1)addIssue("abstract-continued","긴 초록을 같은 폭과 서식의 패널로 다음 페이지에 이어 배치했습니다.","abstract","info");
    }
    // Reserve explicit constraints before flowing text. The actual item replaces
    // its reservation when reached; unrelated body text cannot occupy that area.
    for(const pin of pins.values()){
      const pg=page(pin.page),rect={x:pin.x,y:pin.y,width:pin.width,height:pin.height??bottom-pin.y};
      pg.placed.push({id:"pin:"+pin.id,nodeId:pin.id,page:pin.page,...rect,kind:"pin-reservation",content:""});
      if(pin.width>columnWidth+1)pg.full.push(rect);
    }
    let current=abstractLastPage,minFloatPage=abstractLastPage;
    const hardBreakPages=new Set<number>();
    const nextRegion=():{pg:Page;r:Region}=>{for(let tries=0;tries<500;tries++){const pg=page(current),r=regions(pg)[0];if(r)return {pg,r};current++;}throw new Error("조판 페이지 한도를 넘었습니다.");};
    const fullSpot=(h:number,minPage=current,useAvailableHeight=false):{pg:Page;r:Rect}=>{
      let n=Math.max(current,minPage);
      const candidates:{value:{pg:Page;r:Rect};key:string;cost:number[]}[]=[];
      const capacity=(candidate:{pg:Page;r:Rect}):number=>{
        let lines=0;
        for(let number=current;number<current+SEARCH_LIMITS.pages;number++)for(let column=0;column<2;column++){
          let free:Rect[]=[frame(number,column)];
          const occupied=[...page(number).placed,...(number===candidate.pg.number?[candidate.r]:[])];
          for(const box of occupied)free=free.flatMap(r=>subtract(r,box));
          lines+=free.filter(r=>r.width>=columnWidth-.1).reduce((sum,r)=>sum+Math.floor((r.height+.01)/p.body.leadingPt),0);
        }
        return lines;
      };
      for(let tries=0;tries<500;tries++,n++){
        const pg=page(n);
        let free:Rect[]=[{x:left,y:top,width:fullWidth,height:bottom-top}];
        for(const box of pg.placed)free=free.flatMap(r=>subtract(r,box));
        const available=free.filter(r=>r.width>=fullWidth-.1&&r.height>=h).sort((a,b)=>a.y-b.y);
        if(!compositionQuality(project).enabled||n>current+1){const r=available[0];if(r)return {pg,r:{...r,height:useAvailableHeight?r.height:h}};}
        else for(const [index,r]of available.entries()){
          const ys=useAvailableHeight?[r.y]:[r.y,Math.max(r.y,r.y+r.height-h)];
          for(const [position,y]of ys.entries()){
            const value={pg,r:{...r,y,height:useAvailableHeight?r.height:h}};
            candidates.push({value,key:`${n}:${index}:${position}`,cost:[n-current,-capacity(value),y-r.y]});
          }
        }
        if(n>=current+1&&candidates.length)return boundedSearch([candidates],()=>true).values[0];
      }throw new Error("전체 폭 항목이 한 페이지보다 큽니다.");
    };
    const atRegionStart=(pg:Page,r:Rect):boolean=>{
      const prior=priorAt(pg,r);
      return r.y<=top+.1||!prior||['table','figure','figure-missing'].includes(prior.kind);
    };
    const splitParagraph=async(node:Paragraph,width:number,limit:number,continued:boolean,leading=0):Promise<{first:Paragraph;rest:Paragraph|null;height:number}>=>{
      const content=visibleInlines(node.content,project.changes),text=inlineText(content);
      const whole=await height(paragraph({...node,content},width,continued,leading),width);
      if(whole<=limit+.1)return {first:{...node,content},rest:null,height:whole};
      const boundaries=[...text.matchAll(/\s+/g)].map(m=>m.index+m[0].length).filter(n=>n>0&&n<text.length);
      if(!boundaries.length)for(let i=1;i<text.length;i++)if(!/[\uDC00-\uDFFF]/.test(text[i]))boundaries.push(i);
      let low=0,high=boundaries.length-1,best=-1,bestHeight=0;
      while(low<=high){check();const mid=Math.floor((low+high)/2),candidate={...node,content:sliceInlines(content,0,boundaries[mid])};const h=await height(paragraph(candidate,width,continued,leading),width);if(h<=limit+.1){best=mid;bestHeight=h;low=mid+1;}else high=mid-1;}
      if(best<0)throw new ParagraphFitError("문단의 한 줄도 텍스트 영역에 들어가지 않습니다.");
      if(node.kind==="paragraph"&&(!node.role||node.role==="body")){
        const minTail=p.body.sizePt+p.body.leadingPt;
        while(best>0){const tail={...node,content:sliceInlines(content,boundaries[best],text.length)};if(await height(paragraph(tail,width,true,leading),width)>=minTail-.1)break;best--;bestHeight=await height(paragraph({...node,content:sliceInlines(content,0,boundaries[best])},width,continued,leading),width);}
      }
      const cut=boundaries[best];return {first:{...node,content:sliceInlines(content,0,cut)},rest:{...node,content:sliceInlines(content,cut,text.length)},height:bestHeight};
    };
    const gridInset=(pg:Page,r:Rect,y:number):number=>{
      const origin=bandStart(pg,r);
      return Math.max(0,Math.ceil((y-origin-.001)/p.body.leadingPt)*p.body.leadingPt+origin-y);
    };
    const placeParagraph=async(node:Paragraph,headingAfterOverride?:number,headingBeforeOverride?:number):Promise<void>=>{
      let rest:Paragraph|null=node,fragment=0,sourceOffset=0;
      while(rest){check();const {pg,r}=nextRegion();
        const h=await height(paragraph(rest,r.width,fragment>0),r.width);
        let after=headingAfterOverride??headingSpacing(p,rest.level??1).afterPt;
        const grid=compositionQuality(project).enabled&&!project.overrides.some(o=>o.id===r.frameId);
        const headBefore=headingBeforeOverride??headingBeforeAt(pg,r,rest);
        const regionStart=atRegionStart(pg,r);
        const before=rest.kind==='heading'?headBefore+(grid&&!regionStart&&headingBeforeOverride===undefined?gridInset(pg,r,r.y+headBefore+h+after):0):grid&&(!rest.role||rest.role==='body'||rest.role==='quote')?gridInset(pg,r,r.y):0;
        // Keep the heading at the region edge; put grid correction below it.
        if(rest.kind==='heading'&&grid&&regionStart&&headingAfterOverride===undefined)after+=gridInset(pg,r,r.y+before+h+after);
        const minimum=rest.kind==="heading"?h+after+2*p.body.leadingPt:rest.keepNext&&h+2*p.body.leadingPt<=bottom-top?h+2*p.body.leadingPt:h<p.body.sizePt+3*p.body.leadingPt?h:2*p.body.leadingPt;
        const partialRegion=r.y>top+.1||r.height<bottom-top-.1;
        if(r.height<minimum+before&&partialRegion){pg.placed.push({id:`skip-${pg.placed.length}`,nodeId:"skip",page:pg.number,...r,kind:"reservation",content:""});continue;}
        let split:Awaited<ReturnType<typeof splitParagraph>>;
        try{split=await splitParagraph(rest,r.width,r.height-before,fragment>0);}catch(error){if(!(error instanceof ParagraphFitError)||!partialRegion)throw error;pg.placed.push({id:`skip-${pg.placed.length}`,nodeId:'skip',page:pg.number,...r,kind:'reservation',content:''});continue;}
        const allocated=Math.min(r.height,rest.kind==="heading"?before+split.height+after:before+Math.ceil((split.height+2)/p.body.leadingPt)*p.body.leadingPt);
        const placed=place(pg,node.id,node.kind,{x:r.x,y:r.y,width:r.width,height:allocated},padded(paragraph(split.first,r.width,fragment>0),before),{text:inlineText(split.first.content),fragment,contentY:r.y+before,contentHeight:split.height,clearanceAfterPt:rest.kind==="heading"?after:0});
        const end=sourceOffset+inlineText(split.first.content).length;
        if(captureEditable)placed.editableText=captureParagraph(split.first,project,sourceOffset,end,fragment>0,{...(typography.values.get(node.id)??NO_ADJUSTMENT),leadingPt:0});
        sourceOffset=end;
        rest=split.rest;fragment++;
      }
    };
    const headingQueue:Paragraph[]=[];
    const flushHeadings=async():Promise<void>=>{
      let firstBefore:number|undefined;
      if(headingQueue.length>1){
        for(let tries=0;tries<500;tries++){
          const {pg,r}=nextRegion();let needed=2*p.body.leadingPt+headingBeforeAt(pg,r,headingQueue[0]);
          for(const [i,h]of headingQueue.entries())needed+=await height(paragraphContent(h,project),r.width)+(i+1<headingQueue.length?headingTransition(p,h.level??1,headingQueue[i+1].level??1):headingSpacing(p,h.level??1).afterPt);
          const extra=compositionQuality(project).enabled&&!atRegionStart(pg,r)&&!project.overrides.some(o=>o.id===r.frameId)?gridInset(pg,r,r.y+needed-2*p.body.leadingPt):0;
          if(r.height>=needed+extra||r.y<=top+.1){firstBefore=headingBeforeAt(pg,r,headingQueue[0])+extra;break;}
          pg.placed.push({id:`skip-${pg.placed.length}`,nodeId:"skip",page:pg.number,...r,kind:"reservation",content:""});
        }
      }
      for(const [i,h]of headingQueue.entries())await placeParagraph(h,i+1<headingQueue.length?headingTransition(p,h.level??1,headingQueue[i+1].level??1):undefined,i===0?firstBefore:0);headingQueue.length=0;
    };
    const emittedReferences=new Set<string>();
    const placeReference=async(ref:typeof orderedReferences[number]):Promise<void>=>{
      if(emittedReferences.has(ref.id))return;
      const content=referenceContent(ref,project);
      for(let attempt=0;attempt<500;attempt++){
        const {pg,r}=nextRegion(),h=await height(content,r.width);
        if(h>bottom-top){addIssue('reference-too-tall','참고문헌 한 항목이 페이지보다 깁니다. 원본 정보와 문단 구조를 검토하세요.',ref.id,'error');return;}
        if(h>r.height+.1){pg.placed.push({id:`skip-${pg.placed.length}`,nodeId:'skip',page:pg.number,...r,kind:'reservation',content:''});continue;}
        place(pg,ref.id,'reference',{...r,height:Math.min(r.height,Math.ceil((h+2)/styles.reference.leadingPt)*styles.reference.leadingPt)},content,{text:referenceTexts.get(ref.id),contentY:r.y,contentHeight:h});
        emittedReferences.add(ref.id);return;
      }
      addIssue('reference-placement','참고문헌을 배치할 수 없습니다.',ref.id,'error');
    };
    const allReferencesConfirmed=project.references.every(r=>r.confirmed);
    for(let index=0;index<nodes.length;index++){
      check();const node=nodes[index];onProgress?.(`항목 ${index+1}/${nodes.length} 배치 중`);
      if(node.kind==='anchor')continue;
      if(node.kind==="heading"){if(p.sectionNewPage&&node.level===1&&index>0){await flushHeadings();current++;}headingQueue.push(node);continue;}
      if(node.kind==="break"){await flushHeadings();hardBreakPages.add(current);if(node.target==="page")current++;else{const {pg,r}=nextRegion();pg.placed.push({id:`skip-${pg.placed.length}`,nodeId:"skip",page:pg.number,...r,kind:"reservation",content:""});}hardBreakPages.add(current);continue;}
      if(node.kind==="unsupported"){await flushHeadings();addIssue("unsupported-content",node.description,node.id,"error");await placeParagraph({id:node.id,kind:"paragraph",content:[{text:p.body.language==='en'?'[Unsupported source object — review required] ':`[${node.description}] `},...node.content]});continue;}
      if(node.kind==="paragraph"){
        if(!inlineText(visibleInlines(node.content,project.changes)).trim()&&!node.content.some(r=>r.assetId))continue;
        const confirmed=node.role==='reference'&&orderedReferences.find(r=>r.sourceParagraphIds?.includes(node.id)||r.raw.trim()===inlineText(node.content).trim());
        if(confirmed){await flushHeadings();if(allReferencesConfirmed){for(const ref of orderedReferences)await placeReference(ref);}else await placeReference(confirmed);continue;}
        await flushHeadings();await placeParagraph(node);continue;
      }
      const floatHeadings=headingQueue.splice(0);
      const headingContent=(width:number)=>floatHeadings.map((h,i)=>`#context {let pos=here().position();metadata((kind:"source-text",id:${literal(h.id)},nodeId:${literal(h.id)},text:${literal(inlineText(visibleInlines(h.content,project.changes)))},page:here().page(),x:pos.x/1pt,y:pos.y/1pt,width:0,height:0))}`+(captureEditable?`#context {let pos=here().position();metadata((kind:"editable-heading",nodeId:${literal(h.id)},fragment:0,page:here().page(),x:pos.x/1pt,y:pos.y/1pt,width:${width},height:measure(block(width:${pt(width)},${paragraphContent(h,project)})).height/1pt))}`:"")+"#"+paragraphContent(h,project)+`#v(${pt(i+1<floatHeadings.length?headingTransition(p,h.level??1,floatHeadings[i+1].level??1):headingSpacing(p,h.level??1).afterPt)})`).join("");
      const pin=pins.get(node.id);
      if(node.kind==="figure"){
        const asset=project.assets.find(a=>a.id===node.assetId);let path=node.chart?node.assetId:asset?(asset.mime==="application/pdf"?pdfMeasurePath(asset):"/"+asset.path):"";
        const missing=!path;
        if(missing){
          addIssue('figure-missing',missingFigureMessage(node),node.id,'error');
          path=`/missing/${node.id}.svg`;files.push({path,bytes:missingFigureSvg()});
        }
        const crop=node.crop?.confirmed&&node.crop.assetSha256===asset?.sha256?node.crop:undefined;
        const rawAspect=asset?.aspectRatio??(asset?.widthPx&&asset.heightPx?asset.widthPx/asset.heightPx:undefined);
        const aspect=missing?3:rawAspect&&crop?rawAspect*crop.width/crop.height:rawAspect;
        const wide=pin?pin.width>columnWidth+1:node.width==="full"||(node.width==="auto"&&(!!node.chart||(aspect??0)>1.6));
        const width=pin?.width??(wide?fullWidth:columnWidth);
        const caption=node.caption?"#"+captionContent(node.caption.number,node.caption.title,"Figure",project,node.id):"";
        const notes=node.caption?.notes.length?`#v(${pt(spacing.noteGapPt)})`+node.caption.notes.map(n=>(captureEditable?`#context {let pos=here().position();metadata((kind:"editable-note",nodeId:${literal(n.id)},fragment:0,page:here().page(),x:pos.x/1pt,y:pos.y/1pt,width:${width},height:measure(block(width:${pt(width)},${paragraphContent(n,project)})).height/1pt))}`:'')+"#"+paragraphContent(n,project)).join(""):"";
        const extras=await height(`[${headingContent(width)}${caption}${notes}]`,width);
        const maxHeight=(pin?.height??bottom-top)-floatBefore-floatAfter-extras-4;
        if(maxHeight<12){addIssue("figure-caption-space","고정한 영역에 캡션과 그림이 함께 들어가지 않습니다.",node.id,"error");continue;}
        const natural=node.chart?width*420/720:aspect?width/aspect:undefined;
        const imageHeight=natural?Math.min(natural,maxHeight):maxHeight;
        const croppedWidth=Math.min(width,imageHeight*(aspect??1));
        const picture=crop?`#align(center)[#box(width:${pt(croppedWidth)},height:${pt(imageHeight)},clip:true)[#place(top+left,dx:${pt(-croppedWidth*crop.x/crop.width)},dy:${pt(-imageHeight*crop.y/crop.height)})[#image(${literal(path)},width:${pt(croppedWidth/crop.width)},height:${pt(imageHeight/crop.height)})]]]`:`#image(${literal(path)},width:${pt(width)},height:${pt(imageHeight)},fit:"contain")`;
        const pictureMarker=captureEditable||asset?.mime==="application/pdf"?`#context {let pos=here().position();metadata((kind:"editable-image",nodeId:${literal(node.id)},fragment:0,page:here().page(),x:pos.x/1pt+${crop?(width-croppedWidth)/2:0},y:pos.y/1pt,width:${crop?croppedWidth:width},height:${imageHeight}))}`:'';
        const content=`[${headingContent(width)}${caption}${pictureMarker}${picture}${notes}]`;
        const h=await height(content,width);
        if(h>bottom-top){addIssue("figure-too-tall","그림과 캡션이 한 페이지보다 큽니다.",node.id,"error");continue;}
        let target: {pg:Page;r:Rect};
        if(pin)target={pg:page(pin.page),r:{x:pin.x,y:pin.y,width,height:h+floatBefore+floatAfter}};
        else if(wide)target=fullSpot(h+floatBefore+floatAfter,minFloatPage);
        else{
          // Consecutive floats can already occupy both current and next pages.
          // Continue the search; never drop the remaining figures in the queue.
          let candidate:{pg:Page;r:Region}|undefined;
          for(let n=Math.max(current,minFloatPage);n<Math.max(current,minFloatPage)+500;n++){
            const pg=page(n),r=regions(pg).find(r=>r.width>=width-.1&&r.height>=h+floatAfter+beforeAt(pg,r,floatBefore)-.1);
            if(r){candidate={pg,r};break;}
          }
          if(!candidate){addIssue("figure-placement","그림이 들어갈 영역이 없습니다.",node.id,"error");continue;}
          target={pg:candidate.pg,r:{...candidate.r,width,height:h+floatBefore+floatAfter}};
        }
        const before=beforeAt(target.pg,target.r,floatBefore);
        place(target.pg,node.id,"figure",{...target.r,height:h+before+floatAfter},padded(content,before),{locked:!!pin,contentY:target.r.y+before,contentHeight:h,clearanceBeforePt:before,clearanceAfterPt:floatAfter},wide);minFloatPage=target.pg.number;
        if(target.pg.number>current+1)addIssue("float-distance","그림이 원문 위치에서 한 페이지 이상 떨어졌습니다.",node.id);
        if(asset?.widthPx){const dpi=asset.widthPx/(width/72);if(dpi<p.photoDpi)addIssue("image-resolution",`이 배치 폭에서 그림 해상도는 ${Math.round(dpi)}dpi입니다.`,node.id);}
        continue;
      }
      if(node.kind==="table"){
        if(node.normalization&&!node.normalization.confirmed)addIssue("table-normalization-unconfirmed","정리된 통계표의 행·열 대응을 개체 패널에서 원본과 비교하고 확정하세요.",node.id,"error");
        await measureTableMinimums(node,project,measure);
        const headerEnd=tableHeaderCount(node.rows);
        const header=node.rows.slice(0,headerEnd),body=node.rows.slice(headerEnd);
        const fullExpr=tableContent(node,node.rows,fullWidth,project),colExpr=tableContent(node,node.rows,columnWidth,project);
        const measures=await measure([{key:"full",content:fullExpr,width:fullWidth},{key:"col",content:colExpr,width:columnWidth}]);
        let wide=node.width==="full";
        if(node.width==="auto")wide=(await preferFullTable(node,project,columnWidth,fullWidth,measures.get("col")!,measures.get("full")!,bottom-top,measure)).full;
        if(pin)wide=pin.width>columnWidth+1;
        const width=pin?.width??(wide?fullWidth:columnWidth);
        let cursor=0,fragment=0,targetPage=Math.max(current,minFloatPage);
        while(cursor<body.length||fragment===0){check();
          const caption=node.caption?"#"+captionContent(node.caption.number+(fragment?" (continued)":""),node.caption.title,"Table",project,node.id):"";
          const prefix=(fragment===0?headingContent(width):"")+caption;
          let target:{pg:Page;r:Rect};
          if(pin&&fragment===0)target={pg:page(pin.page),r:{x:pin.x,y:pin.y,width,height:pin.height??bottom-pin.y}};
          else if(wide)target=fullSpot(30,targetPage,true);
          else {const candidate=nextRegion();target={pg:candidate.pg,r:{...candidate.r,width}};}
          const before=beforeAt(target.pg,target.r,floatBefore),available=target.r.height-floatAfter-before;
          let end=cursor,best="",bestHeight=0;
          while(end<body.length || (end===cursor&&body.length===0)){
            let groupEnd=end+1;
            for(let j=end;j<Math.min(groupEnd,body.length);j++)for(const cell of body[j].cells)groupEnd=Math.max(groupEnd,j+cell.rowspan);
            groupEnd=Math.min(body.length,groupEnd);
            const notes=groupEnd===body.length?tableNotesContent(node.caption?.notes??[],node.id,width,project):"";
            const candidate=`[${prefix}#${tableContent(node,[...header,...body.slice(cursor,groupEnd)],width,project)}${notes}]`;
            const h=await height(candidate,width);
            if(h>available+.1)break;
            best=candidate;bestHeight=h;end=groupEnd;if(end===body.length)break;
          }
          if(!best){
            if(pin&&fragment===0){addIssue("table-pin-too-small","고정한 영역에 표 머리행과 첫 데이터 행이 들어가지 않습니다. 영역을 넓히거나 자동 배치로 복원하세요.",node.id,"error");break;}
            if(target.r.y>top+.1 || target.r.height<bottom-top-1){if(wide)targetPage=target.pg.number+1;else{target.pg.placed.push({id:`skip-${target.pg.placed.length}`,nodeId:"skip",page:target.pg.number,...target.r,kind:"reservation",content:""});}continue;}
            addIssue("table-row-too-tall","표의 머리행 또는 병합 행이 한 페이지보다 큽니다. 셀 문단을 나누거나 표 구조를 조정하세요.",node.id,"error");
            // Preserve every cell in a readable continuation when a row cannot fit.
            for(const row of [...header,...body.slice(cursor)])for(const cell of row.cells)for(const b of cell.blocks)await placeParagraph({...b,id:`${node.id}:${cell.id}:${b.id}`});
            for(const note of orderedTableNotes(node.caption?.notes??[]))await placeParagraph(note);
            break;
          }
          // Capture only the chosen fragment; candidate measurements do not
          // need another measurement of the table merely to report its height.
          if(captureEditable)best=`[${prefix}#${tableContent(node,[...header,...body.slice(cursor,end)],width,project,fragment)}${end===body.length?tableNotesContent(node.caption?.notes??[],node.id,width,project):""}]`;
          place(target.pg,node.id,"table",{...target.r,height:before+bestHeight+floatAfter},padded(best,before),{fragment,rowIds:[...header,...body.slice(cursor,end)].map(r=>r.id),cellIds:[...header,...body.slice(cursor,end)].flatMap(r=>r.cells.map(c=>c.id)),locked:!!pin,contentY:target.r.y+before,contentHeight:bestHeight,clearanceBeforePt:before,clearanceAfterPt:floatAfter},wide);
          if(fragment===0&&target.pg.number>current+1)addIssue("float-distance","표 첫 조각이 원문 위치에서 한 페이지 이상 떨어졌습니다.",node.id);
          cursor=end;fragment++;targetPage=target.pg.number+1;minFloatPage=target.pg.number;
          if(cursor===body.length)break;
        }
      }
    }
    await flushHeadings();check();
    if(orderedReferences.some(r=>!emittedReferences.has(r.id))){
      if(!nodes.some(n=>n.kind==='heading'&&/^references\s*$/i.test(inlineText(n.content).trim())))await placeParagraph({id:'references-heading',kind:'heading',level:1,content:[{text:'References'}]});
      for(const ref of orderedReferences)await placeReference(ref);
    }
    const quality=compositionQuality(project);
    if(quality.enabled&&quality.balanceColumns){
      const pg=pages[pages.findLastIndex(pg=>pg.placed.some(b=>b.content))];
      if(pg){
        const barriers=pg.placed.filter(b=>b.content&&!['paragraph','heading','reference'].includes(b.kind));
        const bandTop=Math.max(top,...barriers.filter(b=>b.width>columnWidth+1).map(b=>b.y+b.height));
        const movable=pg.placed.filter(b=>['paragraph','heading','reference'].includes(b.kind)&&b.y>=bandTop-.1);
        const fixed=hardBreakPages.has(pg.number)||project.overrides.some(o=>o.page===pg.number)||barriers.some(b=>b.width<=columnWidth+1)||movable.some(b=>quality.disabledNodes.includes(b.nodeId));
        if(fixed)addIssue('balance-constrained','마지막 페이지는 수동 나눔·고정 영역·한 단 그림·항목별 보정 해제로 인해 단 높이 보정을 생략했습니다.');
        else if(movable.length>1){
          const items:BalanceItem[]=[];
          for(const box of movable){
            const previous=items.at(-1);
            if(previous&&previous.nodeId===box.nodeId&&box.kind==='paragraph'){previous.text=(previous.text??'')+(box.text??'');continue;}
            const before=pages.flatMap(p=>p.placed).filter(b=>b.nodeId===box.nodeId&&b.kind===box.kind&&(b.page<pg.number||(b.page===pg.number&&!movable.includes(b)))).reduce((n,b)=>n+(b.text?.length??0),0);
            items.push({nodeId:box.nodeId,kind:box.kind,text:box.text,fragment:box.fragment??0,offset:before});
          }
          const originals=new Map(movable.map(b=>[b.nodeId,b]));
          const balanced=await balanceTerminalBand({page:pg.number,left,right:left+columnWidth+gutter,width:columnWidth,top:bandTop,bottom,line:p.body.leadingPt,leadingLimit:quality.leadingLimitPt,spaceLimit:quality.spaceLimitPt,items,check,part:async(item,available,leading,position)=>{
            const old=originals.get(item.nodeId)!;
            if(item.kind==='heading'){
              const original=nodes.find(n=>n.id===item.nodeId);if(!original||original.kind!=='heading')return null;
              const previous=nodes.find(n=>n.id===position.previous?.nodeId),next=nodes.find(n=>n.id===items[items.findIndex(i=>i.nodeId===item.nodeId)+1]?.nodeId);
              const before=position.start?0:previous?.kind==='heading'?Math.max(0,headingTransition(p,previous.level??1,original.level??1)-(position.previous?.clearanceAfterPt??0)):headingSpacing(p,original.level??1).beforePt;
              const h=old.contentHeight??await height(paragraph(original),columnWidth),line=p.body.leadingPt+leading;
              let after=next?.kind==='heading'?headingTransition(p,original.level??1,next.level??1):headingSpacing(p,original.level??1).afterPt;
              if(next?.kind!=='heading'){const y=position.y+before+h+after;after+=Math.max(0,Math.ceil((y-bandTop-.001)/line)*line+bandTop-y);}
              if(before+h+after+2*line>available+.1)return null;
              return {box:{...old,height:before+h+after,content:padded(paragraph(original),before),contentY:before,contentHeight:h,clearanceAfterPt:after},rest:null};
            }
            if(item.kind==='reference'){
              if(old.height>available+.1)return null;
              return {box:{...old,contentY:(old.contentY??old.y)-old.y},rest:null};
            }
            const original=nodes.find(n=>n.id===item.nodeId);
            if(!original||original.kind!=='paragraph')return null;
            const content=sliceInlines(visibleInlines(original.content,project.changes),item.offset,item.offset+(item.text?.length??0)),node={...original,content};
            const natural=await height(paragraph(node,columnWidth,item.fragment>0,leading),columnWidth),line=p.body.leadingPt+leading;
            if(available<Math.min(natural,2*line)-.1)return null;
            let split:Awaited<ReturnType<typeof splitParagraph>>;
            try{split=await splitParagraph(node,columnWidth,available,item.fragment>0,leading);}catch(error){if(error instanceof ParagraphFitError)return null;throw error;}
            const text=inlineText(split.first.content);
            const h=Math.min(available,Math.ceil(split.height/line)*line);
            return {box:{nodeId:item.nodeId,kind:'paragraph',height:h,content:paragraph(split.first,columnWidth,item.fragment>0,leading),text,fragment:item.fragment,contentY:0,contentHeight:split.height,clearanceAfterPt:0,...(captureEditable?{editableText:captureParagraph(split.first,project,item.offset,item.offset+text.length,item.fragment>0,{...(typography.values.get(item.nodeId)??NO_ADJUSTMENT),leadingPt:leading})}:{})},rest:split.rest?{...item,text:inlineText(split.rest.content),fragment:item.fragment+1,offset:item.offset+text.length}:null};
          }});
          if(balanced){
            const oldBottom=(x:number):number=>Math.max(bandTop,...movable.filter(b=>Math.abs(b.x-x)<.1).map(b=>(b.contentY??b.y)+(b.contentHeight??b.height)));
            const priorDifference=Math.abs(oldBottom(left)-oldBottom(left+columnWidth+gutter));
            if(balanced.difference<priorDifference-.1){
              pg.placed=pg.placed.filter(b=>!movable.includes(b)&&!(b.kind==='reservation'&&b.y>=bandTop));
              pg.placed.push(...balanced.boxes);
              adjustments.push({nodeId:items[0].nodeId,rule:'last-column-balance',before:Math.round(priorDifference*100)/100,after:Math.round(balanced.difference*100)/100,reason:`마지막 단 높이 차이(pt); 공통 줄높이 보정 ${balanced.leading.toFixed(1)}pt, 문단 여백 ${balanced.space}pt, ${balanced.expansions}개 배치 검사`});
            }
            if(balanced.difference>p.body.leadingPt+.1)addIssue('balance-unresolved','참고문헌·제목 묶음과 최소 줄 수를 유지하면 마지막 단 높이를 한 줄 이내로 맞출 수 없습니다.');
          }else addIssue('balance-unresolved','현재 고정 영역과 최소 줄 수를 유지하는 단 높이 후보가 없습니다.');
        }
      }
    }
    // Keep page indices stable when the editor pins an item beyond a blank page.
    const lastVisible=pages.findLastIndex(pg=>pg.placed.some(b=>b.content));
    const visiblePages=pages.slice(0,lastVisible+1);
    if(p.appearance&&master.enabled){
      const a=p.appearance,last=d.firstPage+visiblePages.length-1;
      const checkText=async(label:string,text:string,style:typeof styles.body,width:number,limit:number,singleLine=false):Promise<void>=>{
        if(!text)return;
        const natural=(v:string):string=>`[#text(font:journal-font(${literal(style.font)}),size:${pt(style.sizePt)},weight:${literal(style.bold?"bold":"regular")},style:${literal(style.italic?"italic":"normal")},tracking:${style.trackingEm}em,${literal(v)})]`;
        const words=singleLine?[text]:[...new Set(text.split(/\s+/).filter(Boolean))];
        const widths=await measure(words.map((word,i)=>({key:String(i),content:natural(word),width,dimension:"width"})));
        if([...widths.values()].some(w=>w>width+.1)||await height(styled(style,`#text(${literal(text)})`),width)>limit+.1)addIssue("template-"+label+"-overflow",`${label}: 문구가 고정 영역을 넘습니다. 문구를 줄이거나 글꼴을 확인하세요.`,"publication:"+label,"error");
      };
      if(a.publicationText!==undefined)await checkText("issue",resolveTemplateText(a.publicationText,project,d.firstPage,last),styles.publication,master.showLogo!==false?fullWidth-master.logoWidthPt-10:fullWidth,master.topRuleYpt-master.topRulePt/2-master.publicationYpt-3);
      if(a.publicationText===undefined)await checkText("issue",master.journalName+" "+(publicationMode(d)==="aop"?d.year:[d.year,d.volume+"("+d.issue+")",d.firstPage+"–"+last].join("; ")),styles.publication,master.showLogo!==false?fullWidth-master.logoWidthPt-10:fullWidth,master.topRuleYpt-master.topRulePt/2-master.publicationYpt-3,true);
      if(a.copyrightText!==undefined)await checkText("copyright",resolveTemplateText(a.copyrightText,project,d.firstPage,last),styles.copyright,fullWidth,bottom-master.copyrightYpt);
      const rightWidth=["text","text-page"].includes(a.rightHeader.mode)?fullWidth*.35:22;
      for(let i=1;i<visiblePages.length;i++)for(const side of ["left","right"] as const){
        const value=customHeader(project,side,d.firstPage+i,last);if(value===undefined)continue;
        await checkText("header-"+side,value,side==="left"?styles.runningHeader:styles.pageNumber,side==="left"?fullWidth-rightWidth-6:rightWidth,master.runningRuleYpt-master.runningRulePt/2-master.runningHeaderYpt-1,true);
      }
    }
    let source=base+masterBackground(project,runningHeaders,visiblePages.length);
    const footer=`#set page(header:[#set text(size:8pt,fill:rgb(${literal(p.keyColor)}));#text(${literal(d.runningTitle||d.title)})#v(3pt)#line(length:100%,stroke:.5pt+rgb(${literal(p.keyColor)}))],footer:[#set text(size:8pt);#grid(columns:(1fr,auto),[Health & New Media Research],[${publicationMode(d)==="aop"?"":`#context (${d.firstPage}-1+counter(page).get().first())`}])])\n`;
    if(!master.enabled)source+=footer;
    for(const [i,pg]of visiblePages.entries()){
      if(i)source+="\n#pagebreak()\n";
      for(const box of pg.placed)if(box.content)source+=`#place(top+left,dx:${pt(box.x-left)},dy:${pt(box.y-top)})[#block(width:${pt(box.width)},${box.content})]\n`;
    }
    if(hasBibliography)source+='\n'+measurementBibliography+'\n';
    source+="#context metadata((pages:counter(page).final().first()))\n";
    const output=await this.engine.compile(source,files);check();
    if(!output.pdf)throw new Error("PDF 생성에 실패했습니다.");
    for(const diagnostic of output.diagnostics)if(diagnostic&&typeof diagnostic==="object"&&"message" in diagnostic)addIssue("engine-diagnostic",String(diagnostic.message));
    const metadata=Array.isArray(output.metadata)?output.metadata as ({pages?:number;requiredWidth?:number}&Partial<LayoutBox>)[]:[];
    for(const cell of metadata)if(cell.kind==='cell'&&typeof cell.requiredWidth==='number'&&typeof cell.width==='number'&&cell.requiredWidth>cell.width+.1)addIssue('table-value-too-wide','표의 숫자·괄호값을 쪼개지 않고 담을 폭이 부족합니다. 표 폭이나 열 구성을 조정하세요.',cell.nodeId,'error');
    const pageCount=metadata.find(m=>typeof m.pages==="number")?.pages??visiblePages.length;
    for(const reference of referenceChecks(project)?project.references:[]){issues.push(...validateReference(reference));if(!reference.confirmed)addIssue("reference-unconfirmed","참고문헌 서지정보가 아직 확정되지 않았습니다.",reference.id);}
    const boxes:LayoutBox[]=visiblePages.flatMap(pg=>pg.placed.filter(b=>b.kind!=="reservation").map(({content:_,editableText:__,...box})=>box));
    if(master.enabled){
      const zone=(name:string,text:string,x:number,y:number,width:number,height:number):void=>{boxes.push({id:"publication:"+name,nodeId:"publication:"+name,page:1,kind:"metadata",text,x,y,width,height});};
      zone("issue","발행정보 수정",left,master.publicationYpt,fullWidth-master.logoWidthPt-8,master.topRuleYpt-master.publicationYpt);
      zone("brand","로고·Crossmark 설정",right-master.logoWidthPt-3,Math.min(master.logoYpt,master.crossmarkYpt),master.logoWidthPt+5,master.topRuleYpt-Math.min(master.logoYpt,master.crossmarkYpt));
      zone("title","제목·저자 수정",left,titleTop,fullWidth,Math.max(24,frontHeight-(titleTop-top)));
      for(const a of boxes.filter(b=>b.kind==='abstract'))boxes.push({id:'metadata:abstract:'+a.page,nodeId:'abstract',kind:'metadata',page:a.page,x:a.x,y:a.y,width:a.width,height:a.height,text:'초록·키워드 수정'});
      for(let pg=2;pg<=pageCount;pg++){
        boxes.push({id:'publication:header:'+pg,nodeId:'publication:header-'+(pg%2?'odd':'even'),kind:'metadata',page:pg,x:left,y:master.runningHeaderYpt,width:fullWidth-35,height:Math.max(14,master.runningRuleYpt-master.runningHeaderYpt),text:'러닝헤드 수정'});
        boxes.push({id:'publication:folio:'+pg,nodeId:'publication:folio',kind:'metadata',page:pg,x:right-32,y:master.runningHeaderYpt,width:32,height:14,text:'쪽번호 문구 수정'});
      }
      const side=boxes.find(b=>b.nodeId==="correspondence");if(side)zone("correspondence","날짜·교신저자 수정",side.x,side.y,side.width,side.height);
      zone("copyright","판권·라이선스 수정",left,master.copyrightYpt,fullWidth,bottom-master.copyrightYpt);
    }
    for(const value of metadata)if(value.kind&&["cell","table-note","source-text","caption","reference"].includes(value.kind)&&typeof value.id==="string"&&typeof value.page==="number"&&typeof value.x==="number"&&typeof value.y==="number"&&typeof value.width==="number"&&typeof value.height==="number")boxes.push({...value,id:value.id,nodeId:value.nodeId??value.id,page:value.page,x:value.x,y:value.y,width:value.width,height:value.height,kind:value.kind});
    for(const pg of visiblePages)for(let col=0;col<2;col++){const f=frame(pg.number,col);boxes.push({id:f.frameId,nodeId:f.frameId,page:pg.number,...f,kind:"text-frame",locked:project.overrides.some(o=>o.id===f.frameId)});}
    const coverage=auditComposition(project,boxes);issues.push(...coverage.issues);
    const artwork:PdfArtworkPlacement[]=[];
    for(const v of metadata){
      if(v.kind!=="editable-image"&&v.kind!=="pdf-artwork")continue;
      const n=project.document.blocks.find(n=>n.id===v.nodeId),assetId=v.kind==="pdf-artwork"?v.nodeId:n?.kind==="figure"?n.assetId:undefined;
      if(assetId&&pdfAssets.has(assetId)&&v.page!==undefined&&v.x!==undefined&&v.y!==undefined&&v.width!==undefined&&v.height!==undefined){
        const asset=project.assets.find(a=>a.id===assetId),crop=n?.kind==="figure"&&n.crop?.confirmed&&n.crop.assetSha256===asset?.sha256?n.crop:undefined;
        artwork.push({assetId,page:v.page,x:v.x,y:v.y,width:v.width,height:v.height,crop});
      }
    }
    const finalPdf=await placePdfArtwork(output.pdf,pdfAssets,artwork);check();
    const placementPages=visiblePages.map(pg=>{
      const reserved=pg.placed.filter(b=>b.kind==='front'||b.kind==='reservation'&&b.nodeId!=='skip');
      const start=Math.max(top,...reserved.filter(b=>b.nodeId!=='copyright-reserve').map(b=>b.y+b.height));
      const end=Math.min(bottom,...reserved.filter(b=>b.nodeId==='copyright-reserve').map(b=>b.y));
      const bounds={x:left,y:start,width:fullWidth,height:Math.max(0,end-start)};
      const columns=[frame(pg.number,0),frame(pg.number,1)].map(f=>({...f,y:Math.max(f.y,start),height:Math.max(0,Math.min(f.y+f.height,end)-Math.max(f.y,start))})) as [Region,Region];
      return {page:pg.number,bounds,columns,obstacles:pg.placed.filter(b=>(b.kind==='figure'||b.kind==='table')&&b.locked).map(b=>({nodeId:b.nodeId,x:b.x,y:b.y,width:b.width,height:b.height}))};
    });
    return {pdf:finalPdf,boxes,pageCount,placementPages,issues,coverage,adjustments,elapsedMs:performance.now()-start,fingerprint:await digestBytes(jsonBytes(projectInput)),source,...(captureEditable?{editableSource:{version:2,regions:visiblePages.flatMap(pg=>regions(pg,true).map(r=>({...r,page:pg.number}))),text:visiblePages.flatMap(pg=>pg.placed.filter(b=>!!b.editableText).map(b=>({boxId:b.id,page:b.page,slice:b.editableText!}))),geometry:metadata.filter(v=>["editable-table","editable-image","editable-heading","editable-note"].includes(v.kind??"")).map(v=>({kind:v.kind!,nodeId:v.nodeId!,fragment:v.fragment??0,page:v.page!,x:v.x!,y:v.y!,width:v.width!,height:v.height!})),project,resolved,referenceRuns,headers:runningHeaders,typography:Object.fromEntries(typography.values),tables:boxes.filter(b=>b.kind==="table").map(b=>{const table=project.document.blocks.find(n=>n.id===b.nodeId);return table?.kind==="table"?{nodeId:table.id,page:b.page,fragment:b.fragment??0,columns:tableColumns(table,b.width),padding:tablePadding(table,b.width,p.table.paddingMm*MM)}:null;}).filter((t):t is NonNullable<typeof t>=>!!t)}}:{})};
  }
}
