import { inlineText, visibleInlines, type Inline, type JournalProject, type Paragraph, type TableNode, type TableRow } from "./types";
import { journalSpacing, journalStyles, styled } from "./master";
import { MM, literal, pt } from "./syntax";
import {tableGrid,fittedMinimums,tableHeaderCount,tablePadding} from "./tableGeometry";
import {statisticalUnits} from "./tableReadability";
import {NO_ADJUSTMENT,type TypeAdjustment} from './quality';
import {decimalAlignment,decimalCells} from './tableSemantics';
export { MM, literal, pt } from "./syntax";
export function textContent(content: Inline[], project: JournalProject,cellWidth?:number): string {
  let lastCitation = "";
  return visibleInlines(content, project.changes).map(run => {
    if (run.citationIds?.length && run.citationIds.every(id=>project.references.some(r=>r.id===id&&r.confirmed))) {
      const key=run.citationIds.join(","); if(lastCitation===key)return ""; lastCitation=key;
      return run.citationIds.map(id=>`#cite(label(${literal(id)}))`).join(" ");
    }
    lastCitation="";
    if (run.assetId) { const asset=project.assets.find(a=>a.id===run.assetId);return asset?`#image(${literal("/"+asset.path)}, height: 10pt)`:""; }
    if (run.break) return "#linebreak()";
    const args=[literal(run.text.replace(/\t/g,"    "))];
    if(run.bold)args.push('weight:"bold"');if(run.italic)args.push('style:"italic"');
    let out=`#text(${args.join(",")})`;
    // Scope the wrapping rule to ordinary runs, outside script content. A
    // contextual show rule inside super/sub applies the baseline twice.
    if(run.superscript)out=`#super[${out}]`;else if(run.subscript)out=`#sub[${out}]`;
    else if(cellWidth!==undefined)out=`#cell-text(${pt(Math.max(1,cellWidth-.5))})[${out}]`;
    if(run.href && /^(https?:|mailto:)/i.test(run.href))out=`#link(${literal(run.href)})[${out}]`;
    return out;
  }).join("");
}
export function preamble(project: JournalProject): string {
  const p=project.preset,s=journalStyles(p).body;
  return `#set document(title:${literal(project.document.title)},author:${literal(project.document.authors.map(a=>a.name).join(", "))},date:none)
#let journal-font(name) = (name,${(p.fallbackFonts??[]).map(literal).join(",")}${p.fallbackFonts?.length?",":""})
#set page(width:${p.page.widthMm}mm,height:${p.page.heightMm}mm,margin:(left:${p.page.marginLeftMm}mm,right:${p.page.marginRightMm}mm,top:${p.page.topMm}mm,bottom:${p.page.bottomMm}mm))
#set text(font:journal-font(${literal(s.font)}),size:${pt(s.sizePt)},fill:rgb(${literal(s.color)}),lang:${literal(p.body.language)},top-edge:0.8em,bottom-edge:-0.2em)
#set par(leading:${pt(Math.max(0,s.leadingPt-s.sizePt))},spacing:0pt,justify:${s.align==="justify"},linebreaks:"optimized")
#let mark(id, edge) = context metadata((id:id,edge:edge,page:here().page(),x:here().position().x/1pt,y:here().position().y/1pt))
#let wrap-cell-word(it, width) = context { if text.baseline != 0pt { it } else if measure(it).width > width { it.text.clusters().map(c => box(text(c))).join(sym.zws) } else { box(it) } }
#let cell-text(width, body) = { show regex("\\\\S+"): it => wrap-cell-word(it,width); body }
`;
}
export function paragraphPresentation(p:Paragraph,project:JournalProject,continued=false,adjustment:TypeAdjustment=NO_ADJUSTMENT){
  const styles=journalStyles(project.preset),isHead=p.kind==='heading';
  const s=isHead?styles[`heading${Math.min(5,Math.max(1,p.level??1))}` as 'heading1']:p.role==='reference'?styles.reference:p.role==='abstract'?styles.abstract:p.role==='note'?styles.note:styles.body;
  const cleaned=withoutSourceIndent(visibleInlines(p.content,project.changes));
  const runs=p.role==='note'&&/^Note\.(?:\s|$)/.test(inlineText(cleaned))?[...sliceInlines(cleaned,0,5).map(run=>({...run,italic:true})),...sliceInlines(cleaned,5,Infinity)]:cleaned;
  return {style:s,runs,leading:s.leadingPt+(isHead?0:adjustment.leadingPt),tracking:s.trackingEm+(isHead?0:adjustment.trackingEm),scaleX:isHead?1:adjustment.scaleX,
    firstIndent:!continued&&!isHead&&!p.list&&p.role!=='reference'&&p.role!=='quote'?s.indentMm:0,
    left:p.indentMm??(p.list?(p.list.level+1)*3:p.role==='quote'?4:0),hang:p.role==='reference'?project.preset.references.hangingMm:0,
    label:p.list&&!continued?p.list.label??(p.list.ordered?'1. ':'• '):''};
}
export function paragraphContent(p: Paragraph, project: JournalProject, continued=false,adjustment:TypeAdjustment=NO_ADJUSTMENT,width?:number): string {
  const presentation=paragraphPresentation(p,project,continued,adjustment),runs=presentation.runs;
  const isHead=p.kind==="heading",s=presentation.style;
  const size=s.sizePt,leading=s.leadingPt+adjustment.leadingPt,font=s.font;
  let text=textContent(runs,project);
  if(p.role==='code')return `[#set par(justify:false,first-line-indent:0pt);#block(inset:3pt,fill:rgb("#f3f3f3"))[#raw(${literal(inlineText(visibleInlines(p.content,project.changes)))},block:true)]]`;
  if(isHead)return styled(s,text);
  if(presentation.label)text=`#text(${literal(presentation.label)})`+text;
  const {firstIndent,left,hang}=presentation;
  const body=`[#set text(font:journal-font(${literal(font)}),size:${pt(size)},weight:${literal(s.bold?"bold":"regular")},style:${literal(s.italic?"italic":"normal")},fill:rgb(${literal(s.color)}),tracking:${s.trackingEm+adjustment.trackingEm}em)
#set par(leading:${pt(Math.max(0,leading-size))},spacing:0pt,justify:${s.align==="justify"},first-line-indent:(amount:${firstIndent}mm,all:true),hanging-indent:${hang}mm)
#pad(left:${left}mm)[#align(${s.align==="justify"?"left":s.align})[#par[${text}]]]]`;
  // Reflow at the inverse width before scaling; only the horizontal glyph
  // dimension changes. The resulting painted width still equals the frame.
  return adjustment.scaleX!==1&&width?`[#scale(x:${adjustment.scaleX*100}%,y:100%,reflow:true,origin:top+left)[#block(width:${pt(width/adjustment.scaleX)},${body})]]`:body;
}

