import {inlineText,visibleInlines,type Inline,type JournalProject,type TableCell,type TableNode} from './types';
import {tableGrid,tableHeaderCount} from './tableGeometry';

export interface DecimalCell {cell:TableCell;column:number;split:number;runs:Inline[]}
export interface DecimalAlignment {left:number;right:number}
const alignments=new WeakMap<TableNode,Map<number,DecimalAlignment>>();
export const decimalAlignment=(table:TableNode,column:number):DecimalAlignment|undefined=>alignments.get(table)?.get(column);
export const setDecimalAlignments=(table:TableNode,values:Map<number,DecimalAlignment>):void=>{alignments.set(table,values);};
/** Only unambiguous numerical cells. Never change a value, sign, significance
 * marker, precision or an author's grouped/merged header to make it align. */
export function decimalCells(table:TableNode,project:JournalProject):DecimalCell[]{
  const header=tableHeaderCount(table.rows),columns=new Map<number,{valid:DecimalCell[];nonempty:number}>();
  for(const {cell,column,rowIndex}of tableGrid(table.rows)){
    if(rowIndex<header||column===0||cell.colspan!==1)continue;
    const runs=cell.blocks.length===1?visibleInlines(cell.blocks[0].content,project.changes):[],text=inlineText(runs);
    const group=columns.get(column)??{valid:[],nonempty:0};columns.set(column,group);
    if(!text.trim())continue;group.nonempty++;
    if(runs.some(r=>r.assetId||r.break)||!/^\s*[-+−]?(?:\d[\d,]*(?:\.\d*)?|\.\d+)(?:\s*\([-+−]?(?:\d+(?:\.\d*)?|\.\d+)\))?[%*†‡]*\s*$/.test(text))continue;
    const value=/^\s*[-+−]?[\d,]*/.exec(text)![0];
    group.valid.push({cell,column,split:value.length,runs});
  }
  return [...columns.values()].flatMap(g=>g.valid.length>=2&&g.valid.length===g.nonempty?g.valid:[]);
}
