import type {TableCell,TableNode,TableRow} from "./types";
const minimums=new WeakMap<TableNode,{widths:number[];padding:number}>();
export const setTableMinimums=(table:TableNode,widths:number[],padding=0):void=>{minimums.set(table,{widths,padding});};
export const tableMinimums=(table:TableNode):number[]=>minimums.get(table)?.widths??[];
/** Preserve type size; compact excessive cell padding before breaking values. */
export function tablePadding(table:TableNode,width:number,preferred:number):number{
  const data=minimums.get(table);if(!data?.widths.length||!data.padding)return preferred;
  const content=data.widths.reduce((a,b)=>a+b,0)-2*data.padding*data.widths.length;
  return Math.min(preferred,Math.max(Math.min(preferred,0.5*72/25.4),(width-content)/(2*data.widths.length)));
}
export function fittedMinimums(table:TableNode,width:number):number[]{
  const data=minimums.get(table);if(!data)return [];
  const padding=tablePadding(table,width,data.padding);return data.widths.map(n=>n-2*(data.padding-padding));
}
export function tableHeaderCount(rows:TableRow[]):number{
  let end=Math.max(1,rows.findLastIndex(r=>r.header)+1);
  // A merged group heading followed by short, non-numeric labels is a decked
  // head. Keep it intact and repeat every tier, not just the first row.
  if(end===1&&rows[0]?.cells.some(c=>c.colspan>1)&&rows[1]?.cells.every(c=>c.blocks.length<=1&&c.blocks.every(p=>p.content.map(r=>r.text).join('').length<40&&!/^\s*[-+−]?(?:\d|\.\d)/.test(p.content.map(r=>r.text).join('')))))end=2;
  for(let i=0;i<Math.min(end,rows.length);i++)for(const c of rows[i].cells)end=Math.max(end,i+c.rowspan);
  return Math.min(end,rows.length);
}
export function tableGrid(rows:TableRow[]):{cell:TableCell;row:TableRow;rowIndex:number;column:number}[]{
  const occupied=new Map<number,number>(),out:{cell:TableCell;row:TableRow;rowIndex:number;column:number}[]=[];
  for(const [ri,row]of rows.entries()){
    let column=0;
    for(const cell of row.cells){while((occupied.get(column)??0)>ri)column++;out.push({cell,row,rowIndex:ri,column});for(let i=column;i<column+cell.colspan;i++)occupied.set(i,ri+cell.rowspan);column+=cell.colspan;}
  }
  return out;
}