/** Journal presets own first-line indents. Keep original runs in the project. */
export function withoutSourceIndent(content:Inline[]):Inline[]{
  let start=true;
  return content.flatMap(run=>{
    if(!start||run.break||run.assetId){start=false;return [run];}
    const value=run.text.replace(/^[ \t\u00a0\u200b\ufeff]+/,"");
    if(!value)return [];
    start=false;return [{...run,text:value}];
  });
}
export function captionContent(number: string, title: Inline[], label: string, project: JournalProject,nodeId?:string): string {
  const mark=nodeId?`#context {let pos=here().position();metadata((kind:"caption",id:${literal(nodeId+':caption')},nodeId:${literal(nodeId)},page:here().page(),x:pos.x/1pt,y:pos.y/1pt,width:0,height:0,text:${literal(label+' '+number+' '+inlineText(title))}))}`:'';
  return styled(journalStyles(project.preset).caption,`${mark}#strong(${literal(`${label} ${number}`)})#linebreak()#emph[${textContent(title,project)}]#v(${pt(journalSpacing(project.preset).captionGapPt)})`);
}
export function tableColumns(table: TableNode, width: number): number[] {
  const grid=tableGrid(table.rows),count=Math.max(table.columnWeights.length,...grid.map(p=>p.column+p.cell.colspan),1);
  // Content-derived widths are fixed once per table and reused by every fragment.
  const weights=Array.from({length:count},()=>3);
  for(const {cell,column}of grid){const text=cell.blocks.map(b=>inlineText(b.content)).join(" ");if(cell.colspan===1)weights[column]=Math.max(weights[column]??3,Math.min(35,Math.sqrt(text.length+1)*1.8));}
  const mins=fittedMinimums(table,width),minimum=mins.reduce((a,b)=>a+b,0),total=weights.reduce((a,b)=>a+b,0);
  return weights.map((w,i)=>minimum<=width?(mins[i]??0)+(width-minimum)*w/total:width*(mins[i]??0)/minimum);
}
export function tableContent(table: TableNode, rows: TableRow[], width: number, project: JournalProject,captureFragment?:number): string {
  const p=project.preset,s=journalStyles(p).table,cols=tableColumns(table,width),headerCount=tableHeaderCount(rows),padding=tablePadding(table,width,p.table.paddingMm*MM);
  const decimal=new Map(decimalCells(table,project).map(d=>[d.cell.id,d]));
  const occupied=new Map<number,number>();
  const cells=rows.flatMap((row,ri)=>{let col=0;return row.cells.map(cell=>{
    while((occupied.get(col)??0)>ri)col++;
    const cellColumn=col,innerWidth=Math.max(1,cols.slice(col,col+cell.colspan).reduce((a,b)=>a+b,0)-2*padding);
    for(let i=col;i<col+cell.colspan;i++)occupied.set(i,ri+cell.rowspan);
    col+=cell.colspan;
    const text=cell.blocks.map(b=>tableInlineContent(withoutSourceIndent(b.content),project,innerWidth)).join("#parbreak()");
    const d=decimal.get(cell.id),alignment=decimalAlignment(table,cellColumn);
    const aligned=d&&alignment&&alignment.left+alignment.right<=innerWidth-.1?`#align(center)[#grid(columns:(${pt(alignment.left)},${pt(alignment.right)}),gutter:0pt,align:(right,left),[${textContent(sliceInlines(d.runs,0,d.split),project)}],[${textContent(sliceInlines(d.runs,d.split,Infinity),project)}])]`:text;
    const body=tableCellWrap(aligned,innerWidth);
    const atoms=cell.blocks.flatMap(b=>{const runs=visibleInlines(b.content,project.changes);return (statisticalUnits(runs)??[]).map(u=>`box[${textContent(sliceInlines(runs,u.start,u.end),project)}]`);});
    const requiredWidth=atoms.length?`measure(stack(dir:ttb,spacing:0pt,${atoms.join(',')})).width/1pt`:'0';
    const marker=`#context { let pos = here().position(); metadata((kind:"cell",id:${literal(cell.id)},nodeId:${literal(table.id)},page:here().page(),x:pos.x/1pt,y:pos.y/1pt,width:${innerWidth},requiredWidth:${requiredWidth},height:measure(block(width:${pt(innerWidth)})[${body}]).height/1pt)) }`;
    const numeric=cell.blocks.every(b=>/^[\s\d.+−\-*/()=<>≤≥%,;:†‡]+$/.test(inlineText(b.content)));
    const align=ri<headerCount||(cellColumn>0&&numeric)?"center":"left";
    return `table.cell(x:${cellColumn},y:${ri},colspan:${cell.colspan},rowspan:${Math.min(cell.rowspan,rows.length-ri)},align:left)[${marker}#block(width:${pt(innerWidth)})[#align(${align})[${body}]]]`;
  });});
  const outer=`${p.table.outerRulePt}pt+rgb(${literal(p.table.ruleColor??"#000000")})`,inner=`${p.table.innerRulePt}pt+rgb(${literal(p.table.ruleColor??"#000000")})`;
  const lines=[`table.hline(y:0,stroke:${outer})`,...(headerCount<rows.length?[`table.hline(y:${headerCount},stroke:${inner})`]:[]),`table.hline(y:${rows.length},stroke:${outer})`];
  const result=`[#set text(font:journal-font(${literal(s.font)}),size:${pt(s.sizePt)},fill:rgb(${literal(s.color)}),tracking:${s.trackingEm}em,hyphenate:true);#set par(justify:false,leading:${pt(s.leadingPt-s.sizePt)},spacing:0pt)
#table(columns:(${cols.map(pt).join(",")},),inset:(x:${pt(padding)},y:${p.table.paddingMm}mm),stroke:${p.table.ruleMode==="rows"?`(x:none,y:${inner})`:"none"},${lines.join(",")},${cells.join(",")})]`;
  return captureFragment===undefined?result:`[#context {let pos=here().position();metadata((kind:"editable-table",nodeId:${literal(table.id)},fragment:${captureFragment},page:here().page(),x:pos.x/1pt,y:pos.y/1pt,width:${width},height:measure(block(width:${pt(width)},${result})).height/1pt))}#${result}]`;
}
export const tableCellWrap=(content:string,_width:number):string=>`#set text(overhang:false);#set par(linebreaks:"simple");${content}`;
export function tableInlineContent(content:Inline[],project:JournalProject,width:number):string{
  const runs=visibleInlines(content,project.changes),units=statisticalUnits(runs);
  if(!units)return textContent(runs,project,width);
  // Break a coefficient/(SE) pair only between complete values; never split a
  // decimal or detach its significance marker. Original whitespace is retained.
  let at=0;const parts=units.map((u,i)=>{const gap=textContent(sliceInlines(runs,at,u.start),project);at=u.end;return (i?'#text("\\u{200b}")':'')+gap+`#box[${textContent(sliceInlines(runs,u.start,u.end),project)}]`;});
  return parts.join('')+textContent(sliceInlines(runs,at,Infinity),project);
}
export function sliceInlines(content: Inline[], start: number, end: number): Inline[] {
  const result:Inline[]=[];let position=0;
  for(const run of content){const length=run.break?1:run.text.length;const a=Math.max(0,start-position),b=Math.min(length,end-position);if(b>a)result.push({...run,text:run.break?"\n":run.text.slice(a,b)});else if(run.assetId&&position>=start&&position<end)result.push({...run});position+=length;}
  return result;
}
