import test from 'node:test';
import assert from 'node:assert/strict';
import {tableGrid,setTableMinimums} from '../src/journal/tableGeometry';
import {tableColumns} from '../src/journal/typst';
import type {TableCell,TableNode} from '../src/journal/types';
import {cloneJournal,inlineText} from '../src/journal/types';
import {normalizePackedTable} from '../src/journal/tableNormalization';
import {orderedTableNotes,tableNoteKind} from '../src/journal/tableNotes';
import {createJournalProject,JournalHistory} from '../src/journal/project';
const cell=(id:string,colspan=1,rowspan=1):TableCell=>({id,colspan,rowspan,header:false,blocks:[{id:id+'-p',kind:'paragraph',content:[{text:id}]}]});
test('rowspans reserve grid columns and fragments retain whole-table column proportions',()=>{
  const table:TableNode={id:'t',kind:'table',width:'auto',columnWeights:[1,1,1],rows:[{id:'r1',header:true,cells:[cell('A',1,2),cell('B',2)]},{id:'r2',header:false,cells:[cell('C'),cell('D')]}]};
  assert.deepEqual(tableGrid(table.rows).map(p=>[p.cell.id,p.rowIndex,p.column]),[['A',0,0],['B',0,1],['C',1,1],['D',1,2]]);
  setTableMinimums(table,[40,70,30]);let cols=tableColumns(table,180);assert.ok(cols.every((n,i)=>n>=[40,70,30][i]));assert.ok(Math.abs(cols.reduce((a,b)=>a+b,0)-180)<.001);
  cols=tableColumns(table,70);assert.deepEqual(cols,[20,35,15]);
});
test('parallel statistical cell paragraphs become reviewable rows with original IDs and values retained',()=>{
  const t:TableNode={id:'t',kind:'table',width:'auto',columnWeights:[1,1,1],rows:[{id:'h',header:true,cells:[cell('Label'),cell('Mean'),cell('Count')]},{id:'packed',header:false,cells:[cell('label'),cell('mean'),cell('count')]}]};
  for(const [i,c]of t.rows[1].cells.entries())c.blocks=[{id:c.id+'-1',kind:'paragraph',content:[{text:['Group A','1.20','5'][i]}]},{id:c.id+'-2',kind:'paragraph',content:[{text:['Group B','2.40','7'][i]}]}];
  const original=cloneJournal(t);assert.ok(normalizePackedTable(t));assert.equal(t.rows.length,3);assert.equal(t.normalization?.confirmed,false);assert.deepEqual(t.normalization?.sourceRows,original.rows);
  assert.deepEqual(t.rows.slice(1).map(r=>r.cells.map(c=>inlineText(c.blocks[0].content))),[['Group A','1.20','5'],['Group B','2.40','7']]);assert.equal(t.rows[1].cells[1].sourceCellId,'mean');assert.equal(normalizePackedTable(t),false);
  const ambiguous=cloneJournal(original);ambiguous.rows[1].cells[1].blocks.pop();const before=cloneJournal(ambiguous);assert.equal(normalizePackedTable(ambiguous),false);assert.deepEqual(ambiguous,before);
  t.normalization!.confirmed=true;const project=createJournalProject();project.document.blocks=[t];const history=new JournalHistory(project);
  history.change(p=>{const n=p.document.blocks[0] as TableNode;n.rows[1].cells[1].blocks[0].content[0].text='1.21';});assert.equal((history.current.document.blocks[0] as TableNode).normalization?.confirmed,false);history.undo();assert.equal((history.current.document.blocks[0] as TableNode).normalization?.confirmed,true);
});
test('APA notes sort general, specific, probability while ordinary bullets remain prose',()=>{
  const notes=[{id:'p',kind:'paragraph' as const,content:[{text:'* p < .05.'}]},{id:'g',kind:'paragraph' as const,content:[{text:'Note. Observed data.'}]},{id:'s',kind:'paragraph' as const,content:[{text:'a',superscript:true},{text:' Group.'}]}];
  assert.deepEqual(orderedTableNotes(notes).map(n=>n.id),['g','s','p']);assert.deepEqual(notes.map(n=>n.id),['p','g','s']);assert.equal(tableNoteKind({...notes[0],content:[{text:'* Participants were selected.'}]}),undefined);
});
