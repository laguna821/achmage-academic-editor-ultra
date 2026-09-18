import {t} from './i18n';
import {uiLanguage} from './i18n';
import {openSampleFiles,type SampleLanguage,type SampleFiles} from './sample';
import {manuscriptTemplate,propertyTemplate,MARKDOWN_PROPERTIES} from './markdownProperties';
import {snapshotImages,reconcileMarkdown,sourceTextHash,sourceLine} from './markdownSource';
import {copyLegacyProject,copyLegacyTemplates} from './migration';
import {applyTemplate,copyTemplateAssets} from './templates';
import {clearImageMemoryCache} from '../io/obsidianImageLoader';
import {exportIdml} from "../io/idml";
import {journalEditableSnapshot} from "./editableExport";
import {afDialog} from "./afDialog";
import { ItemView, Notice, Modal, MarkdownView, Platform, requestUrl, TFile, parseYaml, type WorkspaceLeaf, type ViewStateResult } from "obsidian";
import type { FileGateway, SelectedExternalFile } from "../io/fileGateway";
import { action, choose, field, referenceDialog, textDialog } from "./forms";
import { JournalEngine } from "./engine";
import { JournalComposer } from "./layout";
import { JournalTextEditor } from "./editor";
import { JournalPreview } from "./preview";
import { JournalHistory, createJournalProject, setChangeDecision, validateProject } from "./project";
import { JournalStore, exportJournalArchive, importJournalArchive, digestBytes, jsonBytes } from "./storage";
import { importAuthorFile,addAsset } from "./docx";
import {importMarkdown,mergeMarkdownRevision} from './markdown';
import {createObsidianImageLoader} from '../io/obsidianImageLoader';
import {editorialPanel,endMatterPanel,cropDialog,markdownImportDialog} from './editorialPanels';
import {CaptionOcr,OCR_VERSION} from './ocr';
import {inferredAuthorKey} from './referenceOrder';
import {bindMention,objectMentions} from './numbering';
import {editorialIssues,embeddedTableCaption,resolveEmbeddedTableCaption,endMatterSnapshot} from './editorial';
import { registerFont } from "./fonts";
import { JournalTemplateWizard,resolveFonts } from "./templateWizard";
import {JournalTemplateLibrary} from "./templates";
import {discoverSystemFonts} from "./systemFonts";
import {academicChecks,referenceChecks,resolveTemplateText} from "./appearance";
import {compositionQuality} from './quality';
import {resolvedMaster} from "./master";
import {canonicalDoi,copyrightYear,publicationMode,publicationMissing,publicationReviewed,publicationSnapshot} from "./publication";
import { emptyReference, lookupCrossref } from "./references";
import { cloneJournal, inlineText, newId, type JournalProject, type JournalNode, type JournalSource, type LayoutResult, type LayoutOverride, type Paragraph } from "./types";

