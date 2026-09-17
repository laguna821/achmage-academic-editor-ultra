import {tableNoteGroups,tableNoteStyle} from './tableNotes';
import {inlineText,type JournalProject,type Paragraph} from './types';
import {paragraphContent,literal,pt} from './typst';
import {journalSpacing} from './master';

/** The measured fragment includes the entire note area, including group leading. */
export function tableNotesContent(notes:Paragraph[],nodeId:string,width:number,project:JournalProject):string{
  const groups=tableNoteGroups(notes,project);if(!groups.length)return '';
  const {style,gapPt}=tableNoteStyle(project.preset);
  const noteProject={...project,preset:{...project.preset,textStyles:{...project.preset.textStyles,note:style}}};
  return `#v(${pt(journalSpacing(project.preset).noteGapPt)})`+groups.map((group,i)=>{
    const n=group.paragraph,content='#'+paragraphContent(n,noteProject);
    const sources='('+group.sources.map(s=>`(id:${literal(s.id)},start:${s.start},end:${s.end})`).join(',')+',)';
    return `${i?`#v(${pt(gapPt)})`:''}#block[#context { let pos=here().position(); metadata((kind:"table-note",id:${literal(nodeId+':note:'+group.kind)},nodeId:${literal(nodeId)},noteKind:${literal(group.kind)},noteSources:${sources},noteLeadingPt:${style.leadingPt},noteSizePt:${style.sizePt},noteGapPt:${i?gapPt:0},text:${literal(inlineText(n.content))},page:here().page(),x:pos.x/1pt,y:pos.y/1pt,width:${width},height:measure(block(width:${pt(width)})[${content}]).height/1pt)) }${content}]`;
  }).join('');
}
