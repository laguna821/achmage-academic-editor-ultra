import {Plugin, MarkdownView, Notice} from 'obsidian';
import {createFileGateway} from './io/fileGateway';
import {JournalView,JOURNAL_VIEW} from './journal/JournalView';

/** Commands, storage and styles have their own namespace. No HanMark runtime dependency. */
export default class AcademicEditorUltra extends Plugin {
  async onload():Promise<void>{
    const gateway=createFileGateway(this.app,this);
    const source=()=>{const view=this.app.workspace.getActiveViewOfType(MarkdownView)??this.app.workspace.getLeavesOfType('markdown').map(l=>l.view).find((v):v is MarkdownView=>v instanceof MarkdownView);return view?.file?{file:view.file,text:view.editor.getValue()}:null;};
    this.registerView(JOURNAL_VIEW,leaf=>new JournalView(leaf,gateway,source));
    const open=async():Promise<JournalView>=>{const leaf=this.app.workspace.getLeavesOfType(JOURNAL_VIEW)[0]??this.app.workspace.getLeaf('tab');await leaf.setViewState({type:JOURNAL_VIEW,active:true});await this.app.workspace.revealLeaf(leaf);return leaf.view as JournalView;};
    const run=(fn:()=>Promise<unknown>):void=>{void fn().catch(e=>new Notice(e instanceof Error?e.message:String(e),8000));};
    this.addRibbonIcon('notebook-pen','Academic Editor Ultra',()=>run(open));
    this.addCommand({id:'open-journal-editor',name:'저널 편집 열기',callback:()=>run(open)});
    this.addCommand({id:'new-journal-markdown',name:'저널 Markdown 원고 만들기',callback:()=>run(async()=>{await (await open()).createMarkdownManuscript();})});
    this.addCommand({id:'markdown-to-journal',name:'현재 Markdown 원문으로 저널 시작',checkCallback:checking=>{const current=source();if(!current)return false;if(!checking)run(async()=>{await (await open()).importMarkdownNote(current.file,current.text);});return true;}});
    this.addCommand({id:'migrate-hanmark-journals',name:'HanMark 저널 프로젝트 복사 가져오기',callback:()=>run(async()=>{await (await open()).migrateHanmark();})});
    this.registerEvent(this.app.workspace.on('active-leaf-change',()=>{for(const l of this.app.workspace.getLeavesOfType(JOURNAL_VIEW))if(l.view instanceof JournalView)l.view.refreshStart();}));
  }
}
