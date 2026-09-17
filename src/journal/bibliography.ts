import {type JournalProject,type ReferenceRecord} from './types';
import {journalStyles} from './master';
import {literal,pt} from './syntax';

/** Full citations use the same CSL processor and complete bibliography context.
 * Do not reconstruct these runs: that loses italics and disambiguation. */
export function referenceContent(ref:ReferenceRecord,project:JournalProject):string{
  const s=journalStyles(project.preset).reference;
  return `[#set text(font:journal-font(${literal(s.font)}),size:${pt(s.sizePt)},weight:${literal(s.bold?'bold':'regular')},style:${literal(s.italic?'italic':'normal')},fill:rgb(${literal(s.color)}),tracking:${s.trackingEm}em)
#set par(leading:${pt(Math.max(0,s.leadingPt-s.sizePt))},spacing:0pt,justify:${s.align==='justify'},hanging-indent:${project.preset.references.hangingMm}mm)
#cite(label(${literal(ref.id)}),form:"full",style:"apa")]`;
}

export interface ReferenceRun {kind?:string;key?:string;text?:string}
export function bibliographyOrder(references:ReferenceRecord[],runs:ReferenceRun[]):{references:ReferenceRecord[];texts:Map<string,string>;ambiguous:boolean}{
  const texts=new Map<string,string>();
  for(const run of runs)if(run.kind==='reference-run'&&run.key&&typeof run.text==='string')texts.set(run.key,(texts.get(run.key)??'')+run.text);
  const normalize=(text:string):string=>text.normalize('NFKC').replace(/\s+/g,' ').trim();
  const all=normalize(texts.get('__bibliography__')??'');
  const ranked=references.map((ref,index)=>({ref,index,at:all.indexOf(normalize(texts.get(ref.id)??'\uffff'))}));
  const ambiguous=ranked.some(r=>r.at<0)||new Set(ranked.map(r=>r.at)).size!==ranked.length;
  return {references:ambiguous?references:[...ranked].sort((a,b)=>a.at-b.at||a.index-b.index).map(r=>r.ref),texts,ambiguous};
}
