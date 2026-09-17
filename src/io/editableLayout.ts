/** Output-only, renderer-independent layout. Coordinates and sizes are points. */
export interface EditRect { x:number;y:number;width:number;height:number }
export interface EditStyle {
  font:string;size:number;leading:number;color:string;bold?:boolean;italic?:boolean;
  align?:"left"|"right"|"center"|"justify";indent?:number;leftIndent?:number;rightIndent?:number;
  before?:number;after?:number;tracking?:number;keepNext?:boolean;keepTogether?:boolean;background?:string;horizontalScale?:number;
  /** Points from content top to first baseline / last baseline to content bottom.
   * These describe measured block spacing, not native paragraph spacing. */
  blockTop?:number;blockBottom?:number;hyphenate?:boolean;language?:string;
  /** Multipliers of the font's normal word space, not character scaling. */
  wordSpacing?:{min:number;desired:number;max:number};
}
export interface EditRun {text:string;field?:"page-number";bold?:boolean;italic?:boolean;superscript?:boolean;subscript?:boolean;underline?:boolean;strike?:boolean;href?:string;color?:string;imageId?:string;imageWidth?:number;imageHeight?:number}
export interface EditParagraph {id:string;sourceId:string;style:string;runs:EditRun[];start?:number;end?:number;continued?:boolean;breakBefore?:"page"|"column"}
export interface EditStory {id:string;paragraphs:EditParagraph[]}
export interface EditMasterItem {id:string;name:string;item:string}
export interface EditFrame extends EditRect {master?:EditMasterItem;contentInsetTop?:number;id:string;page:number;storyId:string;order:number;group?:string;fill?:string;inset?:number;layer?:"body"|"furniture"|"artwork";paragraphIds?:string[];start?:number;end?:number;previousFrameId?:string;nextFrameId?:string}
export interface EditCell {id:string;row:number;column:number;rowspan:number;colspan:number;paragraphs:EditParagraph[];fill?:string}
export interface EditTable extends EditRect {id:string;sourceId:string;page:number;columns:number[];rows:{id:string;height:number;header:boolean}[];cells:EditCell[];padding:number;paddingY?:number;ruleColor:string;outerRule:number;innerRule:number;ruleMode:"apa"|"rows";group?:string;fragment:number}
export interface EditImage extends EditRect {id:string;sourceId:string;page:number;assetId:string;group?:string;crop?:EditRect;href?:string;fit?:"contain"}
export interface EditShape extends EditRect {master?:EditMasterItem;id:string;page:number;fill?:string;stroke?:string;strokeWidth?:number;group?:string;layer?:"body"|"furniture"|"artwork"}
export interface EditAsset {id:string;name:string;mime:string;bytes:Uint8Array;width?:number;height?:number}
export interface EditIssue {severity:"error"|"warning"|"info";code:string;message:string;sourceId?:string;sourceSeverity?:"error"|"warning"|"info"}
export interface EditableLayoutSnapshot {
  version:1|2;title:string;fingerprint:string;pageWidth:number;pageHeight:number;pageCount:number;firstPage:number;
  pageMargins?:{left:number;top:number;right:number;bottom:number};
  styles:Record<string,EditStyle>;stories:EditStory[];frames:EditFrame[];tables:EditTable[];images:EditImage[];shapes:EditShape[];assets:EditAsset[];issues:EditIssue[];
}
export interface IdmlExportResult {idml:Uint8Array;package:Uint8Array;issues:EditIssue[]}

/** Continuations are fragments of one paragraph, not new paragraph breaks.
 * All offsets in this output contract use JavaScript UTF-16 code units. Native
 * writers convert them to their own character indexing exactly once. */
export function editableStoryText(story:EditStory):string{
  return story.paragraphs.map((p,i)=>p.runs.map(r=>r.imageId?'\ufffc':r.text).join('')+(i+1<story.paragraphs.length&&!story.paragraphs[i+1].continued?'\n':'')).join('');
}

/** Link already placed frames; never enlarge, measure or repaginate them. */
export function finalizeEditableThreads(s:EditableLayoutSnapshot):void{
  for(const story of s.stories){
    const chain=s.frames.filter(f=>f.storyId===story.id).sort((a,b)=>a.order-b.order);
    const spans=new Map<string,{start:number;end:number}>();let offset=0;
    for(const [i,p]of story.paragraphs.entries()){
      const length=p.runs.reduce((n,r)=>n+(r.imageId?1:r.text.length),0)+(i+1<story.paragraphs.length&&!story.paragraphs[i+1].continued?1:0);
      spans.set(p.id,{start:offset,end:offset+length});offset+=length;
    }
    for(const [i,f]of chain.entries()){
      if(!f.paragraphIds&&chain.length===1)f.paragraphIds=story.paragraphs.map(p=>p.id);
      const first=spans.get(f.paragraphIds?.[0]??''),last=spans.get(f.paragraphIds?.at(-1)??'');
      if(first&&last){f.start=first.start;f.end=last.end;}
      else if(!story.paragraphs.length&&chain.length===1){f.start=0;f.end=0;}
      f.previousFrameId=chain[i-1]?.id;f.nextFrameId=chain[i+1]?.id;
    }
  }
}

