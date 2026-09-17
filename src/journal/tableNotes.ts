import {inlineText,visibleInlines,type Paragraph,type Inline,type JournalProject,type JournalPreset} from './types';
import {journalStyles} from './master';
export type TableNoteKind='general'|'specific'|'probability';
const probabilityPattern=()=>/([*†‡+]+)\s*(p)\s*(<=|>=|[<=>≤≥])\s*(0?\.\d+|1(?:\.0+)?)(?=\s|[.;,)]|$)/gi;
export function tableNoteKind(p:Paragraph):'general'|'specific'|'probability'|undefined{
  const text=inlineText(p.content).replace(/^[\s\u200b\ufeff]+/,'');
  if(/^Notes?\s*[.:]\s*/i.test(text))return 'general';
  // Require both the significance marker and p-value relation, not arbitrary
  // prose or a bullet beginning with an asterisk.
  if(/^[*†‡+]+\s*p\s*(?:<=|>=|[<=>≤≥])\s*(?:0?\.\d+|1(?:\.0+)?)\b/i.test(text))return 'probability';
  const first=p.content.find(r=>r.text.trim());
  if(first?.superscript&&/^[a-z]$/.test(first.text.trim())&&text.length>2)return 'specific';
  return undefined;
}

/** Display-only formatting: source paragraphs, values and provenance stay intact. */
export interface TableNoteGroup {
  kind:TableNoteKind; paragraph:Paragraph;
  sources:{id:string;start:number;end:number}[];
}
function slice(content:Inline[],start:number,end:number):Inline[]{
  const out:Inline[]=[];let at=0;
  for(const r of content){const length=r.break?1:r.text.length,a=Math.max(0,start-at),b=Math.min(length,end-at);if(b>a)out.push({...r,text:r.break?'\n':r.text.slice(a,b)});else if(r.assetId&&at>=start&&at<end)out.push({...r});at+=length;}
  return out;
}
function trim(content:Inline[]):Inline[]{
  const text=inlineText(content),start=text.length-text.trimStart().length;
  return slice(content,start,text.trimEnd().length);
}
/** Accept only an explicit list of marker/p/relation/value expressions. */
export function probabilityList(text:string):RegExpMatchArray[]|undefined{
  const matches=[...text.matchAll(probabilityPattern())];if(!matches.length)return;
  let at=0;
  for(const m of matches){if(!/^[\s.;]*$/.test(text.slice(at,m.index)))return;at=m.index+m[0].length;}
  return /^[\s.;]*$/.test(text.slice(at))?matches:undefined;
}
function formatProbability(content:Inline[]):Inline[]{
  const text=inlineText(content),matches=probabilityList(text);
  if(!matches)return content; // Tail qualifiers or prose require review; never discard them.
  return matches.flatMap((m,i)=>[
    {text:i?' ':''},{text:m[1],superscript:true},
    {text:'p',italic:true},{text:'\u00a0'+m[3]+'\u00a0'+m[4].replace(/^0\./,'.')+'.'}
  ]).filter(r=>r.text);
}
export function tableNoteGroups(notes:Paragraph[],project:Pick<JournalProject,'changes'>):TableNoteGroup[]{
  const parts:{kind:TableNoteKind;content:Inline[];source:{id:string;start:number;end:number}}[]=[];
  for(const p of notes){
    const content=visibleInlines(p.content,project.changes),text=inlineText(content),kind=tableNoteKind({...p,content})??'general';
    const label=text.match(/^\s*Notes?\s*[.:]\s*/i);
    if(label&&probabilityList(text.slice(label[0].length))){parts.push({kind:'probability',content:slice(content,label[0].length,text.length),source:{id:p.id,start:0,end:text.length}});continue;}
    // An unambiguous probability-only tail may share the author's Note paragraph.
    // Keep offsets for both pieces so every source character remains accountable.
    const tail=kind==='general'?[...text.matchAll(probabilityPattern())].find(m=>m.index>0&&/[.;]\s*$/.test(text.slice(0,m.index))&&probabilityList(text.slice(m.index))):undefined;
    if(tail){parts.push({kind,content:slice(content,0,tail.index),source:{id:p.id,start:0,end:tail.index}},{kind:'probability',content:slice(content,tail.index,text.length),source:{id:p.id,start:tail.index,end:text.length}});}
    else parts.push({kind,content,source:{id:p.id,start:0,end:text.length}});
  }
  return (['general','specific','probability'] as const).flatMap(kind=>{
    const members=parts.filter(p=>p.kind===kind);if(!members.length)return [];
    const content:Inline[]=[];
    for(const [i,member]of members.entries()){
      let runs=trim(member.content);
      if(kind==='general'){
        const label=inlineText(runs).match(/^Notes?\s*[.:]\s*/i);
        if(label)runs=slice(runs,label[0].length,Infinity);
        if(!i)content.push({text:'Note.',italic:true},{text:' '});
      }
      if(i)content.push({text:' '});
      content.push(...(kind==='probability'?formatProbability(runs):runs));
    }
    return [{kind,paragraph:{id:members[0].source.id+':'+kind,kind:'paragraph',role:'note',content},sources:members.map(p=>p.source)}];
  });
}
export function tableNoteStyle(preset:JournalPreset):{style:ReturnType<typeof journalStyles>['note'];gapPt:number}{
  const styles=journalStyles(preset),double=preset.tableNotes?.spacing==='double';
  const s=double?{...styles.body,leadingPt:styles.body.sizePt*2}:styles.note;
  const style={...s,bold:false,italic:false,align:'left' as const,indentMm:0};
  return {style,gapPt:Math.max(0,style.leadingPt-style.sizePt)+(double?0:(preset.tableNotes?.groupGapPt??3))};
}
export function orderedTableNotes(notes:Paragraph[]):Paragraph[]{
  const rank={general:0,specific:1,probability:2};
  return [...notes].sort((a,b)=>(rank[tableNoteKind(a)??'general'])-(rank[tableNoteKind(b)??'general']));
}
