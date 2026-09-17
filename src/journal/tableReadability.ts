import {inlineText,visibleInlines,type Inline,type JournalProject,type JournalIssue} from './types';
import {probabilityList,tableNoteGroups} from './tableNotes';

/** Only explicit numeric cells: do not infer units, precision or statistical roles. */
export function statisticalUnits(content:Inline[]):{start:number;end:number}[]|undefined{
  if(content.some(r=>r.break||r.assetId))return;
  const text=inlineText(content),number='[+−-]?(?:\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE][+−-]?\\d+)?%?';
  const pattern=new RegExp(`(?:\\(\\s*${number}\\s*\\)|${number})[*†‡]*`,'gy');
  const units:{start:number;end:number}[]=[];let at=0;
  while(at<text.length){
    const prior=at;
    while(/\s/.test(text[at]??'')&&at<text.length)at++;
    if(at===text.length)break;
    if(units.length&&at===prior&&text[at]!=='(')return;
    pattern.lastIndex=at;const m=pattern.exec(text);if(!m)return;
    units.push({start:at,end:at+m[0].length});at+=m[0].length;
  }
  return units.length?units:undefined;
}

/** Review findings only: never repair alpha levels or renumber source markers. */
export function auditTableReadability(project:JournalProject):JournalIssue[]{
  const issues:JournalIssue[]=[],documentLevels=new Map<string,{value:string;nodeId:string}[]>();
  const add=(nodeId:string,code:string,message:string):void=>{issues.push({id:nodeId+':'+code,code,nodeId,severity:'warning',message});};
  for(const table of project.document.blocks){
    if(table.kind!=='table')continue;
    const notes=tableNoteGroups(table.caption?.notes??[],project),definitions=new Map<string,Set<string>>();
    for(const group of notes){
      const text=inlineText(group.paragraph.content);
      const list=group.kind==='probability'?probabilityList(text):undefined;
      if((group.kind==='probability'&&!list)||(group.kind==='general'&&/[*†‡+]\s*p\s*[<=>≤≥]/i.test(text)))add(table.id,'table-note-qualified','유의확률 주석에 조건·설명 문장이 섞여 있습니다. 원문을 유지했으므로 유형 구분과 단측·양측 조건을 확인하세요.');
      for(const m of list??[]){
        const value=m[3]+' '+Number(m[4]),values=definitions.get(m[1])??new Set<string>();values.add(value);definitions.set(m[1],values);
        const used=documentLevels.get(m[1])??[];used.push({value,nodeId:table.id});documentLevels.set(m[1],used);
      }
    }
    const used=new Set<string>();
    for(const row of table.rows)for(const cell of row.cells)for(const p of cell.blocks){
      const runs=visibleInlines(p.content,project.changes);
      if(statisticalUnits(runs))for(const m of inlineText(runs).matchAll(/[*†‡]+/g))used.add(m[0]);
    }
    const missing=[...used].filter(marker=>!definitions.has(marker));
    if(missing.length)add(table.id,'table-note-marker-missing',`숫자 셀의 ${missing.join(', ')} 기호에 대응하는 명확한 유의확률 주석을 찾지 못했습니다. 원문 주석을 확인하세요.`);
    if([...definitions.values()].some(v=>v.size>1))add(table.id,'table-note-marker-conflict','같은 표 안에서 같은 기호에 서로 다른 유의수준이 정의되어 있습니다. 자동 변경 없이 확인이 필요합니다.');
  }
  for(const [marker,entries]of documentLevels)if(new Set(entries.map(e=>e.value)).size>1)for(const nodeId of new Set(entries.map(e=>e.nodeId)))add(nodeId,'table-note-cross-table-'+marker,`표 사이에서 ${marker}의 유의수준 또는 비교 연산자가 다릅니다. 의도한 차이인지 확인하세요.`);
  return issues;
}