export function validateEditableLayout(s:EditableLayoutSnapshot):EditIssue[]{
  const issues:EditIssue[]=[],ids=new Set<string>();
  const error=(code:string,message:string,sourceId?:string):void=>{issues.push({severity:"error",code,message,sourceId});};
  if(![1,2].includes(s.version)||!Number.isInteger(s.pageCount)||s.pageCount<1||![s.pageWidth,s.pageHeight].every(n=>Number.isFinite(n)&&n>0))error("document-geometry","문서 크기·쪽수 정보가 올바르지 않습니다.");
  const margins=s.pageMargins;
  if(margins&&(!Object.values(margins).every(n=>Number.isFinite(n)&&n>=0)||margins.left+margins.right>=s.pageWidth||margins.top+margins.bottom>=s.pageHeight))error('page-margins','페이지 작업 여백이 올바르지 않습니다.');
  for(const f of s.frames)if(f.contentInsetTop!==undefined&&(!Number.isFinite(f.contentInsetTop)||f.contentInsetTop<0||f.contentInsetTop>=f.height))error('frame-inset','텍스트 박스의 안쪽 여백이 올바르지 않습니다.',f.id);
  for(const item of [...s.stories,...s.frames,...s.tables,...s.images,...s.shapes,...s.assets]){if(ids.has(item.id))error("duplicate-id","중복된 출력 식별자: "+item.id,item.id);ids.add(item.id);}
  for(const item of [...s.frames,...s.tables,...s.images,...s.shapes])if(![item.x,item.y,item.width,item.height].every(Number.isFinite)||item.width<=0||item.height<0||!Number.isInteger(item.page)||item.page<1||item.page>s.pageCount)error("object-geometry","출력 객체의 위치가 올바르지 않습니다.",item.id);
  for(const story of s.stories){
    const frames=s.frames.filter(f=>f.storyId===story.id).sort((a,b)=>a.order-b.order);
    if(!frames.length)error("unplaced-story","본문이 들어갈 프레임이 없습니다.",story.id);
    if(new Set(frames.map(f=>f.order)).size!==frames.length)error("thread-order","프레임 연결 순서가 중복됩니다.",story.id);
    if(s.version===2){
      const expected=story.paragraphs.map(p=>p.id),actual=frames.flatMap(f=>f.paragraphIds??[]);
      if(new Set(expected).size!==expected.length)error('paragraph-id','본문 문단 식별자가 중복됩니다.',story.id);
      for(const [i,p]of story.paragraphs.entries())if(p.continued&&(i===0||story.paragraphs[i-1].sourceId!==p.sourceId))error('paragraph-continuation','이어지는 문단의 원문 식별자가 다릅니다.',p.id);
      if(JSON.stringify(expected)!==JSON.stringify(actual))error('frame-content-coverage','텍스트 프레임에 문단이 누락·중복되었거나 순서가 다릅니다.',story.id);
      let end=0;
      for(const [i,f]of frames.entries()){
        if(f.start!==end||f.end===undefined||!Number.isInteger(f.end)||f.end<end)error('frame-content-range','텍스트 프레임의 확정 내용 범위가 이어지지 않습니다.',f.id);
        if(f.previousFrameId!==frames[i-1]?.id||f.nextFrameId!==frames[i+1]?.id)error('frame-link','텍스트 프레임의 연결 정보가 일치하지 않습니다.',f.id);
        end=f.end??end;
      }
      if(end!==editableStoryText(story).length)error('story-content-range','전체 본문과 프레임의 내용 길이가 다릅니다.',story.id);
    }
  }
  for(const frame of s.frames)if(!s.stories.some(story=>story.id===frame.storyId))error("missing-story","프레임의 본문이 없습니다.",frame.id);
  const paragraphs=[...s.stories.flatMap(st=>st.paragraphs),...s.tables.flatMap(t=>t.cells.flatMap(c=>c.paragraphs))];
  for(const p of paragraphs){if(!s.styles[p.style])error("missing-style","문단의 서식이 없습니다.",p.id);for(const run of p.runs)if(run.imageId&&!s.assets.some(a=>a.id===run.imageId))error("missing-inline-image","본문 그림 파일이 없습니다.",p.id);}
  for(const image of s.images)if(!s.assets.some(a=>a.id===image.assetId))error("missing-image","그림 파일이 없습니다.",image.sourceId);
  for(const table of s.tables){
    const occupied=new Set<string>();
    if(!table.columns.length||table.columns.some(w=>!Number.isFinite(w)||w<=0)||Math.abs(table.columns.reduce((a,b)=>a+b,0)-table.width)>.5)error("table-width","표 열 너비가 표 전체 폭과 다릅니다.",table.sourceId);
    for(const c of table.cells){
      if(![c.row,c.column,c.rowspan,c.colspan].every(Number.isInteger)||c.row<0||c.column<0||c.rowspan<1||c.colspan<1||c.row+c.rowspan>table.rows.length||c.column+c.colspan>table.columns.length){error('table-grid','표의 병합 셀 범위가 올바르지 않습니다.',c.id);continue;}
      for(let r=c.row;r<c.row+c.rowspan;r++)for(let col=c.column;col<c.column+c.colspan;col++){
      const key=`${r}:${col}`;if(occupied.has(key)||r<0||col<0||r>=table.rows.length||col>=table.columns.length)error("table-grid","표의 병합 셀 위치가 겹치거나 범위를 넘습니다.",c.id);occupied.add(key);
      }
    }
    if(s.version===2){
      if(table.rows.some(r=>!Number.isFinite(r.height)||r.height<=0)||Math.abs(table.rows.reduce((n,r)=>n+r.height,0)-table.height)>.5)error('table-height','표의 확정 행 높이가 전체 높이와 다릅니다.',table.id);
      if(occupied.size!==table.rows.length*table.columns.length)error('table-grid-hole','표의 셀 영역에 빈틈이 있습니다.',table.id);
    }
  }
  return issues;
}
