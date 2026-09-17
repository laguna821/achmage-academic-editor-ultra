import { inlineText,visibleInlines, type JournalProject, type TableNode } from "./types";
import { MM, pt, tableColumns, textContent,sliceInlines,tableCellWrap,withoutSourceIndent,tableInlineContent } from "./typst";
import {tableGrid,tableMinimums,setTableMinimums,tablePadding} from "./tableGeometry";
import { choosePdfTableWidth } from "../io/editorialPdfTablePolicy";
import { journalStyles } from "./master";
import { literal } from "./syntax";
import {decimalCells,setDecimalAlignments} from './tableSemantics';
interface Request {key:string;content:string;width:number;dimension?:"width"}
export async function measureTableMinimums(table:TableNode,project:JournalProject,measure:(requests:Request[])=>Promise<Map<string,number>>):Promise<void>{
  const s=journalStyles(project.preset).table,grid=tableGrid(table.rows),requests:Request[]=[];
  const decimals=decimalCells(table,project);
  for(const d of decimals)for(const side of ['left','right'] as const){const runs=sliceInlines(d.runs,side==='left'?0:d.split,side==='left'?d.split:Infinity);requests.push({key:d.cell.id+':decimal:'+side,width:0,dimension:'width',content:`[#set text(font:journal-font(${literal(s.font)}),size:${pt(s.sizePt)},tracking:${s.trackingEm}em);${textContent(runs,project)}]`});}
  for(const {cell}of grid){
    const words:string[]=[];
    for(const p of cell.blocks){const runs=visibleInlines(p.content,project.changes);for(const match of inlineText(runs).matchAll(/\S+/g))words.push(`box[${textContent(sliceInlines(runs,match.index,match.index+match[0].length),project)}]`);}
    if(!words.length)continue;
    requests.push({key:cell.id,width:0,dimension:"width",content:`[#set text(font:journal-font(${literal(s.font)}),size:${pt(s.sizePt)},weight:"regular",tracking:${s.trackingEm}em);#stack(dir:ttb,spacing:0pt,${words.join(",")})]`});
  }
  const widths=await measure(requests),count=Math.max(table.columnWeights.length,...grid.map(p=>p.column+p.cell.colspan),1),mins=Array.from({length:count},()=>2*project.preset.table.paddingMm*MM+1);
  for(const {cell,column}of grid.filter(p=>p.cell.colspan===1))mins[column]=Math.max(mins[column],(widths.get(cell.id)??0)+2*project.preset.table.paddingMm*MM+1);
  for(const {cell,column}of grid.filter(p=>p.cell.colspan>1)){
    const needed=(widths.get(cell.id)??0)+2*project.preset.table.paddingMm*MM+1,current=mins.slice(column,column+cell.colspan).reduce((a,b)=>a+b,0);
    if(needed>current)for(let c=column;c<column+cell.colspan;c++)mins[c]+=(needed-current)/cell.colspan;
  }
  setTableMinimums(table,mins,project.preset.table.paddingMm*MM);
  const decimalWidths=new Map<number,{left:number;right:number}>();
  for(const d of decimals){const current=decimalWidths.get(d.column)??{left:0,right:0};for(const side of ['left','right'] as const)current[side]=Math.max(current[side],widths.get(d.cell.id+':decimal:'+side)??0);decimalWidths.set(d.column,current);}
  setDecimalAlignments(table,decimalWidths);
}
export interface TableCellMeasure {id:string;header:boolean;columnLines:number;fullLines:number;columnHeight:number;fullHeight:number}
export async function preferFullTable(
  table:TableNode,project:JournalProject,columnWidth:number,fullWidth:number,
  columnHeight:number,fullHeight:number,pageHeight:number,
  measure:(requests:Request[])=>Promise<Map<string,number>>
):Promise<{full:boolean;cells:TableCellMeasure[]}>{
  const p=project.preset,s=journalStyles(p).table,requests:Request[]=[],cells:{id:string;header:boolean}[]=[];
  const widths={column:tableColumns(table,columnWidth),full:tableColumns(table,fullWidth)};
  const implicitHeader=table.rows.some(r=>r.header)?undefined:table.rows[0];
  for(const {cell,row,column:index}of tableGrid(table.rows)){
      if(inlineText(cell.blocks.flatMap(b=>b.content)).trim()){
        cells.push({id:cell.id,header:cell.header||row.header||row===implicitHeader});
        for(const mode of ["column","full"] as const){
          const width=widths[mode].slice(index,index+cell.colspan).reduce((sum,n)=>sum+n,0)-2*tablePadding(table,mode==="column"?columnWidth:fullWidth,p.table.paddingMm*MM);
          const body=tableCellWrap(cell.blocks.map(b=>tableInlineContent(withoutSourceIndent(b.content),project,Math.max(1,width))).join("#parbreak()"),Math.max(1,width));
          requests.push({key:cell.id+":"+mode,width:Math.max(1,width),content:`[#set text(font:journal-font(${literal(s.font)}),size:${pt(s.sizePt)},tracking:${s.trackingEm}em,hyphenate:true,weight:"regular");#set par(justify:false,leading:${pt(s.leadingPt-s.sizePt)},spacing:0pt);${body}]`});
        }
      }
  }
  const heights=await measure(requests);
  const values=cells.map(c=>{
    const columnHeight=heights.get(c.id+":column")!,fullHeight=heights.get(c.id+":full")!;
    const lines=(height:number):number=>Math.max(1,Math.round((height-s.sizePt)/s.leadingPt)+1);
    return {...c,columnHeight,fullHeight,columnLines:lines(columnHeight),fullLines:lines(fullHeight)};
  });
  const metrics=(mode:"column"|"full")=>({
    height:mode==="column"?columnHeight:fullHeight,overflow:tableMinimums(table).reduce((a,b)=>a+b,0)>(mode==="column"?columnWidth:fullWidth)+.1,
    maxRowHeight:Math.max(0,...values.map(c=>c[mode==="column"?"columnHeight":"fullHeight"]+2*p.table.paddingMm*MM)),
    headerLines:values.filter(c=>c.header).map(c=>c[mode==="column"?"columnLines":"fullLines"]),
    bodyLines:values.filter(c=>!c.header).map(c=>c[mode==="column"?"columnLines":"fullLines"])
  });
  // Same pure policy already exercised by the existing A/B PDF tests.
  const stillDenseAtFull=tableMinimums(table).reduce((a,b)=>a+b,0)>fullWidth&&fullHeight<=columnHeight*.75;
  return {full:stillDenseAtFull||choosePdfTableWidth(metrics("column"),metrics("full"),pageHeight)==="full",cells:values};
}
