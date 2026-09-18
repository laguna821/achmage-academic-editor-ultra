import {localizedProperty} from './propertyLanguage';
import {MarkdownEditorAdapter} from './markdownEditorAdapter';
import {Notice,type Editor} from 'obsidian';
import {EditorState} from '@codemirror/state';
import {EditorView,keymap} from '@codemirror/view';
import {defaultKeymap,indentWithTab} from '@codemirror/commands';
import {markdown} from '@codemirror/lang-markdown';
import {MARKDOWN_PROPERTIES,indexed,type PropertyGroup,type PropertySpec} from './markdownProperties';
import {fieldRequirement,manuscriptProperties,manuscriptPropertySource} from './manuscriptFields';
import {sourceParts,replaceSourceBody,sourceProperties} from './sourceEditing';
import {action} from './forms';
import {uiLanguage} from './i18n';
import type {JournalProject,LayoutResult} from './types';

const tr=(ko:string,en:string)=>uiLanguage()==='ko'?ko:en;

const valueText=(value:unknown):string=>typeof value==='string'?value:typeof value==='number'||typeof value==='boolean'?String(value):'';
export interface ManuscriptEditorActions {properties:(changes:Record<string,unknown>)=>void;text:(text:string)=>void;undo:()=>void;redo:()=>void;templates:()=>void;editorEvent?:(kind:'editor-paste'|'editor-drop',event:ClipboardEvent|DragEvent,editor:Editor)=>void}
/** A common metadata surface with a source-preserving Markdown body editor. Word supplies its existing body view. */
export class ManuscriptEditor {
  readonly bodyHost:HTMLElement;
  private fields:HTMLElement;
  private code:EditorView|null=null;
  private source='';
  private raw=false;
  private applying=false;
  private signature='';
  private project:JournalProject;
  private toggle:HTMLButtonElement;
  constructor(private host:HTMLElement,project:JournalProject,private callbacks:ManuscriptEditorActions){
    this.project=project;
    host.createEl('h3',{text:tr('원고 편집','Manuscript editor')});
    const bar=host.createDiv({cls:'aaeu-manuscript-tools'});
    action(bar,tr('되돌리기','Undo'),callbacks.undo);action(bar,tr('다시 실행','Redo'),callbacks.redo);
    this.toggle=action(bar,tr('전체 YAML · 고급 보기','Full YAML · advanced'),()=>{if(this.raw&&!this.validGuidedSource())return;this.raw=!this.raw;this.fields.hidden=this.raw;this.toggle.setAttribute('aria-pressed',String(this.raw));this.setCode(true);});
    this.fields=host.createDiv({cls:'aaeu-manuscript-properties',attr:{tabindex:'-1'}});
    this.bodyHost=host.createDiv({cls:'aaeu-manuscript-body'});
    this.update(project);
  }
  update(project:JournalProject,result?:LayoutResult):void{
    this.project=project;this.toggle.hidden=!project.markdown;
    let values=manuscriptProperties(project);
    if(project.markdown&&this.source)try{values=sourceProperties(this.source);}catch{/* Show the last parsed values while YAML is incomplete. */}
    const signature=JSON.stringify(values)+String(result?.pageCount??0);
    if(signature===this.signature||this.fields.contains(this.host.ownerDocument.activeElement)&&!!this.host.ownerDocument.activeElement?.matches('input,textarea,select'))return;
    this.signature=signature;
    const expanded=new Set(Array.from(this.fields.querySelectorAll('details[open]')).map(e=>(e as HTMLElement).dataset.group));
    this.fields.empty();
    const groups:[PropertyGroup,string,string][]=[['basic','기본 정보','Basic information'],['authors','저자·소속','Authors and affiliations'],['abstract','초록·키워드','Abstract and keywords'],['publication','발행정보·교신저자','Publication and correspondence'],['statements','말미 선언문','Closing statements'],['furniture','머리말·판권','Headers and copyright']];
    const isNew=!expanded.size&&!this.fields.dataset.initialized;this.fields.dataset.initialized='true';
    for(const [group,ko,en]of groups){
      const section=this.fields.createEl('details',{cls:'aaeu-property-group'});section.dataset.group=group;section.open=expanded.has(group)||isNew&&group==='basic';section.createEl('summary',{text:tr(ko,en)});
      for(const rawSpec of MARKDOWN_PROPERTIES.filter(s=>s.group===group&&!['aaeu-schema','aaeu-template'].includes(s.key))){
        const spec=localizedProperty(rawSpec,uiLanguage());
        if(spec.key.includes('{n}')){
          const name=spec.key.split('-')[1],numbers=indexed(values,name);if(!numbers.length)numbers.push(1);
          for(const n of numbers)this.property(section,{...spec,key:spec.key.replace('{n}',String(n)),label:spec.label.replace('{n}',String(n))},values,result);
        }else this.property(section,spec,values,result);
      }
      const repeated=group==='authors'?['author','affiliation']:group==='publication'?['sidebar']:group==='statements'?['statement']:[];
      for(const name of repeated){
        const label=({author:tr('저자','Author'),affiliation:tr('소속','Affiliation'),sidebar:tr('사용자 정보','Custom information'),statement:tr('추가 선언문','Additional statement')})[name]!;
        action(section,label+tr(' 추가',': add'),()=>{const n=Math.max(0,...indexed(values,name))+1,key=`aaeu-${name}-${n}-${name==='author'?'name':name==='sidebar'?'label':name==='statement'?'title':'text'}`;this.callbacks.properties({[key]:''});this.signature='';this.fields.focus();this.update(this.project,result);});
        for(const n of indexed(values,name))action(section,`${label} ${n} `+tr('삭제','remove'),()=>{const prefix=`aaeu-${name}-${n}-`,changes=Object.fromEntries(Object.keys(values).filter(k=>k.startsWith(prefix)).map(k=>[k,undefined]));this.callbacks.properties(changes);this.signature='';this.fields.focus();this.update(this.project,result);});
      }
    }
  }
  private property(host:HTMLElement,s:PropertySpec,values:Record<string,unknown>,result?:LayoutResult):void{
    // Hide low-level override switches behind a single explicit three-state control.
    if(/^aaeu-(publication|copyright|header-even|header-odd|folio)-hide$/.test(s.key))return;
    const row=host.createDiv({cls:'aaeu-guided-field'});row.dataset.property=s.key;
    const label=row.createEl('label'),name=label.createSpan({text:s.label});
    const required=fieldRequirement(this.project,s);name.createSpan({cls:'aaeu-field-requirement is-'+required,text:' · '+({required:tr('저널 필수','Journal required'),recommended:tr('권장','Recommended'),optional:tr('선택','Optional')})[required]});
    const help=row.createEl('details',{cls:'aaeu-field-help'});help.createEl('summary',{text:tr('도움말','Help')});
    let location=s.location;
    if(s.group==='statements'&&result){const kind=s.key.replace(/^aaeu-/,'').replace(/-(?:text|hide|omission-reason)$/,''),item=this.project.document.endMatter?.find(e=>e.kind===kind),box=result.boxes.find(b=>b.nodeId===item?.id||item?.content.some(p=>p.id===b.nodeId));if(box)location+=` · ${box.page}`+tr('쪽',' pages');}
    const description=location+' · '+s.description+(s.example?' '+tr('예: ','Example: ')+s.example:'');label.title=description;help.createEl('p',{text:description});
    const source=this.project.markdown?manuscriptPropertySource(this.project,s.key,values):undefined;
    let value=source?.value??values[s.key]??s.default;
    const override=/^aaeu-(publication|copyright|header-even|header-odd|folio)-text$/.test(s.key);
    if(override){
      const hide=s.key.replace(/-text$/,'-hide'),select=row.createEl('select',{attr:{'aria-label':s.label+tr(' 사용 방식',' mode')}});
      for(const [v,l]of [['inherit',tr('템플릿 기본값','Template default')],['custom',tr('직접 입력','Custom text')],['hide',tr('숨김','Hidden')]])select.createEl('option',{value:v,text:l});
      select.value=values[hide]===true?'hide':valueText(value).trim()?'custom':'inherit';
      select.onchange=()=>{const mode=select.value;this.callbacks.properties(mode==='hide'?{[hide]:true}:mode==='inherit'?{[hide]:false,[s.key]:''}:{[hide]:false});input.disabled=mode!=='custom';};
    }
    const input=s.kind==='long'?label.createEl('textarea'):s.kind==='mode'?label.createEl('select'):label.createEl('input');
    input.setAttribute('aria-label',s.label);input.dataset.propertyInput=s.key;input.title=description;
    if(input instanceof HTMLSelectElement){for(const [v,l]of [['aop','AOP'],['issue',tr('권호 확정본','Issue edition')]])input.createEl('option',{value:v,text:l});input.value=valueText(value);}
    else if(input instanceof HTMLInputElement&&s.kind==='boolean'){input.type='checkbox';input.checked=value===true;}
    else {input.value=Array.isArray(value)?value.join(', '):valueText(value);input.placeholder=s.example;if(input instanceof HTMLInputElement&&s.kind==='integer'){input.type='number';input.min='1';}}
    if(override)input.disabled=values[s.key.replace(/-text$/,'-hide')]===true||!valueText(value).trim();
    const save=():void=>{
      value=s.kind==='boolean'?(input as HTMLInputElement).checked:s.kind==='integer'?Number(input.value):s.kind==='list'?input.value.split(/[,;\n]/).map(x=>x.trim()).filter(Boolean):input.value;
      if(source?.kind==='body')return;
      if(s.kind==='integer'&&(!Number.isSafeInteger(value)||Number(value)<1||Number(value)>100000)){input.setAttribute('aria-invalid','true');return;}input.removeAttribute('aria-invalid');this.callbacks.properties({[source?.key??s.key]:value});
    };
    let composing=false;input.addEventListener('compositionstart',()=>{composing=true;});input.addEventListener('compositionend',()=>{composing=false;save();});
    input.addEventListener('input',()=>{if(!composing)save();});if(input instanceof HTMLSelectElement)input.addEventListener('change',save);
    if(source?.kind==='body'){
      row.dataset.sourceLine=String(source.line);if(input instanceof HTMLInputElement||input instanceof HTMLTextAreaElement)input.readOnly=true;
      row.createEl('small',{text:tr('출력 출처: Markdown 본문. 본문에서 수정하면 서식과 작성 위치를 유지합니다.','Output source: Markdown body. Edit there to preserve its formatting and location.')});
      action(row,tr('본문에서 수정','Edit in body'),()=>this.focusLine(source.line!));
    }else if(source?.kind==='yaml'){
      row.createEl('small',{text:tr('출력 출처: YAML · ','Output source: YAML · ')+source.key});
    }
  }
  setSource(text:string):void{this.source=text;if(this.project.markdown)this.setCode();this.update(this.project);}
  private setCode(force=false):void{
    const value=this.raw?this.source:sourceParts(this.source).body;
    if(force){this.code?.destroy();this.code=null;this.bodyHost.empty();}
    if(!this.code){
      const forward=(kind:'editor-paste'|'editor-drop',event:ClipboardEvent|DragEvent,view:EditorView):boolean=>{if(!event.isTrusted)return false;this.callbacks.editorEvent?.(kind,event,new MarkdownEditorAdapter(view,this.callbacks));return event.defaultPrevented;};
      this.code=new EditorView({parent:this.bodyHost,state:EditorState.create({doc:value,extensions:[markdown(),EditorView.lineWrapping,keymap.of([{key:'Mod-z',run:()=>{this.callbacks.undo();return true;}},{key:'Mod-Shift-z',run:()=>{this.callbacks.redo();return true;}},...defaultKeymap,indentWithTab]),EditorView.contentAttributes.of({'aria-label':tr(this.raw?'전체 Markdown 원문':'Markdown 본문',this.raw?'Full Markdown source':'Markdown body')}),EditorView.updateListener.of(update=>{if(update.docChanged&&!this.applying&&!update.view.composing)this.emitText();}),EditorView.domEventHandlers({paste:(event,view)=>forward('editor-paste',event,view),drop:(event,view)=>{const pos=view.posAtCoords({x:event.clientX,y:event.clientY});if(pos!==null)view.dispatch({selection:{anchor:pos}});return forward('editor-drop',event,view);},compositionend:()=>{this.host.win.setTimeout(()=>this.emitText(),0);}})]})});
    }else if(this.code.state.doc.toString()!==value){
      const old=this.code.state.doc.toString();let from=0,end=old.length,newEnd=value.length;
      while(from<end&&from<newEnd&&old[from]===value[from])from++;
      while(end>from&&newEnd>from&&old[end-1]===value[newEnd-1]){end--;newEnd--;}
      this.applying=true;try{this.code.dispatch({changes:{from,to:end,insert:value.slice(from,newEnd)}});}finally{this.applying=false;}
    }
  }
  private emitText():void{if(!this.code||this.applying)return;const value=this.code.state.doc.toString().replace(/\r?\n/g,this.source.includes('\r\n')?'\r\n':'\n');this.source=this.raw?value:replaceSourceBody(this.source,value);this.callbacks.text(this.source);}
  private validGuidedSource():boolean{try{sourceProperties(this.source);return true;}catch(error){new Notice(error instanceof Error?error.message:String(error));return false;}}
  focusProperty(key:string):void{
    if(this.raw&&!this.validGuidedSource())return;
    if(this.raw){this.raw=false;this.fields.hidden=false;this.toggle.setAttribute('aria-pressed','false');this.setCode(true);}
    const el=Array.from(this.fields.querySelectorAll<HTMLElement>('[data-property]')).find(e=>e.dataset.property===key);
    if(el?.dataset.sourceLine!==undefined){this.focusLine(Number(el.dataset.sourceLine));return;}
    if(!el&&key==='aaeu-template'){this.callbacks.templates();return;}
    const group=el?.closest('details');if(group)group.open=true;
    el?.scrollIntoView({block:'center'});el?.querySelector<HTMLElement>('input,textarea,select')?.focus();
  }
  focusLine(line:number):void{
    if(!this.code)return;const offset=this.raw?0:(this.source.length-sourceParts(this.source).body.length?this.source.slice(0,this.source.length-sourceParts(this.source).body.length).split('\n').length-1:0);
    const n=Math.max(1,Math.min(this.code.state.doc.lines,line+1-offset)),pos=this.code.state.doc.line(n).from;
    this.code.dispatch({selection:{anchor:pos},effects:EditorView.scrollIntoView(pos,{y:'center'})});this.code.focus();
  }
  destroy():void{this.code?.destroy();this.code=null;this.host.empty();}
}