export const JOURNAL_VIEW="aaeu-journal";
export const PROJECTS="Academic Editor Ultra";
const templateLibraries=new WeakMap<object,JournalTemplateLibrary>();
const sampleAdapters=new WeakMap<object,SampleFiles>();
type Panel="article"|"publication"|"objects"|"references"|"changes"|"preset"|"issues"|"editorial"|"endMatter";
export class JournalView extends ItemView{
  private history=new JournalHistory(createJournalProject());
  private store:JournalStore;
  private engine=new JournalEngine();
  private composer=new JournalComposer(this.engine);
  private editor:JournalTextEditor|null=null;
  private preview:JournalPreview|null=null;
  private result:LayoutResult|null=null;
  private inspector!:HTMLElement;
  private status!:HTMLElement;
  private editorHost!:HTMLElement;
  private startEl!:HTMLElement;
  private workspaceEl!:HTMLElement;
  private startDismissed=false;
  private panel:Panel="article";
  private panelSelect:HTMLSelectElement|null=null;
  private selected="";
  private busy=false;
  private compositionTask:Promise<void>|null=null;
  private composeAgain=false;
  private editorKey="";
  private dirty=false;
  private closed=false;
  private controller:AbortController|null=null;
  private saveTimer:number|null=null;
  private renderTimer:number|null=null;
  private fontKey="";
  private ocr=new CaptionOcr();
  private ocrController:AbortController|null=null;
  private afController:AbortController|null=null;
  private sourceStale=false;
  private sourceTask:Promise<void>|null=null;
  constructor(leaf:WorkspaceLeaf,private readonly gateway:FileGateway,private readonly markdownSource:()=>{file:TFile;text:string}|null=()=>null){
    super(leaf);this.store=new JournalStore(this.app.vault.adapter,PROJECTS+"/"+this.history.current.id);
  }
  getViewType():string{return JOURNAL_VIEW;}
  getDisplayText():string{return "Academic Editor Ultra";}
  getIcon():string{return "notebook-pen";}
  getState():Record<string,unknown>{return {root:this.store.root};}
  async setState(state:Record<string,unknown>,result:ViewStateResult):Promise<void>{
    if(typeof state.root==="string"&&state.root!==this.store.root){
      const store=new JournalStore(this.app.vault.adapter,state.root);
      try{this.history=new JournalHistory(await store.load());this.store=store;this.refresh();}catch(e){this.report(e);}
    }
    await super.setState(state,result);
  }
  async onOpen():Promise<void>{
    this.closed=false;this.contentEl.empty();this.contentEl.addClass("aaeu-journal");
    const toolbar=this.contentEl.createDiv({cls:"aaeu-journal-toolbar"});
    const task=(label:string,run:()=>Promise<void>):void=>{action(toolbar,label,()=>this.run(run));};
    task(t('설명서 원고로 시작'),()=>this.openSampleManuscript());
    task(t("새 Markdown 원고"),()=>this.createMarkdownManuscript());
    task(t("HanMark 프로젝트 복사"),()=>this.migrateHanmark());
    task(t("원문 열기"),()=>this.openMarkdownSource());
    task(t("기존 편집본을 원문 모드로 복사"),()=>this.transitionMarkdown());
    task(t("원격 이미지 새로고침"),async()=>{await this.refreshBoundSource(true);await this.compose();});
    task(t("새 Word 편집본"),async()=>{await this.save();this.history=new JournalHistory(createJournalProject());this.store=new JournalStore(this.app.vault.adapter,PROJECTS+"/"+this.history.current.id);this.startDismissed=false;this.panel='article';this.result=null;this.preview?.clear();this.refresh();await this.save();});
    task(t("프로젝트 열기"),()=>this.openProject());
    task(t("DOCX·그림 가져오기"),()=>this.importFiles());
    task(t('Markdown 가져오기'),()=>this.pickMarkdown(false));task(t('Markdown 원문 다시 가져오기'),()=>this.pickMarkdown(true));
    task(t('이미지 캡션 검사'),()=>this.scanCaptions());
    action(toolbar,t("저널 템플릿"),()=>this.openTemplates());
    task(t("글꼴 파일 등록"),()=>this.importFonts());
    task(t("글꼴 목록 새로고침"),async()=>{const c=await discoverSystemFonts(true);this.status.setText(`설치 글꼴 ${new Set(c.fonts.map(f=>f.family)).size}개 · ${c.warnings.join(" ")}`);});
    task(t("저장"),()=>this.save());
    task(t("프로젝트 ZIP"),async()=>{await this.save();await this.gateway.saveFile(await exportJournalArchive(this.project,this.store),this.filename()+".hanmark.zip");});
    task(t("ZIP 열기"),async()=>{const files=await this.gateway.pickFiles({extensions:["zip"],maxFiles:1});if(!files[0])return;await this.save();const store=new JournalStore(this.app.vault.adapter,PROJECTS+"/"+newId("journal"));const project=await importJournalArchive(files[0].bytes,store);this.store=store;this.history=new JournalHistory(project);this.result=null;this.preview?.clear();this.refresh();await this.save();});
    task(t("조판"),()=>this.compose());
    action(toolbar,t("발행정보 확인"),()=>{this.panel="publication";this.renderInspector();});
    action(toolbar,t("취소"),()=>{this.controller?.abort();this.afController?.abort();this.ocrController?.abort();this.ocr.cancel();this.engine.cancel();this.fontKey="";});
    task(t("검토용 PDF"),()=>this.exportPdf(false));task(t("최종 PDF"),()=>this.exportPdf(true));task(t("IDML로 내보내기"),()=>this.exportIdml());
    task(t("AF로 내보내기"),()=>this.exportAf());
    const proofView=action(toolbar,uiLanguage()==='ko'?'지면 크게 보기':'Expand proof',()=>{
      const expanded=this.contentEl.classList.toggle('aaeu-proof-expanded');
      proofView.setAttribute('aria-pressed',String(expanded));
      proofView.setText(uiLanguage()==='ko'?(expanded?'편집 패널 보기':'지면 크게 보기'):(expanded?'Show editing panels':'Expand proof'));
    });proofView.setAttribute('aria-pressed','false');
    this.status=this.contentEl.createDiv({cls:"aaeu-journal-status",text:t("원고 가져오기 → 본문 편집 → 템플릿·발행정보 확인 → 조판 → PDF")});
    this.startEl=this.contentEl.createDiv({cls:"aaeu-journal-start"});
    const workspace=this.workspaceEl=this.contentEl.createDiv({cls:"aaeu-journal-workspace"}),left=workspace.createDiv({cls:"aaeu-journal-left"});
    const formats=left.createDiv({cls:"aaeu-journal-format"});
    action(formats,t("되돌리기"),()=>this.undo());action(formats,t("다시 실행"),()=>this.redo());
    action(formats,t("굵게"),()=>this.editor?.format("bold"));action(formats,t("기울임"),()=>this.editor?.format("italic"));
    choose(formats,t("문단"),"0",{"0":t("본문"),"1":t("제목 1"),"2":t("제목 2"),"3":t("제목 3"),"4":t("제목 4"),"5":t("제목 5")},v=>this.editor?.heading(Number(v)));
    for(const [id,label]of Object.entries({row:t("행 추가"),column:t("열 추가"),deleteRow:t("행 삭제"),deleteColumn:t("열 삭제"),merge:t("셀 합치기"),split:t("셀 나누기")}))action(formats,label,()=>this.editor?.table(id as "row"));
    this.editorHost=left.createDiv({cls:"aaeu-journal-editor"});
    const center=workspace.createDiv({cls:"aaeu-journal-preview"});
    this.preview=new JournalPreview(center,id=>this.selectNode(id),o=>this.applyOverride(o));
    const right=workspace.createDiv({cls:"aaeu-journal-right"});
    this.panelSelect=choose(right,t("편집 패널"),this.panel,{article:t("원고 정보"),publication:t("발행정보 확인"),endMatter:t('논문 말미 정보'),editorial:t('원고 정리·연결'),objects:t("표·그림·프레임"),references:t("참고문헌"),changes:t("저자 변경 기록"),preset:t("저널 템플릿"),issues:t("검사 결과")},v=>{this.panel=v as Panel;this.renderInspector();});
    this.inspector=right.createDiv({cls:"aaeu-journal-inspector"});this.refresh();
    const stale=():void=>{if(this.project.markdown){this.sourceStale=true;this.status.setText(t('원문 또는 이미지가 변경되었습니다 · 조판/내보내기에서 최신 내용 확인'));}};
    this.registerEvent(this.app.vault.on('modify',file=>{if(this.project.markdown&&(file.path===this.project.markdown.path||this.project.markdown.dependencies.some(d=>d.localPath===file.path)))stale();}));
    this.registerEvent(this.app.vault.on('delete',file=>{if(file.path===this.project.markdown?.path)stale();}));
    this.registerEvent(this.app.vault.on('rename',(file,old)=>{if(this.project.markdown?.path===old){this.edit(p=>{p.markdown!.path=file.path;for(const source of p.sources)if(source.originalPath===old)source.originalPath=file.path;},false);stale();}}));
    this.registerEvent(this.app.workspace.on('editor-change',(_editor,info)=>{if(info.file?.path===this.project.markdown?.path)stale();}));
  }
  private get project():JournalProject{return this.history.current;}
  private filename():string{return (this.project.document.title||"journal").replace(/[\\/:*?"<>|]/g,"_").slice(0,100);}
  private report(e:unknown):void{const message=e instanceof Error?e.message:String(e);if(this.status)this.status.setText(message);new Notice(message,8000);}
  private async run(fn:()=>Promise<void>):Promise<void>{try{await fn();}catch(e){this.report(e);}}
  private refresh():void{
    if(!this.editorHost)return;
    this.contentEl.querySelector<HTMLElement>('.aaeu-journal-format')?.toggleClass('aaeu-hidden',!!this.project.markdown);
    if(this.project.markdown){
      this.editor?.destroy();this.editor=null;this.editorHost.empty();
      this.editorHost.createEl('h3',{text:t('Markdown 원문이 기준입니다')});
      this.editorHost.createEl('p',{text:this.project.markdown.path});
      this.editorHost.createEl('p',{text:t('본문과 YAML은 원문에서 수정하세요. 조판할 때 변경 내용과 로컬 이미지를 확인합니다. 원격 이미지는 저장된 사본을 사용하며, 새로고침 버튼으로 다시 조회합니다.')});
      action(this.editorHost,t('원문 편집'),()=>this.run(()=>this.openMarkdownSource()));
      action(this.editorHost,t('원문 갱신·조판'),()=>this.run(()=>this.compose()));
      action(this.editorHost,t('전체 YAML 속성 안내'),()=>this.showPropertyGuide());
      for(const n of this.project.document.blocks){const text=n.kind==='paragraph'||n.kind==='heading'?inlineText(n.content):n.kind==='table'?t('표'):n.kind==='figure'?t('그림'):'';if(text)action(this.editorHost,text.slice(0,160),()=>this.run(()=>this.openMarkdownSource(n.id)));}
      this.refreshStart();this.renderInspector();return;
    }
    const key=this.project.id+JSON.stringify(this.project.document.blocks);
    if(!this.editor||key!==this.editorKey){
      this.editor?.destroy();this.editorHost.empty();this.editorKey=key;
      this.editor=new JournalTextEditor(this.editorHost,this.project,blocks=>{
        this.edit(p=>{p.document.blocks=blocks;},false);this.editorKey=this.project.id+JSON.stringify(this.project.document.blocks);
      },id=>{this.selected=id;},()=>this.undo(),()=>this.redo());
    }
    this.refreshStart();
    this.renderInspector();
  }
  refreshStart():void{
    if(!this.startEl)return;
    const empty=!this.startDismissed&&!this.project.sources.length&&!this.project.document.blocks.length&&!this.project.document.title;
    this.startEl.hidden=!empty;this.workspaceEl.hidden=empty;this.startEl.empty();
    if(!empty)return;
    this.startEl.createEl('h2',{text:t('저널 편집 시작')});
    this.startEl.createEl('p',{text:t('원고를 가져오면 본문·표·그림과 발행정보를 한 화면에서 편집하고, 학술지 PDF를 미리 볼 수 있습니다.')});
    const cards=this.startEl.createDiv({cls:'aaeu-journal-start-options'}),source=this.markdownSource();
    const option=(title:string,description:string,run:()=>Promise<void>):HTMLButtonElement=>{
      const button=cards.createEl('button',{cls:'aaeu-journal-start-option',attr:{type:'button','aria-label':title}});
      button.createEl('strong',{text:title});button.createSpan({text:description});button.onclick=()=>this.run(run);return button;
    };
    option(t('설명서 원고로 시작'),t('직접 고치고 조판해 보는 설명서입니다.'),()=>this.openSampleManuscript());
    const markdown=option(t('현재 Markdown 노트로 시작'),source?source.file.basename:t('먼저 Markdown 노트를 열어 주세요.'),async()=>{const current=this.markdownSource();if(current)await this.importMarkdownNote(current.file,current.text);else new Notice(t('먼저 Markdown 노트를 열어 주세요.'));});
    markdown.disabled=!source;
    option(t('새 Markdown 원고 작성'),t('전체 YAML 속성 및 본문 템플릿으로 시작합니다.'),()=>this.createMarkdownManuscript());
    option(t('Word 원고로 시작'),t('저자가 보낸 .docx 원고를 선택합니다. 원고 안의 표·그림도 함께 가져옵니다.'),()=>this.importFiles());
    option(t('저장한 프로젝트 열기'),t('이 볼트에서 편집하던 저널 프로젝트를 이어서 엽니다.'),()=>this.openProject());
    action(this.startEl,t('빈 프로젝트에서 직접 작성'),()=>{this.startDismissed=true;this.refreshStart();});
    this.startEl.createEl('h3',{text:t('가져온 다음에는')});
    const steps=this.startEl.createEl('ol');
    for(const text of [t('저널 템플릿: 로고·문구·색상을 고릅니다. 필요한 설치 글꼴은 조판할 때 자동으로 가져옵니다.'),t('발행정보 확인: 권·호, DOI, 교신저자와 논문 말미 정보를 입력합니다.'),t('조판: 미리보기에서 본문·표·그림을 확인하고 검토용 PDF로 저장합니다.')])steps.createEl('li',{text});
    this.startEl.createEl('p',{cls:'aaeu-journal-start-note',text:t('Word는 별도 편집본으로, Markdown은 원문을 기준으로 작업합니다. 다른 Markdown 파일은 상단의 Markdown 가져오기를 이용하세요.')});
  }
  private edit(fn:(p:JournalProject)=>void,refresh=true):void{
    this.history.change(fn);this.dirty=true;if(refresh)this.refresh();
    if(this.saveTimer)this.contentEl.win.clearTimeout(this.saveTimer);
    this.saveTimer=this.contentEl.win.setTimeout(()=>{void this.run(()=>this.save());},600);
    if(this.result){if(this.renderTimer)this.contentEl.win.clearTimeout(this.renderTimer);this.renderTimer=this.contentEl.win.setTimeout(()=>{void this.run(()=>this.compose());},900);}
  }
  private undo():void{this.history.undo();this.dirty=true;this.refresh();void this.run(async()=>{await this.save();if(this.result)await this.compose();});}
  private redo():void{this.history.redo();this.dirty=true;this.refresh();void this.run(async()=>{await this.save();if(this.result)await this.compose();});}
  private async save():Promise<void>{if(this.saveTimer)this.contentEl.win.clearTimeout(this.saveTimer);await this.store.save(this.project);this.dirty=false;if(this.status)this.status.setText(t("저장됨 · ")+this.store.root);}
  private async openProject():Promise<void>{
    if(!await this.app.vault.adapter.exists(PROJECTS)){new Notice(t("저장된 저널 프로젝트가 없습니다."));return;}
    const listing=await this.app.vault.adapter.list(PROJECTS);
    const modal=new Modal(this.app);modal.titleEl.setText(t("저널 프로젝트 열기"));
    for(const root of listing.folders){
      try{const store=new JournalStore(this.app.vault.adapter,root),p=await store.load();action(modal.contentEl,p.document.title||root,()=>this.run(async()=>{await this.save();this.store=store;this.history=new JournalHistory(p);this.result=null;this.preview?.clear();modal.close();this.refresh();}));}catch{/* Invalid folders remain untouched. */}
    }modal.open();
  }
  private async roles(files:SelectedExternalFile[]):Promise<{file:SelectedExternalFile;role:JournalSource["role"]}[]|null>{
    return new Promise(resolve=>{
      const modal=new Modal(this.app);modal.titleEl.setText(t("원고 파일 역할"));
      const rows=files.map<{file:SelectedExternalFile;role:JournalSource["role"]}>(file=>({file,role:/\.docx$/i.test(file.name)?"manuscript":"figures"}));let result:typeof rows|null=null;
      for(const row of rows)choose(modal.contentEl,row.file.name,row.role,{manuscript:t("본문"),title:t("제목·저자"),tables:t("별첨 표"),figures:t("별첨 그림"),appendix:t("부록"),ignore:t("원본만 보관")},v=>row.role=v as JournalSource["role"]);
      action(modal.contentEl,t("가져오기"),()=>{result=rows;modal.close();});action(modal.contentEl,t("취소"),()=>modal.close());modal.onClose=()=>resolve(result);modal.open();
    });
  }
  private async importFiles():Promise<void>{
    if(this.project.markdown)throw new Error('현재 원고는 Markdown 원문 모드입니다. Word 작업은 새 Word 편집본에서 시작하세요.');
    const files=await this.gateway.pickFiles({extensions:["docx","pdf","png","jpg","jpeg","svg","gif","webp","tiff","tif","emf","wmf"],multiple:true,maxFiles:100,maxTotalBytes:256*1024*1024});
    if(!files.length)return;const rows=await this.roles(files);if(!rows)return;
    const next=cloneJournal(this.project);
    for(const {file,role}of rows)await importAuthorFile(next,{name:file.name,bytes:file.bytes,role},this.store);
    this.edit(p=>Object.assign(p,next));this.panel="issues";this.renderInspector();await this.save();void this.run(()=>this.scanCaptions());
  }
  private openTemplates():void{
    const adapter=this.app.vault.adapter;let library=templateLibraries.get(adapter);
    if(!library){library=new JournalTemplateLibrary(new JournalStore(adapter,this.app.vault.configDir+"/plugins/achmage-academic-editor-ultra/journal-templates"));templateLibraries.set(adapter,library);}
    const id=this.project.id,revision=this.project.revision;
    new JournalTemplateWizard(this.app,this.gateway,this.project,this.store,library,next=>{
      if(this.project.id!==id||this.project.revision!==revision){new Notice("원고가 변경됐습니다. 저장된 템플릿을 다시 열어 현재 원고에 적용하세요.");return;}
      this.edit(p=>{p.preset=next.preset;p.fonts=next.fonts;p.assets=next.assets;});this.panel="preset";this.renderInspector();
      void this.run(()=>this.compose());
    }).open();
  }
  private async importFonts():Promise<void>{
    const files=await this.gateway.pickFiles({extensions:["ttf","otf","ttc","otc"],multiple:true,maxFiles:100,maxTotalBytes:200*1024*1024});if(!files.length)return;
    const next=cloneJournal(this.project);for(const f of files)await registerFont(next,this.store,f.name,f.bytes);
    this.edit(p=>{p.fonts=next.fonts;});this.panel="preset";this.renderInspector();await this.save();
  }
  private selectNode(id:string):void{
    this.selected=id;
    this.panel=id==='publication:title'?'article':id.startsWith('publication:')?'publication':this.project.document.endMatter?.some(e=>e.id===id||e.content.some(n=>n.id===id))?'endMatter':this.project.references.some(r=>r.id===id)?'references':'objects';
    this.renderInspector();if(this.project.markdown)action(this.inspector,t('원문 위치로 이동'),()=>this.run(()=>this.openMarkdownSource(id)));this.preview?.focusNode(id,this.result?.boxes??[]);
    for(const el of Array.from(this.inspector.querySelectorAll<HTMLElement>('[data-end-matter-id],[data-reference-id],[data-publication-zone]')))if(el.dataset.endMatterId===id||el.dataset.referenceId===id||el.dataset.publicationZone===id.replace('publication:',''))el.scrollIntoView({block:'nearest'});
  }
  private async pickMarkdown(reimport:boolean):Promise<void>{
    const source=[...this.project.sources].reverse().find(s=>s.format==='markdown');
    const path=reimport?source?.originalPath:await textDialog(this.app,t('Markdown 저널 원고'),t('볼트 안의 Markdown 파일 경로'),this.app.workspace.getActiveFile()?.path??'');
    if(!path){if(reimport)throw new Error(t('현재 프로젝트에 연결된 Markdown 원문이 없습니다.'));return;}
    const file=this.app.vault.getAbstractFileByPath(path);if(!(file instanceof TFile)||file.extension!=='md')throw new Error(t('Markdown 파일을 찾을 수 없습니다.'));
    await this.importMarkdownNote(file,await this.app.vault.read(file),reimport);
  }
  async importMarkdownNote(file:TFile,text:string,reimport=false):Promise<void>{
    if(!reimport){
      if(this.project.markdown?.path===file.path)reimport=true;
      else if(await this.app.vault.adapter.exists(PROJECTS))for(const root of (await this.app.vault.adapter.list(PROJECTS)).folders){
        let existing:JournalProject;const store=new JournalStore(this.app.vault.adapter,root);
        try{existing=await store.load();}catch{continue;}
        if(existing.markdown?.path===file.path){await this.save();this.store=store;this.history=new JournalHistory(existing);this.result=null;this.preview?.clear();reimport=true;break;}
      }
    }
    if(!reimport||this.project.markdown){await this.importSourceNote(file,text,reimport);return;}
    if(reimport&&this.project.editorial?.changes.some(c=>c.status==='pending'))throw new Error('이전 재가져오기의 차이를 검토한 뒤 다시 가져오세요.');
    const options=await markdownImportDialog(this.app,text,reimport?[...this.project.sources].reverse().find(s=>s.format==='markdown')?.markdownOptions:undefined);if(!options)return;
    this.ocrController?.abort();await this.save();
    const next=createJournalProject();next.preset=cloneJournal(this.project.preset);next.fonts=cloneJournal(this.project.fonts);
    const loader=createObsidianImageLoader(this.app,file),front=text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\s*(?:\r?\n|$)/);
    let metadata:Record<string,unknown>={};if(front){const parsed:unknown=parseYaml(front[1]);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))metadata=parsed as Record<string,unknown>;}
    const store=reimport?this.store:new JournalStore(this.app.vault.adapter,PROJECTS+'/'+next.id);
    if(!reimport)for(const font of next.fonts){const bytes=await this.store.get(font.path);if(bytes)await store.put(font.path,bytes);}
    if(!reimport)for(const id of [next.preset.master?.logoAssetId,next.preset.master?.crossmarkAssetId]){const asset=this.project.assets.find(a=>a.id===id);if(asset){const bytes=await this.store.get(asset.path);if(bytes){next.assets.push(cloneJournal(asset));await store.put(asset.path,bytes);}}}
    await importMarkdown(next,{name:file.name,path:file.path,text,metadata,...options,resolveImage:async src=>{const image=await loader(src);return {bytes:new Uint8Array(image.data),mime:image.contentType,name:src.split('/').at(-1)};}},store);
    if(reimport){const merged=mergeMarkdownRevision(this.project,next);this.edit(p=>Object.assign(p,merged));}
    else {this.store=store;this.history=new JournalHistory(next);this.result=null;this.preview?.clear();this.refresh();}
    this.panel='editorial';this.renderInspector();await this.save();void this.run(()=>this.scanCaptions());
  }
  private sourceText(file:TFile):Promise<string>{
    const view=this.app.workspace.getLeavesOfType('markdown').map(l=>l.view).find((v):v is MarkdownView=>v instanceof MarkdownView&&v.file?.path===file.path);
    return view?Promise.resolve(view.editor.getValue()):this.app.vault.read(file);
  }
  private library():JournalTemplateLibrary{
    const adapter=this.app.vault.adapter;let library=templateLibraries.get(adapter);
    if(!library){library=new JournalTemplateLibrary(new JournalStore(adapter,this.app.vault.configDir+'/plugins/achmage-academic-editor-ultra/journal-templates'));templateLibraries.set(adapter,library);}return library;
  }
  async createMarkdownManuscript():Promise<void>{
    const templates=await this.library().list();
    const selected=await new Promise<string|null>(resolve=>{const modal=new Modal(this.app);let value:string|null=null;modal.titleEl.setText(t('새 원고의 저널 템플릿'));for(const t of templates)action(modal.contentEl,t.name,()=>{value=t.id;modal.close();});modal.onClose=()=>resolve(value);modal.open();});
    if(!selected)return;
    const path=await textDialog(this.app,t('저널 Markdown 원고 만들기'),t('볼트 안에 새로 만들 파일 경로'),'Journal manuscript.md');if(!path)return;
    const target=path.endsWith('.md')?path:path+'.md';if(this.app.vault.getAbstractFileByPath(target))throw new Error(t('같은 이름의 파일이 있습니다. 다른 이름을 입력하세요.'));
    const file=await this.app.vault.create(target,manuscriptTemplate(selected));
    await this.importSourceNote(file,await this.app.vault.read(file),false);await this.openMarkdownSource('property:aaeu-title');
  }
  async openSampleManuscript(language:SampleLanguage=uiLanguage(),newCopy=false):Promise<void>{
    const path='Academic Editor Ultra Samples/'+(language==='ko'?'한국어':'English')+'/Start here.md';
    if(!newCopy&&await this.app.vault.adapter.exists(path)){
      const choice=await new Promise<'open'|'copy'|null>(resolve=>{
        const modal=new Modal(this.app);modal.titleEl.setText(t('샘플 원고'));let value:'open'|'copy'|null=null;
        action(modal.contentEl,t('기존 샘플 열기'),()=>{value='open';modal.close();});
        action(modal.contentEl,t('새 사본 만들기'),()=>{value='copy';modal.close();});
        action(modal.contentEl,t('취소'),()=>modal.close());modal.onClose=()=>resolve(value);modal.open();
      });
      if(!choice)return;newCopy=choice==='copy';
    }
    const vault=this.app.vault;let files=sampleAdapters.get(vault);
    if(!files){files={exists:path=>vault.adapter.exists(path),read:path=>vault.adapter.read(path),mkdir:async path=>{await vault.createFolder(path);},write:async(path,text)=>{await vault.create(path,text);}};sampleAdapters.set(vault,files);}
    const sample=await openSampleFiles(files,language,newCopy);
    const file=vault.getAbstractFileByPath(sample.path);
    if(!(file instanceof TFile))throw new Error(t('Markdown 파일을 찾을 수 없습니다.'));
    await this.importMarkdownNote(file,await this.app.vault.read(file));
    await this.openMarkdownSource('property:aaeu-title');
  }
  private async importSourceNote(file:TFile,text:string,reimport:boolean,refreshRemote=false):Promise<void>{
    this.ocrController?.abort();await this.save();
    const previous=this.project,previousId=previous.id,previousRevision=previous.revision,next=createJournalProject();next.preset=cloneJournal(previous.preset);next.fonts=cloneJournal(previous.fonts);
    const store=reimport?this.store:new JournalStore(this.app.vault.adapter,PROJECTS+'/'+next.id);
    for(const font of next.fonts)if(!reimport){const bytes=await this.store.get(font.path);if(bytes)await store.put(font.path,bytes);}
    for(const id of [next.preset.master?.logoAssetId,next.preset.master?.crossmarkAssetId]){const a=previous.assets.find(a=>a.id===id);if(a){next.assets.push(cloneJournal(a));if(!reimport){const bytes=await this.store.get(a.path);if(bytes)await store.put(a.path,bytes);}}}
    const front=text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\s*(?:\r?\n|$)/);
    const parsed:unknown=front?parseYaml(front[1]):{};
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error(t('YAML 속성은 이름: 값 형식이어야 합니다.'));
    const metadata=parsed as Record<string,unknown>,templateId=typeof metadata['aaeu-template']==='string'?metadata['aaeu-template']:undefined;
    if(templateId){const library=this.library(),template=(await library.list()).find(t=>t.id===templateId);if(template){if(!reimport||previous.markdown?.templateId!==templateId){await copyTemplateAssets(template,library.store,store);applyTemplate(next,template);}}else next.issues.push({id:'property:aaeu-template',code:'markdown-property',severity:'error',nodeId:'property:aaeu-template',message:t('aaeu-template: 등록된 템플릿을 찾을 수 없습니다: ')+templateId});}
    if(refreshRemote)clearImageMemoryCache();
    const loader=createObsidianImageLoader(this.app,file);
    const images=snapshotImages(store,reimport?previous.markdown?.dependencies??[]:[],async src=>{const image=await loader(src);let link=src;try{link=decodeURI(src);}catch{/* Keep literal path. */}const local=/^(https?:|data:)/i.test(src)?undefined:this.app.metadataCache.getFirstLinkpathDest(link,file.path);return {bytes:new Uint8Array(image.data),mime:image.contentType,name:src.split('/').at(-1)?.split(/[?#]/)[0],localPath:local?.path};},refreshRemote);
    await importMarkdown(next,{name:file.name,path:file.path,text,metadata,resolveImage:images.resolve},store);
    next.markdown={mode:'source',path:file.path,sha256:await sourceTextHash(text),properties:metadata,templateId,dependencies:images.dependencies};
    const result=reimport?reconcileMarkdown(previous,next):next;
    if(this.closed||this.project.id!==previousId||this.project.revision!==previousRevision)throw new Error(t('원문을 읽는 동안 프로젝트가 변경됐습니다. 다시 가져오세요.'));
    this.store=store;this.history=new JournalHistory(result);this.result=null;this.preview?.clear();this.sourceStale=false;this.refresh();await this.save();
  }
  private refreshBoundSource(refreshRemote=false):Promise<void>{
    if(this.sourceTask)return this.sourceTask;
    this.sourceTask=this.refreshSourceNow(refreshRemote).finally(()=>{this.sourceTask=null;});return this.sourceTask;
  }
  private async refreshSourceNow(refreshRemote:boolean):Promise<void>{
    const binding=this.project.markdown;if(!binding)return;
    const file=this.app.vault.getAbstractFileByPath(binding.path);if(!(file instanceof TFile))throw new Error('연결된 Markdown 원문이 없습니다. 원문 다시 연결을 사용하세요: '+binding.path);
    const text=await this.sourceText(file);let changed=await sourceTextHash(text)!==binding.sha256;
    const loader=createObsidianImageLoader(this.app,file);
    for(const dep of binding.dependencies.filter(d=>d.kind==='local')){try{const image=await loader(dep.src);if(await digestBytes(new Uint8Array(image.data))!==dep.sha256)changed=true;}catch{changed=true;}}
    if(changed||refreshRemote)await this.importSourceNote(file,text,true,refreshRemote);else this.sourceStale=false;
  }
  private async assertSourceFresh():Promise<void>{
    const result=this.result;await this.refreshBoundSource();if(result!==this.result||this.sourceStale)throw new Error(t('내보내는 동안 원문이 변경됐습니다. 새 미리보기를 확인하세요.'));
  }
  private async openMarkdownSource(id=''):Promise<void>{
    const path=this.project.markdown?.path??[...this.project.sources].reverse().find(s=>s.format==='markdown')?.originalPath;
    const file=path?this.app.vault.getAbstractFileByPath(path):null;if(!(file instanceof TFile))throw new Error(t('연결된 Markdown 원문이 없습니다.'));
    const text=await this.sourceText(file),leaf=this.app.workspace.getLeaf('tab');await leaf.openFile(file);
    if(leaf.view instanceof MarkdownView){const line=sourceLine(this.project,id,text);leaf.view.editor.setCursor({line,ch:0});leaf.view.editor.scrollIntoView({from:{line,ch:0},to:{line,ch:0}},true);}
  }
  private showPropertyGuide():void{
    const modal=new Modal(this.app);modal.titleEl.setText(t('저널 YAML 속성 · 원문은 자동 수정하지 않습니다'));
    const keys=this.project.markdown?.properties??{};const area=modal.contentEl.createEl('textarea');area.rows=18;area.value=propertyTemplate(this.project.preset.template?.id);area.readOnly=true;area.setAttribute('aria-label',t('전체 YAML 속성 템플릿'));
    for(const spec of MARKDOWN_PROPERTIES)modal.contentEl.createEl('p',{text:spec.key+' · '+spec.label+(keys[spec.key]!==undefined?t(' · 입력됨'):'')});modal.open();
  }
  private async transitionMarkdown():Promise<void>{
    if(this.project.markdown){new Notice(t('이미 Markdown 원문 모드입니다.'));return;}
    const source=[...this.project.sources].reverse().find(s=>s.format==='markdown'),file=source?.originalPath?this.app.vault.getAbstractFileByPath(source.originalPath):null;
    if(!(file instanceof TFile))throw new Error('이전 Markdown 원문이 없습니다. Markdown 가져오기로 원문을 선택하세요. 기존 프로젝트는 그대로 보존됩니다.');
    const text=await this.sourceText(file),modal=new Modal(this.app);modal.titleEl.setText('원문 모드로 별도 복사 · 기존 편집본 보존');
    modal.contentEl.createEl('p',{text:'왼쪽 편집본의 수동 수정은 자동으로 Markdown에 합치지 않습니다. 아래 편집본과 원문을 대조하여 필요한 수정을 원문에 먼저 반영하세요.'});
    for(const [label,value]of [['기존 편집본',JSON.stringify(this.project.document,null,2)],['현재 Markdown 원문',text]]){modal.contentEl.createEl('h3',{text:label});const area=modal.contentEl.createEl('textarea');area.value=value;area.readOnly=true;area.rows=10;area.setAttribute('aria-label',label);}
    action(modal.contentEl,'차이를 확인했습니다 · 원문으로 새 프로젝트 복사',()=>this.run(async()=>{await this.importSourceNote(file,await this.sourceText(file),false);modal.close();}));
    action(modal.contentEl,t('취소'),()=>modal.close());modal.open();
  }
  private sourceInspector(host:HTMLElement):void{
    host.createEl('h3',{text:t('원문 속성·내용 확인')});host.createEl('p',{text:t('제목·초록·저자·본문·선언문은 연결된 Markdown에서 수정합니다. 템플릿·배치 설정과 확인 기록은 이 프로젝트에 저장됩니다.')});
    action(host,t('원문 편집'),()=>this.run(()=>this.openMarkdownSource(this.selected)));
    action(host,t('전체 YAML 속성 안내'),()=>this.showPropertyGuide());
    if(this.panel==='endMatter')for(const item of this.project.document.endMatter??[]){
      const card=host.createDiv({cls:'aaeu-journal-card'});card.createEl('strong',{text:item.title});card.createEl('p',{text:item.content.map(n=>inlineText(n.content)).join('\n')||t('미입력')});
      action(card,t('이 내용 확인'),()=>this.edit(p=>{const e=p.document.endMatter!.find(e=>e.id===item.id)!;e.reviewed=endMatterSnapshot(e);}));
    }
    action(host,t('원문 다시 연결'),()=>this.run(async()=>{const path=await textDialog(this.app,t('원문 다시 연결'),t('볼트 Markdown 경로'),this.project.markdown!.path);if(!path)return;const f=this.app.vault.getAbstractFileByPath(path);if(!(f instanceof TFile)||f.extension!=='md')throw new Error(t('Markdown 파일을 찾을 수 없습니다.'));await this.importSourceNote(f,await this.sourceText(f),true);}));
    if(this.panel==='references'){
      action(host,t('Crossref 후보 조회 · 원문 교정 제안'),()=>this.run(async()=>{const q=await textDialog(this.app,t('Crossref 조회'),t('조회할 DOI 또는 서지정보'),'');if(!q)return;const records=await lookupCrossref(q,async url=>(await requestUrl({url})).json as unknown);const modal=new Modal(this.app);modal.titleEl.setText(t('조회 결과 · 원문과 대조하여 반영하세요'));for(const r of records){modal.contentEl.createEl('p',{text:[r.title,r.year,r.containerTitle,r.doi?'https://doi.org/'+r.doi:''].filter(Boolean).join(' · ')});}modal.open();}));
      for(const r of this.project.references)action(host,r.raw.slice(0,100),()=>this.run(()=>this.openMarkdownSource(r.id)));
    }else if(this.panel==='objects'){
      host.createEl('p',{text:t('표·그림 내용과 순서는 원문을 따릅니다. 출력 위치 미세 조정은 미리보기에서 할 수 있습니다.')});
    }else{
      for(const key of ['aaeu-title','aaeu-abstract','aaeu-running-title','aaeu-received','aaeu-revised','aaeu-accepted','aaeu-corresponding-name','aaeu-data-text','aaeu-conflict-text','aaeu-acknowledgments-text'])action(host,key+' · '+JSON.stringify(this.project.markdown?.properties[key]??t('템플릿/본문 사용')).slice(0,85),()=>this.run(()=>this.openMarkdownSource('property:'+key)));
    }
    action(host,t('현재 발행정보 확인·확정'),()=>this.run(async()=>{await this.refreshBoundSource();if(!this.result||this.result.fingerprint!==await digestBytes(jsonBytes(this.project))){await this.compose();this.status.setText(t('갱신된 미리보기를 확인한 뒤 다시 확정하세요.'));return;}const snapshot=publicationSnapshot(this.project,this.result.pageCount);this.edit(p=>{p.document.publication={...p.document.publication,mode:publicationMode(p.document),review:{snapshot,at:new Date().toISOString()}};},false);await this.save();}));
  }
  async migrateHanmark():Promise<void>{
    await copyLegacyTemplates(this.app.vault.adapter,this.app.vault.configDir);
    if(!await this.app.vault.adapter.exists('HanMark Journals'))throw new Error('이 볼트에 HanMark Journals 폴더가 없습니다. ZIP 열기도 사용할 수 있습니다.');
    const modal=new Modal(this.app);modal.titleEl.setText('HanMark 프로젝트 복사 · 원본 보존');
    for(const root of (await this.app.vault.adapter.list('HanMark Journals')).folders){try{const p=await new JournalStore(this.app.vault.adapter,root).load();action(modal.contentEl,p.document.title||root,()=>this.run(async()=>{await this.save();const copied=await copyLegacyProject(this.app.vault.adapter,root,PROJECTS);this.history=new JournalHistory(copied.project);this.store=copied.store;this.result=null;this.preview?.clear();this.refresh();modal.close();this.status.setText(copied.existing?'이미 복사한 프로젝트를 열었습니다.':'복사 완료 · 기존 편집 방식 유지 · 원본 변경 없음');}));}catch{/* Not a project. */}}modal.open();
  }
  private async scanCaptions(onlyId?:string):Promise<void>{
    if(this.ocrController)return;const controller=new AbortController();this.ocrController=controller;const projectId=this.project.id;
    try{
      const ids=new Set(this.project.document.blocks.filter(n=>n.kind==='figure').map(n=>n.assetId));
      const assets=this.project.assets.filter(a=>ids.has(a.id)&&(!onlyId||a.id===onlyId));
      for(const asset of assets){
        if(controller.signal.aborted||this.project.id!==projectId||this.closed)break;
        if(!onlyId&&this.project.editorial?.detections.some(d=>d.assetSha256===asset.sha256&&d.engine===OCR_VERSION))continue;
        const bytes=await this.store.get(asset.path);if(!bytes)continue;
        let detection:import('./types').CaptionDetection;
        try{detection=await this.ocr.detect(asset,bytes,controller.signal,message=>this.status.setText(message));}
        catch(e){if(controller.signal.aborted)break;detection={assetId:asset.id,assetSha256:asset.sha256,engine:OCR_VERSION,status:'failed',message:e instanceof Error?e.message:String(e),candidates:[]};}
        if(this.project.id!==projectId||this.closed)break;
        this.edit(p=>{if(!p.editorial)return;p.editorial.detections=p.editorial.detections.filter(d=>d.assetId!==asset.id);p.editorial.detections.push(detection);},false);
      }
      if(!this.closed){this.renderInspector();await this.save();}
    }finally{this.ocrController=null;}
  }
  private async replaceFigure(id:string):Promise<void>{
    const files=await this.gateway.pickFiles({extensions:['pdf','png','jpg','jpeg','svg','webp','gif','bmp','emf'],maxFiles:1});if(!files[0])return;
    const next=cloneJournal(this.project),n=next.document.blocks.find(n=>n.id===id);if(n?.kind!=='figure')return;
    const file=files[0],hash=await digestBytes(file.bytes),sourceId=newId('source');
    const path=`sources/${hash}.${file.name.split('.').at(-1)??'bin'}`;await this.store.put(path,file.bytes);
    next.sources.push({id:sourceId,name:file.name,path,sha256:hash,role:'figures'});
    n.originalAssetId??=n.assetId;n.assetId=await addAsset(next,file.bytes,file.name,sourceId,this.store);delete n.crop;delete n.chart;
    this.edit(p=>Object.assign(p,next));await this.save();await this.scanCaptions(n.assetId);
  }
  private async cropFigure(id:string):Promise<void>{
    const n=this.project.document.blocks.find(n=>n.id===id);if(n?.kind!=='figure')return;
    const asset=this.project.assets.find(a=>a.id===n.assetId);if(!asset)throw new Error(t('원본 그림을 먼저 연결하세요.'));
    const bytes=await this.store.get(asset.path);if(!bytes)throw new Error(t('그림 파일이 없습니다.'));
    const detection=this.project.editorial?.detections.find(d=>d.assetSha256===asset.sha256);
    await cropDialog(this.app,n,asset,bytes,detection,(crop,title)=>this.edit(p=>{const item=p.document.blocks.find(b=>b.id===id);if(item?.kind!=='figure'||item.assetId!==asset.id)return;item.crop=crop;item.caption??={number:'',title:[],notes:[]};if(inlineText(item.caption.title)!==title)item.caption.title=[{text:title}];const scan=p.editorial?.detections.find(d=>d.assetId===asset.id&&d.assetSha256===asset.sha256);if(scan)scan.review=crop?'crop':'keep';}));
  }
  private compose():Promise<void>{
    if(this.compositionTask){this.composeAgain=true;return this.compositionTask;}
    this.compositionTask=this.composeLatest().finally(()=>{this.compositionTask=null;});
    return this.compositionTask;
  }
  private async composeLatest():Promise<void>{
    await this.refreshBoundSource();
    this.busy=true;const controller=this.controller=new AbortController();
    if(this.renderTimer){this.contentEl.win.clearTimeout(this.renderTimer);this.renderTimer=null;}
    try{
      do{
        this.composeAgain=false;
        if(this.renderTimer){this.contentEl.win.clearTimeout(this.renderTimer);this.renderTimer=null;}
        const prepared=cloneJournal(this.project),revision=this.project.revision,projectId=this.project.id;
        this.status.setText(t("필요한 설치 글꼴을 확인하고 있습니다."));
        if(!await resolveFonts(this.app,prepared,this.store))return;
        if(this.closed||controller.signal.aborted)return;
        if(this.project.id!==projectId||this.project.revision!==revision){this.composeAgain=true;continue;}
        if(JSON.stringify(prepared.fonts)!==JSON.stringify(this.project.fonts)||JSON.stringify(prepared.preset)!==JSON.stringify(this.project.preset))this.edit(p=>{p.fonts=prepared.fonts;p.preset=prepared.preset;},false);
        const snapshot=validateProject(this.project),key=snapshot.fonts.map(f=>f.sha256).join(",");
        if(this.fontKey!==key||!key){const fonts:Uint8Array[]=[];for(const path of new Set(snapshot.fonts.map(f=>f.path))){const bytes=await this.store.get(path);if(!bytes)throw new Error(t("등록한 글꼴 파일이 없습니다."));fonts.push(bytes);}if(controller.signal.aborted||this.closed)return;await this.engine.initialize(fonts);this.fontKey=key;}
        const result=await this.composer.compose(snapshot,this.store,controller.signal,message=>this.status.setText(message),true);
        if(this.closed||controller.signal.aborted)return;
        await this.refreshBoundSource();
        if(result.fingerprint!==await digestBytes(jsonBytes(this.project))){this.composeAgain=true;this.status.setText(t("조판 중 원고가 바뀌었습니다. 다시 조판합니다."));continue;}
        this.result=result;await this.preview?.show(result);
        if(this.closed||controller.signal.aborted)return;
        this.status.setText(uiLanguage()==='ko'?`${result.pageCount}쪽 · ${(result.elapsedMs/1000).toFixed(1)}초 · 검사 ${result.issues.length}건`:`${result.pageCount} pages · ${(result.elapsedMs/1000).toFixed(1)} s · ${result.issues.length} checks`);this.renderInspector();
      }while(this.composeAgain&&!this.closed&&!controller.signal.aborted);
    }finally{this.busy=false;this.controller=null;this.composeAgain=false;}
  }
  private async exportIdml():Promise<void>{
    await this.refreshBoundSource();
    if(!this.result?.editableSource||this.result.fingerprint!==await digestBytes(jsonBytes(this.project)))await this.compose();
    const result=this.result,revision=this.project.revision;
    if(!result?.editableSource||result.fingerprint!==await digestBytes(jsonBytes(this.project)))throw new Error(t("현재 원고의 조판을 먼저 완료하세요."));
    const snapshot=await journalEditableSnapshot(result,this.store),output=await exportIdml(snapshot,result.pdf);
    if(this.closed||this.project.revision!==revision||this.result!==result)throw new Error(t("내보내는 동안 원고가 변경됐습니다. 다시 내보내세요."));
    await this.save();await this.assertSourceFresh();await this.gateway.saveFile(output.package,this.filename()+"_edit.zip");
    this.status.setText(t("IDML 편집 패키지 저장 완료 · 압축을 풀고 Affinity에서 .idml을 여세요."));
  }
  private async exportAf():Promise<void>{
    await this.refreshBoundSource();
    if(!Platform.isDesktopApp)throw new Error(t("AF 내보내기는 데스크톱 앱에서 사용할 수 있습니다."));
    if(this.afController){new Notice(t("AF 내보내기가 진행 중입니다. 상단 취소 버튼으로 중단할 수 있습니다."));return;}
    const controller=this.afController=new AbortController();
    try{
      const options=await afDialog(this.app,controller.signal);if(!options||this.closed||controller.signal.aborted)return;
      if(!this.result?.editableSource||this.result.fingerprint!==await digestBytes(jsonBytes(this.project)))await this.compose();
      if(this.closed||controller.signal.aborted)return;
      const result=this.result,project=cloneJournal(this.project),store=this.store;
      if(!result?.editableSource||result.fingerprint!==await digestBytes(jsonBytes(project)))throw new Error(t("현재 원고의 조판을 먼저 완료하세요."));
      const current=():void=>{
        if(this.closed||controller.signal.aborted)throw new DOMException(t("AF 내보내기를 취소했습니다."),"AbortError");
        if(this.project.id!==project.id||this.project.revision!==project.revision||this.store!==store||this.result!==result)throw new Error(t("내보내는 동안 원고가 변경됐습니다. 다시 내보내세요."));
      };
      const snapshot=await journalEditableSnapshot(result,store);current();
      const {journalAfExport}=await import("./affinityExport");
      // Use the composer's actual normal-page columns, including frame overrides.
      const page=Math.min(2,result.pageCount);
      const columns=result.boxes.filter(b=>b.kind==="text-frame"&&b.page===page).sort((a,b)=>a.x-b.x).map(({x,y,width,height})=>({x,y,width,height}));
      const output=await journalAfExport(project,store,snapshot,result.pdf,{...options,columns,signal:controller.signal,progress:message=>{current();this.status.setText(message);}});
      current();await this.save();current();
      const file=this.filename()+"_edit"+(options.format==="af"?".af":".af.zip");
      await this.assertSourceFresh();current();
      const saved=await this.gateway.saveFile(options.format==="af"?output.af:output.package,file);
      if(this.closed)return;
      this.status.setText(saved.cancelled?t("AF 파일 저장을 취소했습니다."):saved.method==="download"?t("AF 다운로드를 요청했습니다. 다운로드 폴더를 확인하세요."):t("AF 편집 파일 저장 완료 · Affinity에서 열어 최종 줄바꿈과 넘치는 본문을 확인하세요."));
    }catch(e){if(controller.signal.aborted){if(!this.closed)this.status.setText(t("AF 내보내기를 취소했습니다."));}else throw e;}
    finally{if(this.afController===controller)this.afController=null;}
  }
  private async exportPdf(final:boolean):Promise<void>{
    await this.refreshBoundSource();
    if(final&&!this.project.document.title.trim()){this.panel='article';this.renderInspector();throw new Error('최종 PDF에는 제목이 필요합니다. 원고 정보에서 입력하세요. 검토용 PDF에는 누락 표시를 남깁니다.');}
    if(!this.result||this.result.fingerprint!==await digestBytes(jsonBytes(this.project)))await this.compose();
    if(!this.result||this.result.fingerprint!==await digestBytes(jsonBytes(this.project)))throw new Error(t("현재 원고의 조판을 먼저 완료하세요."));
    if(final&&academicChecks(this.project)&&!publicationReviewed(this.project,this.result.pageCount)){this.panel="publication";this.renderInspector();throw new Error("미리보기에서 발행정보를 확인하고 확정하세요. 값이나 최종 쪽수가 바뀌면 다시 확인합니다.");}
    const issues=[...this.project.issues,...this.result.issues];
    if(final&&(this.project.changes.some(c=>c.decision==="pending")||this.project.editorial?.changes.some(c=>c.status==='pending')||issues.some(i=>i.severity==="error"||(i.severity==="warning"&&!this.project.acknowledgements[i.id])))){this.panel="issues";this.renderInspector();throw new Error("최종 PDF를 저장하기 전에 남은 변경 기록과 검사 항목을 확인하세요. 검토용 PDF는 저장할 수 있습니다.");}
    await this.save();await this.assertSourceFresh();await this.gateway.saveFile(this.result.pdf,this.filename()+(final?"":"_review")+".pdf");
  }
  private applyOverride(o:LayoutOverride):void{this.edit(p=>{p.overrides=p.overrides.filter(v=>v.id!==o.id);p.overrides.push(o);});}
  private renderInspector():void{
    if(this.panelSelect)this.panelSelect.value=this.panel;
    if(!this.inspector)return;const host=this.inspector;host.empty();const p=this.project,d=p.document;
    if(p.sources.length||d.blocks.length){
      const missingTitle=!d.title.trim(),missingAuthor=academicChecks(p)&&!d.authors.some(a=>a.corresponding&&a.name.trim()&&a.email?.trim());
      const figures=d.blocks.filter(n=>n.kind==='figure'&&!n.chart&&!p.assets.some(a=>a.id===n.assetId));
      if(missingTitle||missingAuthor||figures.length){
        const card=host.createDiv({cls:'aaeu-journal-card'});card.createEl('strong',{text:t('출력 전에 확인할 원고 정보')});
        if(missingTitle){card.createEl('p',{text:t('제목이 비어 있습니다. 별도 제목·저자 파일이나 투고 시스템에서 확인해 입력하세요.')});if(this.panel!=='article')action(card,t('제목 입력'),()=>{this.panel='article';this.renderInspector();});}
        if(missingAuthor){card.createEl('p',{text:t('교신저자 이름·이메일이 없습니다. 입력하면 정해진 서식으로 자동 배치됩니다.')});if(this.panel!=='publication')action(card,t('교신저자 입력'),()=>{this.panel='publication';this.renderInspector();});}
        for(const f of figures)if(f.kind==='figure')action(card,`${f.caption?.number?'Figure '+f.caption.number:t('그림')} 원본 연결`,()=>{this.selected=f.id;this.panel='objects';this.renderInspector();void this.run(()=>this.replaceFigure(f.id));});
        card.createEl('p',{text:t('검토용 PDF와 AF·IDML에는 누락 표시와 그림 교체 자리를 남깁니다.')});
      }
    }
    if(p.markdown&&!['issues','preset'].includes(this.panel)){this.sourceInspector(host);return;}
    if(this.panel==="publication")this.publicationPanel(host);
    else if(this.panel==='editorial')editorialPanel(host,p,(fn,refresh)=>this.edit(fn,refresh),id=>this.selectNode(id));
    else if(this.panel==='endMatter')endMatterPanel(host,p,(fn,refresh)=>this.edit(fn,refresh),id=>this.selectNode(id));
    else if(this.panel==="article"){
      action(host,t("AOP·권호·날짜·판권 빠른 확인"),()=>{this.panel="publication";this.renderInspector();});
      const fields:Record<string,string>={title:t("제목"),runningTitle:t("머리말 축약 제목"),runningAuthors:t("머리말 저자 표기"),doi:"DOI",volume:t("권"),issue:t("호"),year:t("연도"),received:t("접수일"),revised:t("수정일"),accepted:t("승인일")};
      for(const [key,label]of Object.entries(fields))field(host,label,typeof d[key as keyof typeof d]==="string"?d[key as keyof typeof d] as string:"",v=>this.edit(p=>{(p.document as unknown as Record<string,unknown>)[key]=v;},false));
      field(host,t("첫 쪽 번호"),String(d.firstPage),v=>this.edit(p=>{p.document.firstPage=Math.max(1,Math.floor(Number(v)||1));},false));
      field(host,"저자 · 한 줄에 이름 | 소속 번호 | 이메일",d.authors.map(a=>[a.name,a.affiliations.join(","),a.email??""].join(" | ")).join("\n"),v=>this.edit(p=>{p.document.authors=v.split("\n").filter(Boolean).map((line,index)=>{const [name,aff,email]=line.split("|").map(s=>s.trim());const old=p.document.authors.find(a=>a.name===name)??p.document.authors[index];return {...old,name,affiliations:aff?.split(",")??[],email,corresponding:!!email};});}),true);
      for(const [i,a]of d.authors.entries())if(a.corresponding)field(host,`${a.name} 교신저자 주소 · 줄바꿈 유지`,a.address??"",v=>this.edit(p=>{p.document.authors[i].address=v;},false),true);
      field(host,"소속 · 한 줄에 하나",d.affiliations.join("\n"),v=>this.edit(p=>{p.document.affiliations=v.split("\n");},false),true);
      field(host,"소속 위첨자 · 한 줄에 하나 (예: 1,2)",d.affiliations.map((_,i)=>d.affiliationMarkers?.[i]??String(i+1)).join("\n"),v=>this.edit(p=>{p.document.affiliationMarkers=v.split("\n");},false),true);
      field(host,t("초록"),d.abstract.map(b=>inlineText(b.content)).join("\n"),v=>this.edit(p=>{p.document.abstract=v.split("\n").map(text=>({id:newId("abstract"),kind:"paragraph",role:"abstract",content:[{text}]}));},false),true);
      field(host,"키워드 · 세미콜론 구분",d.keywords.join("; "),v=>this.edit(p=>{p.document.keywords=v.split(";").map(s=>s.trim()).filter(Boolean);},false));
      host.createEl("p",{text:`원본 ${p.sources.length}개 · 그림 ${p.assets.length}개 · 변경 기록 ${p.changes.length}개`});
      if(d.importedMetadata?.length){
        const details=host.createEl("details");details.createEl("summary",{text:"원고 정보 추출 근거 · 원문 보존"});
        const labels={title:t("제목"),runningTitle:t("머리말 제목"),authors:t("저자"),affiliations:t("소속"),correspondence:t("교신저자"),submission:t("투고 정보"),keywords:t('키워드'),abstractLabel:t('초록 표제')};
        for(const item of d.importedMetadata){
          const card=details.createDiv({cls:"aaeu-journal-card"});card.createEl("strong",{text:labels[item.field]+" · "+(p.sources.find(s=>s.id===item.sourceId)?.name??t("직접 편집"))});
          for(const block of item.blocks)card.createEl("p",{text:inlineText(block.content)});
        }
      }
    }else if(this.panel==="references"){
      if(!referenceChecks(p))host.createEl("p",{text:"참고문헌 검사가 꺼져 있습니다. 내용과 출력 서식은 유지되며, 온라인 조회는 아래 버튼으로 실행합니다."});
      action(host,t("참고문헌 추가"),()=>this.run(async()=>{const r=await referenceDialog(this.app,emptyReference());if(r)this.edit(p=>p.references.push(r));}));
      action(host,t("DOI·서지정보 조회"),()=>this.run(async()=>{
        const q=await textDialog(this.app,t("참고문헌 조회"),t("Crossref에 보낼 DOI 또는 서지정보"),"");if(!q)return;
        const records=await lookupCrossref(q,async url=>(await requestUrl({url})).json as unknown);
        const modal=new Modal(this.app);modal.titleEl.setText(t("서지정보 후보"));
        for(const r of records)action(modal.contentEl,`${r.title} (${r.year??t("연도 없음")})`,()=>this.run(async()=>{const confirmed=await referenceDialog(this.app,r);if(confirmed){this.edit(p=>p.references.push(confirmed));modal.close();}}));
        if(!records.length)modal.contentEl.createEl("p",{text:t("일치하는 후보가 없습니다.")});modal.open();
      }));
      for(const ref of p.references){const row=host.createDiv({cls:"aaeu-journal-card"});row.dataset.referenceId=ref.id;row.createEl("p",{text:(ref.confirmed?"✓ ":t("미확정 · "))+(ref.title||ref.raw||t("제목 없음"))});action(row,t("편집"),()=>this.run(async()=>{const r=await referenceDialog(this.app,ref);if(r)this.edit(p=>{p.references=p.references.map(v=>v.id===r.id?r:v);});}));
        field(row,'저자/단체명 정렬 키',ref.sort?.authorKey??inferredAuthorKey(ref)??'',v=>this.edit(p=>{const r=p.references.find(r=>r.id===ref.id)!;r.sort={...r.sort,authorKey:v,confirmed:!!v.trim()};},false));
        field(row,'동일 저자·연도의 제목 정렬 키',ref.sort?.titleKey??ref.title,v=>this.edit(p=>{const r=p.references.find(r=>r.id===ref.id)!;r.sort={authorKey:r.sort?.authorKey??inferredAuthorKey(r)??'',confirmed:r.sort?.confirmed??false,titleKey:v};},false));
      }
    }else if(this.panel==="changes"){
      host.createEl("p",{text:"원고 창의 색 표시에는 변경 전·후 텍스트가 모두 보입니다. PDF는 현재 결정에 따른 최종 보기를 사용합니다."});
      for(const [decision,label]of [["accepted",t("모두 수락")],["rejected",t("모두 거절")]] as const)action(host,label,()=>this.edit(p=>setChangeDecision(p,p.changes.map(c=>c.id),decision)));
      for(const c of p.changes){const row=host.createDiv({cls:"aaeu-journal-card"});row.createEl("p",{text:`${c.kind} · ${c.author} · ${c.date} · ${c.decision}`});
        const runs=p.document.blocks.flatMap(n=>n.kind==="paragraph"||n.kind==="heading"?n.content:n.kind==="table"?n.rows.flatMap(r=>r.cells.flatMap(c=>c.blocks.flatMap(b=>b.content))):[]).filter(r=>r.changeIds?.includes(c.id));row.createEl("p",{text:inlineText(runs).slice(0,300)||c.detail||""});
        if(c.kind!=="unsupported")for(const [decision,label]of [["accepted",t("수락")],["rejected",t("거절")],["pending",t("보류")]] as const)action(row,label,()=>this.edit(p=>setChangeDecision(p,[c.id],decision)));
      }
    }else if(this.panel==="preset"){
      host.createEl("h3",{text:p.preset.template?.name??t("기존 프로젝트 설정")});
      host.createEl("p",{text:t("조판 규칙은 유지하고 로고·색상·문구·글꼴만 바꿉니다. 기존 원고의 세부 값은 보존됩니다.")});
      action(host,t("템플릿 선택·만들기"),()=>this.openTemplates());
      host.createEl("p",{text:`저장된 글꼴: ${[...new Set(p.fonts.map(f=>f.family))].join(", ")||t("조판 시 자동으로 가져옵니다.")}`});
    }else if(this.panel==="objects")this.objects(host);
    else {
      const issues=[...p.issues,...(this.result?.issues??editorialIssues(p))];
      action(host,t('원고 정리와 재가져오기 검토'),()=>{this.panel='editorial';this.renderInspector();});
      if(this.result?.numbering?.length){const numbers=host.createEl('details');numbers.createEl('summary',{text:t('원고 번호 → 출력 번호')});for(const n of this.result.numbering)action(numbers,`${n.kind} ${n.original||t('없음')} → ${n.number} · ${n.page}쪽`,()=>this.selectNode(n.id));}
      host.createEl("p",{text:`검사 ${issues.length}건 · 미결정 변경 ${p.changes.filter(c=>c.decision==="pending").length}건`});
      if(this.result?.coverage)host.createEl('p',{text:`출력 내용 대조: ${this.result.coverage.complete?t('모두 대응'):t('미해결 있음')} · ${this.result.coverage.entries.length}개 항목`});
      const ledger=host.createEl('details');ledger.createEl('summary',{text:`자동 보정 기록 ${this.result?.adjustments?.length??0}건`});
      for(const a of this.result?.adjustments??[]){const row=ledger.createDiv({cls:'aaeu-journal-card'});row.createEl('p',{text:`${a.rule}: ${a.before} → ${a.after} · ${a.reason}`});action(row,t('항목 선택'),()=>{this.selected=a.nodeId;this.panel='objects';this.renderInspector();});action(row,'이 항목 자동 보정 해제',()=>this.edit(p=>{const q=compositionQuality(p);p.preset.compositionQuality={...q,disabledNodes:[...new Set([...q.disabledNodes,a.nodeId])]};}));}
      for(const i of issues){const row=host.createDiv({cls:"aaeu-journal-card"});row.createEl("p",{text:`${i.severity} · ${i.message}`});
        if(i.nodeId)action(row,t("항목 선택"),()=>this.selectNode(i.nodeId!));
        if(i.severity==="warning")action(row,p.acknowledgements[i.id]?t("확인 사유 수정"):t("확인 기록"),()=>this.run(async()=>{const reason=await textDialog(this.app,t("검사 확인"),t("원본 대조 결과 또는 수용 사유"),p.acknowledgements[i.id]??"");if(reason?.trim())this.edit(p=>{p.acknowledgements[i.id]=reason.trim();});}));
      }
    }
  }
  private publicationPanel(host:HTMLElement):void{
    const d=this.project.document,pages=this.result?.pageCount,m=resolvedMaster(this.project.preset);
    host.createEl("p",{text:"첫 페이지의 영역을 클릭해 값을 수정하세요. 글꼴·색·위치는 저널 프리셋이 적용합니다."});
    host.createEl("p",{text:!academicChecks(this.project)?t("일반 간행물 · 발행정보 확인은 선택입니다."):pages&&publicationReviewed(this.project,pages)?t("✓ 현재 발행정보 확인 완료"):t("발행정보 확인 필요 · 수정 후 미리보기에서 확인하세요."),cls:"aaeu-journal-publication-status"});
    const section=(id:string,title:string):HTMLElement=>{const el=host.createDiv({cls:"aaeu-journal-card"});el.dataset.publicationZone=id;el.createEl("h3",{text:title});return el;};
    const issue=section("issue",t("발행 단계와 쪽수"));
    choose(issue,t("발행 단계"),publicationMode(d),{aop:t("AOP · 권·호·쪽수 숨김"),issue:t("권호 확정본")},v=>this.edit(p=>{p.document.publication={...p.document.publication,mode:v as "aop"|"issue"};}));
    for(const [key,label]of [["year",t("발행 연도")],["volume",t("권")],["issue",t("호")],["doi","DOI · doi.org 주소도 입력 가능"]] as const)field(issue,label,d[key],v=>this.edit(p=>{p.document[key]=key==="doi"?canonicalDoi(v):v.trim();},false));
    field(issue,t("시작 쪽수"),String(d.firstPage),v=>{const n=Number(v);if(Number.isInteger(n)&&n>0&&n<=100000)this.edit(p=>{p.document.firstPage=n;},false);});
    issue.createEl("p",{text:pages?`최근 출력 ${pages}쪽 · 확정본 ${d.firstPage}–${d.firstPage+pages-1}쪽 · 다음 논문 시작 ${d.firstPage+pages}쪽`:"조판 후 끝 쪽수와 다음 논문의 시작 쪽수를 자동 계산합니다."});
    if(publicationMode(d)==="aop")issue.createEl("p",{text:"입력한 권·호·시작 쪽수는 보관되며 AOP PDF에는 표시되지 않습니다."});
    const side=section("correspondence",t("심사 날짜와 교신저자"));
    for(const [key,label]of [["received","Received · 접수일"],["revised","Revised · 수정일"],["accepted","Accepted · 승인일"]] as const)field(side,label,d[key],v=>this.edit(p=>{p.document[key]=v;},false));
    for(const [i,a]of d.authors.entries()){
      const card=side.createDiv({cls:"aaeu-journal-card"});
      choose(card,`${a.name||"저자 "+(i+1)} 교신저자`,a.corresponding?"yes":"no",{yes:t("교신저자"),no:"일반 저자"},v=>this.edit(p=>{p.document.authors[i].corresponding=v==="yes";}));
      if(a.corresponding)for(const [key,label]of [["name",t("이름")],["email",t("이메일")],["address",t("주소")]] as const)field(card,`교신저자 ${i+1} ${label}`,a[key]??"",v=>this.edit(p=>{p.document.authors[i][key]=v;},false),key==="address");
    }
    action(side,t("교신저자 추가"),()=>this.edit(p=>p.document.authors.push({name:"",affiliations:[],corresponding:true,email:"",address:""})));
    const brand=section("brand",t("로고와 Crossmark"));
    action(brand,t("템플릿에서 로고·마크 변경"),()=>this.openTemplates());
    const copyright=section("copyright",t("판권과 라이선스"));
    field(copyright,"판권 연도 · 비우면 발행 연도 사용",d.publication?.copyrightYear??"",v=>this.edit(p=>{p.document.publication={...p.document.publication,mode:publicationMode(p.document),copyrightYear:v.trim()};},false));
    copyright.createEl("p",{text:this.project.preset.appearance?.copyrightText!==undefined?"표시: "+(resolveTemplateText(this.project.preset.appearance.copyrightText,this.project)||t("숨김")):`표시: Copyright © ${copyrightYear(d)||t("연도 미입력")} ${m.copyrightOwner}`});
    action(host,t("로고·색상·문구 템플릿"),()=>this.openTemplates());
    const missing=academicChecks(this.project)?publicationMissing(d):[];if(missing.length)host.createEl("p",{text:t("미입력: ")+missing.join(", ")});
    action(host,t("미리보기 갱신"),()=>this.run(()=>this.compose()));
    action(host,t("현재 발행정보 확인·확정"),()=>this.run(async()=>{
      if(!this.result||this.result.fingerprint!==await digestBytes(jsonBytes(this.project))){await this.compose();this.status.setText("미리보기를 갱신했습니다. 표시된 발행정보를 확인한 뒤 다시 확정하세요.");return;}
      if(!this.result||this.result.fingerprint!==await digestBytes(jsonBytes(this.project)))throw new Error(t("최신 미리보기를 생성한 뒤 확인하세요."));
      const snapshot=publicationSnapshot(this.project,this.result.pageCount);
      this.edit(p=>{p.document.publication={...p.document.publication,mode:publicationMode(p.document),review:{snapshot,at:new Date().toISOString()}};},false);
      this.renderInspector();await this.save();
    }));
  }
  private objects(host:HTMLElement):void{
    action(host,"텍스트 데이터로 표 만들기",()=>this.run(()=>this.addData(false)));
    action(host,"데이터로 차트 만들기",()=>this.run(()=>this.addData(true)));
    const choices:Record<string,string>={};for(const n of this.project.document.blocks)choices[n.id]=n.kind+" · "+(n.kind==="paragraph"||n.kind==="heading"?inlineText(n.content).slice(0,45):(n.kind==="table"||n.kind==="figure")?inlineText(n.caption?.title??[]).slice(0,45):n.id);
    for(const b of this.result?.boxes.filter(b=>b.kind==="text-frame")??[])choices[b.nodeId]=`${b.page}쪽 텍스트 프레임 ${b.nodeId.endsWith(":0")?t("왼쪽"):t("오른쪽")}`;
    choose(host,t("항목"),this.selected,choices,v=>{this.selected=v;this.renderInspector();});
    const node=this.project.document.blocks.find(n=>n.id===this.selected);
    if(node){
      if(node.kind==='anchor'){
        host.createEl('p',{text:`원문 삽입 지점: ${inlineText(node.source.content)}`});
        const targets=Object.fromEntries(this.project.document.blocks.filter(n=>n.kind===node.targetKind).map(n=>[n.id,`${n.kind} ${(n.kind==='figure'||n.kind==='table')?n.caption?.number??'':''} · ${(n.kind==='figure'||n.kind==='table')?inlineText(n.caption?.title??[]):''}`]));
        choose(host,t('배치할 개체'),node.targetIds.length===1?node.targetIds[0]:'',{'':t('대상 선택'),...targets},v=>this.edit(p=>{const a=p.document.blocks.find(n=>n.id===node.id);if(a?.kind==='anchor')a.targetIds=v?[v]:[];}));
      }
      const q=compositionQuality(this.project);choose(host,'이 항목 자동 보정',q.disabledNodes.includes(node.id)?'no':'yes',{yes:t('프리셋 기준 사용'),no:t('사용 안 함')},v=>this.edit(p=>{const q=compositionQuality(p);p.preset.compositionQuality={...q,disabledNodes:v==='yes'?q.disabledNodes.filter(id=>id!==node.id):[...new Set([...q.disabledNodes,node.id])]};}));
      action(host,t("앞으로 이동"),()=>this.moveNode(-1));action(host,t("뒤로 이동"),()=>this.moveNode(1));
      action(host,t("본문에서 제거"),()=>this.edit(p=>{p.document.blocks=p.document.blocks.filter(n=>n.id!==this.selected);}));
      if(node.kind==="paragraph"||node.kind==="heading"){
        for(const mention of objectMentions(this.project).filter(m=>m.nodeId===node.id)){
          const choices=Object.fromEntries(this.project.document.blocks.filter(n=>n.kind===mention.kind).map(n=>[n.id,`${(n.kind==='table'||n.kind==='figure')?n.caption?.number??'':''} · ${(n.kind==='table'||n.kind==='figure')?inlineText(n.caption?.title??[]):n.id}`]));
          const selected=mention.candidates.map(ids=>ids.length===1?ids[0]:'');
          for(const [i,number]of mention.numbers.entries())choose(host,`${mention.text}: ${number} 대상`,selected[i],{'':t('대상 선택'),...choices},v=>{selected[i]=v;});
          action(host,'이 본문 참조 연결',()=>{if(selected.every(Boolean))this.edit(p=>bindMention(p,mention,selected));});
        }
        choose(host,"용도",node.role??"body",{body:t("본문"),reference:"원문 참고문헌",quote:"인용",note:"주"},v=>this.edit(p=>{const n=p.document.blocks.find(n=>n.id===node.id) as Paragraph;n.role=v as Paragraph["role"];}));
        action(host,"제목으로 지정하고 본문에서 제거",()=>this.edit(p=>{p.document.title=inlineText(node.content);p.document.importedMetadata??=[];p.document.importedMetadata.push({field:"title",sourceId:node.origin?.sourceId??"",blocks:[cloneJournal(node)],rule:"editor-selection"});p.document.blocks=p.document.blocks.filter(n=>n.id!==node.id);}));
      }
      if(node.kind==="figure"||node.kind==="table"){
        if(node.kind==='figure'){
          if(node.sourceObject)host.createEl('p',{text:node.sourceObject.description+' · '+node.sourceObject.part});
          action(host,node.assetId?t('원본 그림 교체'):t('원본 그림 연결'),()=>this.run(()=>this.replaceFigure(node.id)));
          if(node.assetId){
            action(host,t('내장 캡션·크롭 확인'),()=>this.run(()=>this.cropFigure(node.id)));
            action(host,t('이미지 캡션 다시 검사'),()=>this.run(()=>this.scanCaptions(node.assetId)));
            const detection=this.project.editorial?.detections.find(d=>d.assetId===node.assetId);if(detection)host.createEl('p',{text:detection.status==='failed'?`OCR 확인 필요: ${detection.message}`:`내장 캡션 후보 ${detection.candidates.length}개${node.crop?.confirmed?' · 크롭 적용됨':''}`});
          }
        }
        if(node.kind==="table"&&node.normalization){
          host.createEl("p",{text:node.normalization.confirmed?"통계표 행·열 대응 확인 완료":"한 셀의 여러 통계값을 개별 행으로 정리했습니다. 아래 원본과 비교해 행·열 대응을 확인하세요."});
          const details=host.createEl("details");details.createEl("summary",{text:"정리 전 셀과 문단 보기"});
          details.createEl("pre",{text:node.normalization.sourceRows.map(r=>r.cells.map(c=>c.blocks.map(b=>inlineText(b.content)).join(" / ")).join(" | ")).join("\n")});
          action(host,"표 행·열 대응 확인·확정",()=>this.edit(p=>{const n=p.document.blocks.find(b=>b.id===node.id);if(n?.kind==="table"&&n.normalization)n.normalization.confirmed=true;}));
          action(host,"정리 전 표 구조로 복원",()=>this.edit(p=>{const n=p.document.blocks.find(b=>b.id===node.id);if(n?.kind==="table"&&n.normalization){n.rows=cloneJournal(n.normalization.sourceRows);n.columnWeights=[...n.normalization.sourceColumnWeights];delete n.normalization;}}));
        }
        if(node.kind==='table'&&embeddedTableCaption(node)&&node.caption?.number){
          host.createEl('p',{text:'표 안팎의 제목 중 사용할 제목을 선택하세요. 중복 제목 행만 제거합니다.'});
          host.createEl('pre',{text:'표 안: '+inlineText(embeddedTableCaption(node)!.content)+'\n표 밖: '+inlineText(node.caption.title)});
          action(host,'표 안 제목 사용',()=>this.edit(p=>resolveEmbeddedTableCaption(p,node.id,'inside')));
          action(host,'표 밖 제목 사용',()=>this.edit(p=>resolveEmbeddedTableCaption(p,node.id,'outside')));
        }
        choose(host,t("폭"),node.width,{auto:t("자동"),column:t("한 단"),full:t("본문 전체")},v=>this.edit(p=>{const n=p.document.blocks.find(n=>n.id===node.id) as typeof node;n.width=v as typeof node.width;}));
        const setCaption=(key:"number"|"title",value:string):void=>this.edit(p=>{const n=p.document.blocks.find(n=>n.id===node.id) as typeof node;n.caption??={number:"",title:[],notes:[]};if(key==="title")n.caption.title=[{text:value}];else n.caption.number=value;},false);
        field(host,t("번호"),node.caption?.number??"",v=>setCaption("number",v));field(host,t("캡션"),inlineText(node.caption?.title??[]),v=>setCaption("title",v),true);
        field(host,"주",node.caption?.notes.map(b=>inlineText(b.content)).join("\n")??"",v=>this.edit(p=>{const n=p.document.blocks.find(n=>n.id===node.id) as typeof node;n.caption??={number:"",title:[],notes:[]};n.caption.notes=v.split("\n").filter(Boolean).map(text=>({id:newId("note"),kind:"paragraph",role:"note",content:[{text}]}));},false),true);
      }
    }
    const box=this.result?.boxes.find(b=>b.nodeId===this.selected),pin=this.project.overrides.find(o=>o.id===this.selected);
    if(box&&["figure","table","text-frame"].includes(box.kind)){
      const values={id:box.nodeId,page:pin?.page??box.page,x:pin?.x??box.x,y:pin?.y??box.y,width:pin?.width??box.width,height:pin?.height??box.height,locked:true};
      for(const [key,label]of Object.entries({page:t("쪽"),x:t("왼쪽 위치(pt)"),y:t("위쪽 위치(pt)"),width:t("폭(pt)"),height:t("높이(pt)")}))field(host,label,String(values[key as keyof typeof values]),v=>{const n=Number(v);if(Number.isFinite(n))(values as unknown as Record<string,unknown>)[key]=n;});
      action(host,t("위치 고정"),()=>this.applyOverride(values));action(host,t("자동 배치로 복원"),()=>this.edit(p=>{p.overrides=p.overrides.filter(o=>o.id!==this.selected);}));
    }
  }
  private moveNode(delta:number):void{this.edit(p=>{const index=p.document.blocks.findIndex(n=>n.id===this.selected),target=index+delta;if(index>=0&&target>=0&&target<p.document.blocks.length){const [n]=p.document.blocks.splice(index,1);p.document.blocks.splice(target,0,n);}});}
  private async addData(chart:boolean):Promise<void>{
    const raw=await textDialog(this.app,chart?"차트 데이터":"표 데이터","첫 행은 열 제목입니다. 엑셀의 셀을 복사해 탭으로 구분된 텍스트를 붙여 넣으세요.","",true);if(!raw)return;
    const rows=raw.trim().split(/\r?\n/).map(line=>line.split("\t"));if(rows.length<2)throw new Error("머리행과 데이터 행이 필요합니다.");
    const id=newId(chart?"figure":"table");let node:JournalNode;
    if(chart){
      const series=rows[0].slice(1).map((name,c)=>({name,values:rows.slice(1).map(r=>Number(r[c+1]))}));
      if(!series.length||rows.slice(1).some(r=>r.length!==rows[0].length||r.slice(1).some(v=>!v.trim()||!Number.isFinite(Number(v)))))throw new Error("첫 열은 분류명, 나머지 열은 빈칸 없는 숫자여야 합니다.");
      node={id,kind:"figure",assetId:"",width:"full",chart:{type:"bar",categories:rows.slice(1).map(r=>r[0]),series},caption:{number:"",title:[{text:""}],notes:[]}};
    }else node={id,kind:"table",width:"auto",columnWeights:rows[0].map(()=>1),rows:rows.map((r,ri)=>({id:newId("row"),header:ri===0,cells:r.map(text=>({id:newId("cell"),colspan:1,rowspan:1,header:ri===0,blocks:[{id:newId("p"),kind:"paragraph",content:[{text}]}]}))}))};
    this.edit(p=>p.document.blocks.push(node));this.selected=id;this.renderInspector();
  }
  async onClose():Promise<void>{this.closed=true;if(this.saveTimer)this.contentEl.win.clearTimeout(this.saveTimer);if(this.renderTimer)this.contentEl.win.clearTimeout(this.renderTimer);this.controller?.abort();this.afController?.abort();this.ocrController?.abort();this.ocr.cancel();this.engine.dispose();this.editor?.destroy();this.editor=null;this.editorKey="";this.preview?.destroy();if(this.dirty)await this.run(()=>this.save());}
}
