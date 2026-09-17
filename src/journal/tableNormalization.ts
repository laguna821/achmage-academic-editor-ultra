import {cloneJournal,inlineText,type TableNode} from './types';
import {tableGrid} from './tableGeometry';

/** Reviewable structural repair; never infer or manufacture numerical values. */
export function normalizePackedTable(table:TableNode):boolean{
  if(table.normalization||table.rows.some(r=>r.cells.some(c=>c.rowspan!==1)))return false;
  const nonblank=(c:TableNode['rows'][number]['cells'][number])=>c.blocks.filter(p=>inlineText(p.content).trim()||p.content.some(r=>r.assetId));
  const packed=table.rows.filter(r=>r.cells.length>=3&&r.cells.every(c=>nonblank(c).length>=2));
  if(!packed.length)return false;
  const numeric=(text:string)=>/^[\s\d.+−\-*/()=<>≤≥%,;:†‡]+$/.test(text);
  if(packed.some(r=>new Set(r.cells.map(c=>nonblank(c).length)).size!==1||r.cells.slice(1).some(c=>nonblank(c).some(p=>!numeric(inlineText(p.content))))))return false;
  const first=table.rows.indexOf(packed[0]),count=packed[0].cells.length;
  const header=table.rows.slice(0,first).filter(r=>r.cells.length===count&&r.cells.every(c=>nonblank(c).length<=1)).at(-1);
  if(!header||packed.some(r=>r.cells.length!==count))return false;
  const boundaries=[0];for(const c of header.cells)boundaries.push(boundaries.at(-1)!+c.colspan);
  // Every other row must map exactly onto this complete header grid. The packed
  // row maps by its explicit cell order; this inference requires editor review.
  const replacements=new Map<string,{column:number;colspan:number}>();
  for(const row of table.rows.filter(r=>!packed.includes(r)))for(const p of tableGrid([row])){
    const a=boundaries.indexOf(p.column),b=boundaries.indexOf(p.column+p.cell.colspan);if(a<0||b<=a)return false;replacements.set(p.cell.id,{column:a,colspan:b-a});
  }
  table.normalization={rule:'parallel-numeric-paragraphs',confirmed:false,sourceRows:cloneJournal(table.rows),sourceColumnWeights:[...table.columnWeights]};
  table.rows=table.rows.flatMap(row=>{
    if(!packed.includes(row))return [{...row,header:table.rows.indexOf(row)<=table.rows.indexOf(header),cells:row.cells.map(c=>({...c,colspan:replacements.get(c.id)!.colspan,header:table.rows.indexOf(row)<=table.rows.indexOf(header)}))}];
    const columns=row.cells.map(nonblank);return columns[0].map((_,i)=>({id:`${row.id}:part:${i}`,header:false,cells:row.cells.map((c,j)=>({...c,id:`${c.id}:part:${i}`,sourceCellId:c.id,colspan:1,blocks:[columns[j][i]]}))}));
  });
  table.columnWeights=Array.from({length:count},()=>1);return true;
}
