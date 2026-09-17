import {inlineText,visibleInlines,type CompositionAudit,type CoverageEntry,type JournalProject,type LayoutBox,type Paragraph} from './types';
import {tableHeaderCount} from './tableGeometry';

/** Check the expected document, not merely the subset that happened to be placed. */
export function auditComposition(project:JournalProject,boxes:LayoutBox[]):CompositionAudit{
  const entries:CoverageEntry[]=[];
  const stable=(node:{id:string;origin?:{sourceId:string;path:string;occurrence?:number}},suffix=''):string=>{
    const source=project.sources.find(s=>s.id===node.origin?.sourceId);
    return (source&&node.origin?source.sha256+':'+node.origin.path+(node.origin.occurrence===undefined?'':':occurrence:'+node.origin.occurrence):node.id)+suffix;
  };
  const add=(node:{id:string;origin?:{sourceId:string;path:string}},kind:string,expected:number,actual:number,found:LayoutBox[],reason?:string,status?:CoverageEntry['status'],suffix=''):void=>{
    entries.push({key:stable(node,suffix),nodeId:node.id,kind,expected,actual,pages:[...new Set(found.map(b=>b.page))],reason,status:status??(actual===expected?'rendered':'unresolved')});
  };
  const paragraphs=(p:Paragraph):void=>{
    const text=inlineText(visibleInlines(p.content,project.changes));
    if(!text.trim()&&!p.content.some(r=>r.assetId)){add(p,'paragraph',0,0,[],'빈 문단은 원본에 보존하고 출력 공간만 생략','excluded');return;}
    const ref=p.role==='reference'&&project.references.find(r=>r.confirmed&&(r.sourceParagraphIds?.includes(p.id)||r.raw.trim()===text.trim()));
    if(ref){const found=boxes.filter(b=>b.kind==='reference'&&b.nodeId===ref.id);add(p,'reference',1,found.length,found,'확정된 APA 참고문헌으로 변환',found.length===1?'transformed':'unresolved');return;}
    const found=boxes.filter(b=>b.nodeId===p.id&&b.kind===p.kind).sort((a,b)=>(a.fragment??0)-(b.fragment??0));
    const rendered=found.map(b=>b.text??'').join('');
    // Heading chains attached to a table/figure emit explicit source-text markers.
    const attached=boxes.filter(b=>b.kind==='source-text'&&b.nodeId===p.id);
    const ok=rendered===text||(p.kind==='heading'&&attached.length===1&&attached[0].text===text);
    add(p,p.kind,1,ok?1:0,found.length?found:attached,ok?undefined:'문단 전체 문자열 또는 부착 제목이 배치 결과와 일치하지 않습니다.');
  };
  const abs=boxes.filter(b=>b.kind==='abstract').sort((a,b)=>(a.fragment??0)-(b.fragment??0));
  const absText=project.document.abstract.map(p=>inlineText(visibleInlines(p.content,project.changes))).join('\n');
  if(absText)add({id:'abstract'},'abstract',1,abs.map(b=>b.text).join('')===absText?1:0,abs);
  for(const node of project.document.blocks){
    if(node.kind==='paragraph'||node.kind==='heading'){paragraphs(node);continue;}
    if(node.kind==='break'){add(node,'break',0,0,[],'명시적 단/페이지 나눔','excluded');continue;}
    if(node.kind==='anchor'){add(node,'placement-anchor',1,node.targetIds.length===1?1:0,[],'원문 삽입 표시를 높이 없는 배치 지점으로 변환',node.targetIds.length===1?'transformed':'unresolved');continue;}
    if(node.kind==='unsupported'){add(node,'unsupported',1,0,[],node.description,'unresolved');continue;}
    const found=boxes.filter(b=>b.nodeId===node.id&&b.kind===node.kind);
    if(node.kind==='figure'&&!node.assetId&&!node.chart){add(node,'missing-figure',1,0,found,'원본 그림 미연결 — 검토용 자리표시자는 복원 성공이 아닙니다.','unresolved');continue;}
    add(node,node.kind,1,found.length?1:0,found,found.length?undefined:'원고 개체가 출력에 배치되지 않았습니다.');
    if(node.kind==='figure'&&found.length>1)add(node,'figure-duplicate',1,found.length,found,undefined,undefined,':duplicates');
    if(node.kind==='table'){
      const header=tableHeaderCount(node.rows);
      for(const [index,row]of node.rows.entries()){
        const fragments=found.filter(b=>b.rowIds?.includes(row.id));
        add(node,'table-row',index<header?found.length:1,fragments.length,fragments,index<header?'반복 머리행':undefined,undefined,':row:'+index);
      }
      for(const [ri,row]of node.rows.entries())for(const [ci,cell]of row.cells.entries()){
        const actual=boxes.filter(b=>b.kind==='cell'&&b.id===cell.id),expected=ri<header?found.length:1;
        add(node,'table-cell',expected,actual.length,actual,ri<header?'반복 머리행 셀':undefined,undefined,`:cell:${ri}:${ci}`);
      }
      for(const note of node.caption?.notes??[]){
        const text=inlineText(visibleInlines(note.content,project.changes));
        const groups=boxes.filter(b=>b.nodeId===node.id&&b.kind==='table-note');
        const spans=groups.flatMap(b=>b.noteSources??[]).filter(s=>s.id===note.id).sort((a,b)=>a.start-b.start);
        const ok=!!spans.length&&spans[0].start===0&&spans.at(-1)!.end===text.length&&spans.every((s,i)=>!i||spans[i-1].end===s.start);
        add(note,'table-note',1,ok?1:0,groups,ok?'유형별 주석으로 변환; 원본 범위 보존':undefined,ok?'transformed':'unresolved');
      }
    }
    if((node.kind==='table'||node.kind==='figure')&&node.caption){const captions=boxes.filter(b=>b.kind==='caption'&&b.nodeId===node.id);add(node,'caption',Math.max(1,found.length),captions.length,captions,undefined,undefined,':caption');}
  }
  for(const c of project.editorial?.changes??[])if(c.status==='applied'){
    const target=boxes.filter(b=>b.nodeId===c.targetId);
    for(const n of c.source)add(n,'cleanup:'+c.rule,0,0,target,c.reason,c.rule==='object-group-heading'?'excluded':'transformed',':cleanup:'+c.rule);
  }
  for(const ref of project.references.filter(r=>r.confirmed)){const found=boxes.filter(b=>b.kind==='reference'&&b.nodeId===ref.id);add(ref,'reference-record',1,found.length,found);}
  const issues=entries.filter(e=>e.status==='unresolved').map(e=>({id:'coverage:'+e.key,code:'composition-coverage',severity:'error' as const,nodeId:e.nodeId,message:`출력 대조 실패 (${e.kind}): ${e.reason??`예상 ${e.expected}, 실제 ${e.actual}`}`}));
  return {entries,complete:!issues.length,issues};
}
