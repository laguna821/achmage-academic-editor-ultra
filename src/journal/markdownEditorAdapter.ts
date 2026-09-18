import {Editor,type EditorPosition,type EditorSelectionOrCaret,type EditorRange,type EditorTransaction,type EditorCommandName} from 'obsidian';
import {EditorSelection} from '@codemirror/state';
import {EditorView,type Command} from '@codemirror/view';
import * as commands from '@codemirror/commands';

/** Public Obsidian editor API for user paste/drop integrations, scoped to this document. */
export class MarkdownEditorAdapter extends Editor {
  constructor(private view:EditorView,private history:{undo:()=>void;redo:()=>void}){super();}
  private dispatch(spec:Parameters<EditorView['dispatch']>[0]):void{if(!this.view.dom.isConnected)throw Error('The manuscript editor was closed. Paste into the open manuscript again.');this.view.dispatch(spec);}
  refresh():void{this.view.requestMeasure();}
  getValue():string{return this.view.state.doc.toString();}
  setValue(content:string):void{this.dispatch({changes:{from:0,to:this.view.state.doc.length,insert:content}});}
  getLine(line:number):string{return this.view.state.doc.line(Math.max(1,Math.min(line+1,this.lineCount()))).text;}
  lineCount():number{return this.view.state.doc.lines;}
  lastLine():number{return this.lineCount()-1;}
  getSelection():string{const s=this.view.state.selection.main;return this.view.state.doc.sliceString(s.from,s.to);}
  getRange(from:EditorPosition,to:EditorPosition):string{return this.view.state.doc.sliceString(this.posToOffset(from),this.posToOffset(to));}
  replaceSelection(replacement:string):void{this.dispatch(this.view.state.replaceSelection(replacement));}
  replaceRange(replacement:string,from:EditorPosition,to=from):void{this.dispatch({changes:{from:this.posToOffset(from),to:this.posToOffset(to),insert:replacement}});}
  getCursor(side:'from'|'to'|'head'|'anchor'='head'):EditorPosition{return this.offsetToPos(this.view.state.selection.main[side]);}
  listSelections(){return this.view.state.selection.ranges.map(s=>({anchor:this.offsetToPos(s.anchor),head:this.offsetToPos(s.head)}));}
  setSelection(anchor:EditorPosition,head=anchor):void{this.setSelections([{anchor,head}]);}
  setSelections(ranges:EditorSelectionOrCaret[],main=0):void{this.dispatch({selection:EditorSelection.create(ranges.map(r=>EditorSelection.range(this.posToOffset(r.anchor),this.posToOffset(r.head??r.anchor))),main)});}
  focus():void{this.view.focus();}
  blur():void{this.view.contentDOM.blur();}
  hasFocus():boolean{return this.view.hasFocus;}
  getScrollInfo(){const e=this.view.scrollDOM;return {top:e.scrollTop,left:e.scrollLeft,width:e.scrollWidth,height:e.scrollHeight,clientWidth:e.clientWidth,clientHeight:e.clientHeight};}
  scrollTo(x?:number|null,y?:number|null):void{if(x!=null)this.view.scrollDOM.scrollLeft=x;if(y!=null)this.view.scrollDOM.scrollTop=y;}
  scrollIntoView(range:EditorRange,center=false):void{this.dispatch({effects:EditorView.scrollIntoView(this.posToOffset(range.from),{y:center?'center':'nearest'})});}
  undo():void{this.history.undo();}
  redo():void{this.history.redo();}
  exec(command:EditorCommandName):void{
    const map:Partial<Record<EditorCommandName,Command>>={goUp:commands.cursorLineUp,goDown:commands.cursorLineDown,goLeft:commands.cursorCharLeft,goRight:commands.cursorCharRight,goStart:commands.cursorDocStart,goEnd:commands.cursorDocEnd,goWordLeft:commands.cursorGroupLeft,goWordRight:commands.cursorGroupRight,indentMore:commands.indentMore,indentLess:commands.indentLess,newlineAndIndent:commands.insertNewlineAndIndent,swapLineUp:commands.moveLineUp,swapLineDown:commands.moveLineDown,deleteLine:commands.deleteLine};
    map[command]?.(this.view);
  }
  transaction(tx:EditorTransaction):void{
    if(tx.replaceSelection!==undefined){this.replaceSelection(tx.replaceSelection);return;}
    const ranges=tx.selections??(tx.selection?[tx.selection]:undefined);
    this.dispatch({changes:tx.changes?.map(c=>({from:this.posToOffset(c.from),to:this.posToOffset(c.to??c.from),insert:c.text})),selection:ranges?EditorSelection.create(ranges.map(r=>EditorSelection.range(this.posToOffset(r.from),this.posToOffset(r.to??r.from)))):undefined});
  }
  wordAt(pos:EditorPosition):EditorRange|null{const r=this.view.state.wordAt(this.posToOffset(pos));return r?{from:this.offsetToPos(r.from),to:this.offsetToPos(r.to)}:null;}
  posToOffset(pos:EditorPosition):number{const l=this.view.state.doc.line(Math.max(1,Math.min(pos.line+1,this.lineCount())));return l.from+Math.max(0,Math.min(pos.ch,l.length));}
  offsetToPos(offset:number):EditorPosition{const n=Math.max(0,Math.min(offset,this.view.state.doc.length)),l=this.view.state.doc.lineAt(n);return {line:l.number-1,ch:n-l.from};}
}
