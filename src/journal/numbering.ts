import {sliceRuns} from './editorial';
import {inlineText,type Inline,type JournalIssue,type JournalProject,type LayoutBox,type NumberAssignment,type Paragraph} from './types';

export interface ObjectMention {nodeId:string;start:number;end:number;text:string;kind:'table'|'figure';numbers:string[];candidates:string[][]}
export function allParagraphs(p:JournalProject):Paragraph[]{
  return p.document.blocks.flatMap(n=>n.kind==='paragraph'||n.kind==='heading'?[n]:n.kind==='table'?[...n.rows.flatMap(r=>r.cells.flatMap(c=>c.blocks)),...n.caption?.notes??[]]:n.kind==='figure'?n.caption?.notes??[]:[]);
}
export function objectMentions(p:JournalProject):ObjectMention[]{
  const floats=p.document.blocks.filter(n=>n.kind==='table'||n.kind==='figure');
  const out:ObjectMention[]=[];
  for(const node of allParagraphs(p)){
    if(node.role==='reference'||node.role==='code')continue;
    const text=inlineText(node.content);
    const pattern=/\b(Tables?|Figures?|Figs?\.?)\s+([A-Z]?\d+[a-z]?)(?:\s*([-–]|and|&)\s*([A-Z]?\d+[a-z]?))?(?![\w])/gi;
    for(const m of text.matchAll(pattern)){
      const kind=/^table/i.test(m[1])?'table':'figure',numbers=[m[2]];
      if(m[4]){
        if((m[3]==='-'||m[3]==='–')&&/^\d+$/.test(m[2])&&/^\d+$/.test(m[4])&&Number(m[4])>Number(m[2])&&Number(m[4])-Number(m[2])<=100)for(let n=Number(m[2])+1;n<=Number(m[4]);n++)numbers.push(String(n));
        else numbers.push(m[4]);
      }
      out.push({nodeId:node.id,start:m.index,end:m.index+m[0].length,text:m[0],kind,numbers,candidates:numbers.map(number=>floats.filter(n=>n.kind===kind&&(n.caption?.sourceNumber??n.caption?.number)===number).map(n=>n.id))});
    }
  }
  return out;
}
export function bindMention(p:JournalProject,m:ObjectMention,ids:string[]):void{
  const node=allParagraphs(p).find(n=>n.id===m.nodeId);if(!node)return;
  const middle=sliceRuns(node.content,m.start,m.end),style=middle[0]??{text:m.text};
  node.content=[...sliceRuns(node.content,0,m.start),{...style,text:m.text,objectReference:{ids,label:m.kind==='table'?'Table':'Figure',sourceNumbers:m.numbers}},...sliceRuns(node.content,m.end)];
}
export function bindObjectReferences(p:JournalProject):JournalIssue[]{
  const issues:JournalIssue[]=[];
  const objects=new Map(p.document.blocks.filter(n=>n.kind==='table'||n.kind==='figure').map(n=>[n.id,n.kind]));
  for(const n of allParagraphs(p))for(const run of n.content)if(run.objectReference&&(!run.objectReference.ids.length||run.objectReference.ids.some(id=>!objects.has(id))))issues.push({id:n.id+':object-reference-stale',nodeId:n.id,code:'object-reference-unresolved',severity:'error',message:'본문 참조의 대상이 삭제되었거나 없습니다. 다시 연결하세요.'});
  for(const m of objectMentions(p).reverse()){
    const node=allParagraphs(p).find(n=>n.id===m.nodeId)!;
    if(sliceRuns(node.content,m.start,m.end).some(r=>r.objectReference))continue;
    if(m.candidates.every(ids=>ids.length===1))bindMention(p,m,m.candidates.map(ids=>ids[0]));
    else issues.push({id:`${m.nodeId}:object-reference:${m.start}`,nodeId:m.nodeId,code:'object-reference-unresolved',severity:'error',message:`“${m.text}”의 대상이 없거나 중복됩니다. 참조 대상을 연결하세요.`});
  }
  return issues;
}
function displayReference(run:Inline,numbers:Map<string,string>):string{
  const r=run.objectReference!;const values=r.ids.map(id=>numbers.get(id));
  if(values.some(v=>!v))return run.text;
  const list=values as string[];
  const consecutive=list.length>2&&list.every((v,i)=>/^\d+$/.test(v)&&(!i||Number(v)===Number(list[i-1])+1));
  return `${r.label}${list.length>1?'s':''} ${consecutive?`${list[0]}–${list.at(-1)}`:list.join(list.length===2?' and ':', ')}`;
}
export function applyNumberAssignments(p:JournalProject,assignments:NumberAssignment[]):void{
  const numbers=new Map(assignments.map(a=>[a.id,a.number]));
  for(const node of p.document.blocks)if((node.kind==='table'||node.kind==='figure')&&numbers.has(node.id)){
    node.caption??={number:'',title:[],notes:[]};node.caption.sourceNumber??=node.caption.number;node.caption.number=numbers.get(node.id)!;
  }
  for(const node of allParagraphs(p))for(const run of node.content)if(run.objectReference)run.text=displayReference(run,numbers);
}
/** Read each horizontal band left-column first; a full-width item separates bands. */
export function numberByPlacement(p:JournalProject,boxes:LayoutBox[]):NumberAssignment[]{
  const floats=p.document.blocks.filter(n=>n.kind==='table'||n.kind==='figure');
  const first= new Map<string,LayoutBox>();
  for(const b of boxes)if(['figure','table','figure-missing'].includes(b.kind)&&!first.has(b.nodeId))first.set(b.nodeId,b);
  const column=(p.preset.page.widthMm-p.preset.page.marginLeftMm-p.preset.page.marginRightMm-p.preset.page.gutterMm)/2*72/25.4;
  const left=p.preset.page.marginLeftMm*72/25.4;
  const key=(b:LayoutBox):number[]=>{
    const full=boxes.filter(a=>a.page===b.page&&['figure','table','figure-missing'].includes(a.kind)&&a.width>column+1);
    const band=full.filter(a=>a.y+a.height<=b.y+.1).length*2+(b.width>column+1?1:0);
    return [b.page,band,b.width>column+1?0:b.x>left+column/2?1:0,b.y,b.x];
  };
  const ordered=floats.filter(n=>first.has(n.id)).sort((a,b)=>{const x=key(first.get(a.id)!),y=key(first.get(b.id)!);for(let i=0;i<x.length;i++)if(Math.abs(x[i]-y[i])>.01)return x[i]-y[i];return floats.indexOf(a)-floats.indexOf(b);});
  const counts=new Map<string,number>();
  return ordered.map(n=>{
    const original=n.caption?.sourceNumber??n.caption?.number??'',prefix=original.match(/^[A-Z](?=\d)/)?.[0]??'',key=n.kind+prefix;
    const count=(counts.get(key)??0)+1;counts.set(key,count);
    return {id:n.id,kind:n.kind,original,number:prefix+count,page:first.get(n.id)!.page};
  });
}
