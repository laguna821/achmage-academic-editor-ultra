import { Schema, type Node as PMNode, type Mark, type NodeSpec } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { baseKeymap, toggleMark, setBlockType } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { tableEditing, tableNodes, addRowAfter, addColumnAfter, deleteRow, deleteColumn, mergeCells, splitCell } from "prosemirror-tables";
import { cloneJournal, inlineText, newId, type Inline, type JournalNode, type JournalProject, type Paragraph, type TableNode } from "./types";

interface NodeAttributes {id:string;raw:JournalNode|null;level:number;colspan:number;rowspan:number}
const attrs=(n:PMNode):NodeAttributes=>n.attrs as NodeAttributes;
const linkHref=(m:Mark):string=>typeof m.attrs.href==="string"?m.attrs.href:"";
const blockAttrs={id:{default:""},raw:{default:null}};
const tables=tableNodes({tableGroup:"block",cellContent:"paragraph+",cellAttributes:{id:{default:""},raw:{default:null}}});
tables.table.attrs={...tables.table.attrs,...blockAttrs};
tables.table_row.attrs={...tables.table_row.attrs,...blockAttrs};
const paragraphSpec:NodeSpec={group:"block",content:"inline*",attrs:{...blockAttrs,level:{default:0}},parseDOM:[{tag:"p"},...[1,2,3,4,5].map(level=>({tag:"h"+level,attrs:{level}}))],toDOM:n=>[attrs(n).level?"h"+attrs(n).level:"p",{"data-node-id":attrs(n).id},0]};
export const journalSchema=new Schema({
  nodes:{doc:{content:"block+"},text:{group:"inline"},paragraph:paragraphSpec,hard_break:{inline:true,group:"inline",selectable:false,toDOM:()=>["br"],parseDOM:[{tag:"br"}]},inline_asset:{inline:true,group:"inline",atom:true,attrs:{raw:{}},toDOM:()=>["span",{class:"aaeu-journal-inline-asset"},"[삽입 그림]"]},
    figure:{group:"block",atom:true,attrs:blockAttrs,toDOM:n=>["div",{class:"aaeu-journal-object","data-node-id":attrs(n).id},(attrs(n).raw as JournalNode)?.kind==="figure"?"Figure · "+inlineText((attrs(n).raw as {caption?:{title:Inline[]}}).caption?.title??[]):"Figure"]},
    special:{group:"block",atom:true,attrs:blockAttrs,toDOM:n=>["div",{class:"aaeu-journal-object","data-node-id":attrs(n).id},(attrs(n).raw as {description?:string})?.description??"단/페이지 나누기"]},
    ...tables},
  marks:{bold:{toDOM:()=>["strong",0],parseDOM:[{tag:"strong"},{tag:"b"}]},italic:{toDOM:()=>["em",0],parseDOM:[{tag:"em"},{tag:"i"}]},superscript:{toDOM:()=>["sup",0],parseDOM:[{tag:"sup"}]},subscript:{toDOM:()=>["sub",0],parseDOM:[{tag:"sub"}]},
    link:{attrs:{href:{}},inclusive:false,toDOM:m=>["a",{href:/^(https?:|mailto:)/i.test(linkHref(m))?linkHref(m):"#",rel:"noopener"},0],parseDOM:[{tag:"a[href]",getAttrs:el=>({href:el.getAttribute("href")??""})}]},
    provenance:{attrs:{raw:{}},inclusive:false,toDOM:m=>["span",{class:(m.attrs.raw as Inline).changeIds?.length?"aaeu-journal-revision":(m.attrs.raw as Inline).citationIds?.length?"aaeu-journal-citation":""},0]}}
});
function inlineNodes(content:Inline[]):PMNode[]{
  return content.flatMap(run=>{
    const marks:Mark[]=[];
    for(const name of ["bold","italic","superscript","subscript"] as const)if(run[name])marks.push(journalSchema.marks[name].create());
    if(run.href)marks.push(journalSchema.marks.link.create({href:run.href}));
    if(run.changeIds?.length||run.citationIds?.length||run.objectReference)marks.push(journalSchema.marks.provenance.create({raw:run}));
    if(run.assetId)return [journalSchema.nodes.inline_asset.create({raw:run},undefined,marks)];
    if(run.break)return [journalSchema.nodes.hard_break.create(undefined,undefined,marks)];
    return run.text?[journalSchema.text(run.text,marks)]:[];
  });
}
function toParagraph(p:Paragraph):PMNode{return journalSchema.nodes.paragraph.create({id:p.id,raw:p,level:p.kind==="heading"?p.level??1:0},inlineNodes(p.content));}
function toNode(n:JournalNode):PMNode{
  if(n.kind==="paragraph"||n.kind==="heading")return toParagraph(n);
  if(n.kind==="table")return journalSchema.nodes.table.create({id:n.id,raw:n},n.rows.map(r=>journalSchema.nodes.table_row.create({id:r.id,raw:r},r.cells.map(c=>journalSchema.nodes[c.header?"table_header":"table_cell"].create({id:c.id,raw:c,colspan:c.colspan,rowspan:c.rowspan},c.blocks.length?c.blocks.map(toParagraph):[toParagraph({id:newId("p"),kind:"paragraph",content:[]})])))));
  return journalSchema.nodes[n.kind==="figure"?"figure":"special"].create({id:n.id,raw:n});
}
function fromInlines(node:PMNode):Inline[]{
  const runs:Inline[]=[];
  node.forEach(n=>{
    const raw=n.marks.find(m=>m.type.name==="provenance")?.attrs.raw as Inline|undefined;
    const r:Inline={...raw,text:n.text??"",bold:undefined,italic:undefined,superscript:undefined,subscript:undefined,href:undefined};
    if(r.objectReference&&r.text!==raw?.text)delete r.objectReference;
    for(const m of n.marks){if(["bold","italic","superscript","subscript"].includes(m.type.name))(r as unknown as Record<string,unknown>)[m.type.name]=true;if(m.type.name==="link")r.href=linkHref(m);}
    if(n.type.name==="hard_break"){r.text="\n";r.break=true;}
    if(n.type.name==="inline_asset")Object.assign(r,n.attrs.raw as Inline);
    runs.push(r);
  });return runs;
}
function fromParagraph(n:PMNode):Paragraph{return {...attrs(n).raw as Paragraph,id:attrs(n).id||newId("p"),kind:attrs(n).level?"heading":"paragraph",level:attrs(n).level||undefined,content:fromInlines(n)};}
export function editorDocument(project:JournalProject):PMNode{
  return journalSchema.nodes.doc.create(undefined,project.document.blocks.length?project.document.blocks.map(toNode):[toParagraph({id:newId("p"),kind:"paragraph",content:[]})]);
}
export function editorBlocks(doc:PMNode):JournalNode[]{
  const blocks:JournalNode[]=[],seen=new Set<string>();
  const unique=(id:string,prefix:string):string=>{const value=id&&!seen.has(id)?id:newId(prefix);seen.add(value);return value;};
  doc.forEach(n=>{
    if(n.type.name==="paragraph")blocks.push(fromParagraph(n));
    else if(n.type.name==="table"){
      const original=attrs(n).raw as TableNode|null;
      const table:TableNode={...original,id:attrs(n).id||newId("table"),kind:"table",width:original?.width??"auto",columnWeights:original?.columnWeights??[],rows:[]};
      n.forEach(r=>{const cells:TableNode["rows"][0]["cells"]=[];r.forEach(c=>{const ps:Paragraph[]=[];c.forEach(p=>ps.push(fromParagraph(p)));cells.push({...c.attrs.raw as import("./types").TableCell,id:unique(attrs(c).id,"cell"),blocks:ps,colspan:attrs(c).colspan,rowspan:attrs(c).rowspan,header:c.type.name==="table_header"});});table.rows.push({id:unique(attrs(r).id,"row"),header:cells.every(c=>c.header),cells});});blocks.push(table);
    }else blocks.push(cloneJournal(attrs(n).raw!));
  });
  for(const b of blocks)b.id=unique(b.id,b.kind);
  return blocks;
}
export class JournalTextEditor{
  readonly view:EditorView;
  constructor(host:HTMLElement,project:JournalProject,onChange:(nodes:JournalNode[])=>void,onSelect:(id:string)=>void,undo:()=>void,redo:()=>void){
    this.view=new EditorView(host,{state:EditorState.create({schema:journalSchema,doc:editorDocument(project),plugins:[keymap({"Mod-z":()=>{undo();return true;},"Mod-y":()=>{redo();return true;},"Mod-Shift-z":()=>{redo();return true;},"Mod-b":toggleMark(journalSchema.marks.bold),"Mod-i":toggleMark(journalSchema.marks.italic)}),keymap(baseKeymap),tableEditing()]}),
      dispatchTransaction:tr=>{this.view.updateState(this.view.state.apply(tr));if(tr.docChanged)onChange(editorBlocks(this.view.state.doc));let pos=this.view.state.selection.$from;for(let d=pos.depth;d>0;d--)if(attrs(pos.node(d)).id){onSelect(attrs(pos.node(d)).id);break;}},
      attributes:{class:"aaeu-journal-prose",role:"textbox","aria-label":"원고 편집","aria-multiline":"true"}});
  }
  replace(project:JournalProject):void{const tr=this.view.state.tr.replaceWith(0,this.view.state.doc.content.size,editorDocument(project).content);this.view.updateState(this.view.state.apply(tr));}
  format(name:"bold"|"italic"):void{toggleMark(journalSchema.marks[name])(this.view.state,this.view.dispatch);this.view.focus();}
  heading(level:number):void{setBlockType(journalSchema.nodes.paragraph,{level,id:newId("p")})(this.view.state,this.view.dispatch);this.view.focus();}
  table(action:"row"|"column"|"deleteRow"|"deleteColumn"|"merge"|"split"):void{({row:addRowAfter,column:addColumnAfter,deleteRow,deleteColumn,merge:mergeCells,split:splitCell})[action](this.view.state,this.view.dispatch);this.view.focus();}
  destroy():void{this.view.destroy();}
}
