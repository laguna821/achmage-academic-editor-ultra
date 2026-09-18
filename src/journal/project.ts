import { cloneJournal, newId, type JournalProject, type JournalPreset } from "./types";
import { HNMR_MASTER, resolvedMaster } from "./master";
import {QUALITY_DEFAULTS} from './quality';
import {editorialDefaults,endMatterDefaults} from './editorial';
import {validateAppearance} from './appearance';

export const HNMR_PRESET: JournalPreset = {
  schemaVersion: 1, id: "academic-unified-v1", name: "Academic composition",
  page: { widthMm: 182, heightMm: 257, marginLeftMm: 20, marginRightMm: 20, topMm: 28, bottomMm: 20, gutterMm: 4 },
  body: { font: "Times New Roman", sizePt: 10, leadingPt: 12, indentMm: 2.5, language: "en", trackingEm: 0 },
  title: { font: "Calibri", sizePt: 15 }, abstract: { font: "Garamond", sizePt: 8.3, leadingPt: 9.13, fill: "#f0f1f1" },
  references: { sizePt: 9, leadingPt: 11, hangingMm: 10 },
  table: { sizePt: 8.5, leadingPt: 11, minSizePt: 8, paddingMm: 1.5, outerRulePt: 0.4, innerRulePt: 0.4, ruleColor:"#000000",ruleMode:"apa" },
  caption: { sizePt: 9, leadingPt: 11 }, keyColor: "#00663e", inkColor: "#231916", gapMm: 4,
  photoDpi: 300, lineDpi: 600, sectionNewPage: false,master:cloneJournal(HNMR_MASTER),compositionQuality:cloneJournal(QUALITY_DEFAULTS)
};

export function createJournalProject(): JournalProject {
  const now = new Date().toISOString();
  return { schemaVersion: 2, id: newId("journal"), revision: 0, created: now, modified: now, editorial:editorialDefaults(),
    document: { title: "", runningTitle: "", authors: [], affiliations: [], abstract: [], keywords: [], blocks: [], doi: "", volume: "", issue: "", year: "", firstPage: 1, received: "", revised: "", accepted: "",endMatter:endMatterDefaults() },
    sources: [], assets: [], fonts: [], references: [], changes: [], preset: cloneJournal(HNMR_PRESET), overrides: [], issues: [], styleMappings: {}, acknowledgements: {} };
}

/** Undo is one journal-wide transaction log, including text, revisions and layout. */
export class JournalHistory {
  private undoStack: JournalProject[] = [];
  private redoStack: JournalProject[] = [];
  constructor(public current: JournalProject, private readonly limit = 80) {}
  change(edit: (project: JournalProject) => void): JournalProject {
    const next = cloneJournal(this.current);
    edit(next);
    for(const node of next.document.blocks)if(node.kind==="table"&&node.normalization?.confirmed){
      const previous=this.current.document.blocks.find(n=>n.id===node.id);
      if(previous?.kind==="table"&&JSON.stringify(previous.rows)!==JSON.stringify(node.rows))node.normalization.confirmed=false;
    }
    if (JSON.stringify(next) === JSON.stringify(this.current)) return this.current;
    this.undoStack.push(this.current);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    next.revision = this.current.revision + 1; next.modified = new Date().toISOString();
    return this.current = next;
  }
  undo(): JournalProject {
    const previous = this.undoStack.pop();
    if (previous) { this.redoStack.push(this.current); this.current = { ...cloneJournal(previous), revision: this.current.revision + 1, modified: new Date().toISOString() }; }
    return this.current;
  }
  redo(): JournalProject {
    const next = this.redoStack.pop();
    if (next) { this.undoStack.push(this.current); this.current = { ...cloneJournal(next), revision: this.current.revision + 1, modified: new Date().toISOString() }; }
    return this.current;
  }
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
}

export function setChangeDecision(project: JournalProject, ids: string[], decision: "accepted" | "rejected" | "pending"): void {
  const selected = new Set(ids);
  for (const change of project.changes) if (selected.has(change.id) && change.kind !== "unsupported") change.decision = decision;
}

export function validateProject(value: unknown): JournalProject {
  if (!value || typeof value !== "object") throw new Error("저널 프로젝트 형식이 아닙니다.");
  const p = value as Partial<JournalProject>;
  if (p.schemaVersion !== 1 && p.schemaVersion !== 2) throw new Error("지원하지 않는 저널 프로젝트 버전입니다.");
  if (!p.id || !p.document || !Array.isArray(p.document.blocks) || !Array.isArray(p.sources) || !Array.isArray(p.assets) || !Array.isArray(p.fonts) || !Array.isArray(p.references) || !Array.isArray(p.changes) || !Array.isArray(p.overrides) || !Array.isArray(p.issues) || !p.preset || !p.acknowledgements || !p.styleMappings) throw new Error("저널 프로젝트에 필요한 항목이 없습니다.");
  const project = cloneJournal(p as JournalProject);
  if(project.preset.appearance)project.preset.appearance=validateAppearance(project.preset.appearance);
  if(project.schemaVersion===1){project.schemaVersion=2;project.editorial={...editorialDefaults(),enabled:false,numbering:'source',sortReferences:false,preserveCharts:false};}
  const number=(n:unknown,min:number,max:number):boolean=>typeof n==="number"&&Number.isFinite(n)&&n>=min&&n<=max;
  const string=(v:unknown):boolean=>typeof v==="string";
  if(!string(project.document.title)||!string(project.document.runningTitle)||(project.document.runningAuthors!==undefined&&!string(project.document.runningAuthors))||!Array.isArray(project.document.authors)||!Array.isArray(project.document.affiliations)||!Array.isArray(project.document.abstract)||!Array.isArray(project.document.keywords)||!number(project.document.firstPage,1,100000))throw new Error("잘못된 원고 정보입니다.");
  const publication=project.document.publication;
  if(project.markdown){const b=project.markdown;
    if(b.mode!=='source'||!safeProjectPath(b.path)||!/^[a-f0-9]{64}$/.test(b.sha256)||!b.properties||typeof b.properties!=='object'||Array.isArray(b.properties)||!Array.isArray(b.dependencies))throw new Error('잘못된 Markdown 원문 연결입니다.');
    for(const dep of b.dependencies)if(!dep||!safeProjectPath(dep.path)||!string(dep.src)||!string(dep.name)||!['remote','local','data'].includes(dep.kind)||!/^[a-f0-9]{64}$/.test(dep.sha256))throw new Error('잘못된 Markdown 이미지 연결입니다.');
  }
  if(project.document.journalMetadata){const m=project.document.journalMetadata;
    if(!m.overrides||Object.entries(m.overrides).some(([k,v])=>!['publication','copyright','header-even','header-odd','folio'].includes(k)||!string(v))||!Array.isArray(m.sidebar)||m.sidebar.some(s=>!s||![s.id,s.label,s.text].every(string))||!Array.isArray(m.sidebarOrder)||m.sidebarOrder.some(s=>!string(s))||!Array.isArray(m.hiddenSidebar)||m.hiddenSidebar.some(s=>!string(s))||(m.correspondence!==undefined&&!string(m.correspondence)))throw new Error('잘못된 저널 원고별 문구입니다.');
  }
  const quality=project.preset.compositionQuality;
  if(quality&&(quality.version!==1||![quality.enabled,quality.balanceColumns,quality.anchorFloats].every(b=>typeof b==='boolean')||!number(quality.trackingLimitEm,0,.01)||!number(quality.horizontalScaleLimit,0,.01)||!number(quality.leadingLimitPt,0,.2)||!number(quality.spaceLimitPt,0,1)||!Array.isArray(quality.disabledNodes)||quality.disabledNodes.some(n=>!string(n))))throw new Error('잘못된 자동 조판 보정 한도입니다.');
  if(project.preset.fallbackFonts!==undefined&&(!Array.isArray(project.preset.fallbackFonts)||project.preset.fallbackFonts.some(f=>!string(f)||!f.trim())))throw new Error("잘못된 대체 글꼴 목록입니다.");
  if(publication&&(!["aop","issue"].includes(publication.mode)||(publication.copyrightYear!==undefined&&!string(publication.copyrightYear))||(publication.review&&(!string(publication.review.snapshot)||!string(publication.review.at)))))throw new Error("잘못된 발행 정보입니다.");
  if(!Number.isInteger(project.document.firstPage))throw new Error("시작 쪽수는 정수여야 합니다.");
  for(const [level,s]of Object.entries(project.preset.headingSpacing??{}))if(!/^[1-5]$/.test(level)||!s||![s.beforePt,s.afterPt,s.followingHeadingPt].every(n=>number(n,0,120)))throw new Error("잘못된 제목 간격입니다.");
  for(const [pair,n]of Object.entries(project.preset.headingTransitionsPt??{}))if(!/^[1-5]:[1-5]$/.test(pair)||!number(n,0,120))throw new Error("잘못된 연속 제목 간격입니다.");
  for(const group of ["body","title","abstract","references","table","caption"] as const){
    const style=project.preset[group];
    if(!style||!number(style.sizePt,6,72))throw new Error("글자 크기는 6–72pt 범위여야 합니다.");
    if("leadingPt" in style&&!number(style.leadingPt,style.sizePt,120))throw new Error("줄높이는 글자 크기 이상이어야 합니다.");
    if("font" in style&&(!string(style.font)||!style.font.trim()))throw new Error("글꼴 이름이 없습니다.");
  }
  if(!number(project.preset.body.trackingEm,-.025,.025))throw new Error("본문 자간은 -0.025–0.025em 범위여야 합니다.");
  for(const color of [project.preset.keyColor,project.preset.inkColor,project.preset.abstract.fill])if(typeof color!=="string"||!/^#[0-9a-f]{6}$/i.test(color))throw new Error("잘못된 조판 색상입니다.");
  for(const size of [project.preset.gapMm,project.preset.body.indentMm,project.preset.references.hangingMm,project.preset.table.paddingMm])if(!number(size,0,30))throw new Error("잘못된 간격입니다.");
  for(const width of [project.preset.table.outerRulePt,project.preset.table.innerRulePt])if(!number(width,0,5))throw new Error("잘못된 표 선 두께입니다.");
  if(project.preset.table.ruleColor!==undefined&&!/^#[0-9a-f]{6}$/i.test(project.preset.table.ruleColor))throw new Error("잘못된 표 선 색입니다.");
  if(project.preset.table.ruleMode!==undefined&&!["apa","rows"].includes(project.preset.table.ruleMode))throw new Error("잘못된 표 선 방식입니다.");
  const notes=project.preset.tableNotes;
  if(notes&&(!["journal","double"].includes(notes.spacing)||!number(notes.groupGapPt,0,60)))throw new Error("잘못된 표 주석 간격입니다.");
  for(const size of Object.values(project.preset.spacing??{}))if(!number(size,0,60))throw new Error("잘못된 개체 간격입니다.");
  if(!number(project.preset.photoDpi,1,2400)||!number(project.preset.lineDpi,1,2400))throw new Error("잘못된 해상도 기준입니다.");
  const paths = [...project.sources, ...project.assets, ...project.fonts].map(a => a.path);
  if(project.assets.some(a=>a.aspectRatio!==undefined&&!number(a.aspectRatio,.000001,1000000)))throw new Error('잘못된 그림 가로세로 비율입니다.');
  if (paths.some(path => !safeProjectPath(path))) throw new Error("프로젝트 밖의 파일 경로는 사용할 수 없습니다.");
  const ids = project.document.blocks.map(b => b.id);
  if (new Set(ids).size !== ids.length) throw new Error("중복된 원고 항목 ID가 있습니다.");
  for (const n of Object.values(project.preset.page)) if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 2000) throw new Error("잘못된 페이지 규격입니다.");
  const page=project.preset.page;
  if(page.widthMm-page.marginLeftMm-page.marginRightMm-page.gutterMm<50||page.heightMm-page.topMm-page.bottomMm<60)throw new Error("본문 영역이 너무 작습니다.");
  for(const o of project.overrides)if(o.snapLane!==undefined&&!['left','right','full'].includes(o.snapLane)||!string(o.id)||!number(o.page,1,500)||!Number.isInteger(o.page)||!number(o.x,0,6000)||!number(o.y,0,6000)||!number(o.width,30,6000)||(o.height!==undefined&&!number(o.height,20,6000)))throw new Error("잘못된 고정 배치입니다.");
  if(project.preset.master){
    const m=resolvedMaster(project.preset);project.preset.master=m;
    for(const key of ["showLogo","showCrossmark"] as const)if(m[key]!==undefined&&typeof m[key]!=="boolean")throw new Error("잘못된 마스터 표시 설정입니다.");
    for(const [key,defaultValue]of Object.entries(HNMR_MASTER))if(typeof defaultValue==="number"&&!number(m[key as keyof typeof m],key.endsWith("RightInsetPt")?-50:0,6000))throw new Error("잘못된 마스터 페이지 규격: "+key);
    if(typeof m.enabled!=="boolean"||!number(m.abstractWidthMm,30,page.widthMm-page.marginLeftMm-page.marginRightMm-25)||!number(m.titleYpt,m.topRuleYpt,page.heightMm*72/25.4-150)||!number(m.bottomRuleYpt,m.titleYpt+50,page.heightMm*72/25.4-20))throw new Error("첫 페이지 영역을 확인하세요.");
    for(const key of ["journalName","printIssn","onlineIssn","copyrightOwner","licenseText"] as const)if(!string(m[key]))throw new Error("잘못된 저널 마스터 정보입니다.");
    if(m.abstractPadLeftMm+m.abstractPadRightMm>=m.abstractWidthMm-10||m.abstractWidthMm+m.sidebarGapMm>page.widthMm-page.marginLeftMm-page.marginRightMm-20)throw new Error("초록과 교신저자 영역의 폭을 확인하세요.");
    if(m.topRulePt>10||m.bottomRulePt>10||m.runningRulePt>10||m.logoWidthPt<1||m.crossmarkWidthPt<1)throw new Error("마스터 선 두께와 로고 폭을 확인하세요.");
  }
  for(const s of Object.values(project.preset.textStyles??{})){
    if(!s||!string(s.font)||!number(s.sizePt,6,72)||!number(s.leadingPt,s.sizePt,120)||!/^#[0-9a-f]{6}$/i.test(s.color)||!["left","right","center","justify"].includes(s.align)||!number(s.indentMm,0,60)||!number(s.trackingEm,-.025,.025))throw new Error("잘못된 역할별 글자 스타일입니다.");
  }
  const inlines=(runs:import("./types").Inline[]):void=>{
    if(!Array.isArray(runs)||runs.some(r=>!r||!string(r.text)))throw new Error("잘못된 문단 내용입니다.");
    for(const r of runs)if(r.objectReference){const ref=r.objectReference;if(!Array.isArray(ref.ids)||!ref.ids.length||ref.ids.some(id=>!string(id))||!string(ref.label)||!Array.isArray(ref.sourceNumbers)||ref.sourceNumbers.some(n=>!string(n)))throw new Error('잘못된 표·그림 참조입니다.');}
  };
  if(project.editorial){
    const e=project.editorial;
    if(typeof e.enabled!=='boolean'||typeof e.sortReferences!=='boolean'||typeof e.preserveCharts!=='boolean'||!['source','layout'].includes(e.numbering)||!Array.isArray(e.changes)||!Array.isArray(e.detections))throw new Error('잘못된 원고 정리 설정입니다.');
    for(const c of e.changes)if(!c||!string(c.id)||!string(c.rule)||!['applied','pending','reverted'].includes(c.status)||!Array.isArray(c.source)||!string(c.reason))throw new Error('잘못된 원고 정리 기록입니다.');
    for(const d of e.detections)if(!d||!string(d.assetId)||!string(d.assetSha256)||!['complete','failed'].includes(d.status)||!Array.isArray(d.candidates)||d.candidates.some(c=>!string(c.text)||![c.x,c.y,c.width,c.height,c.confidence].every(n=>number(n,0,100000))))throw new Error('잘못된 이미지 탐지 기록입니다.');
    for(const d of e.detections)if(d.review!==undefined&&!['keep','crop'].includes(d.review))throw new Error('잘못된 이미지 확인 상태입니다.');
    if(e.markdownBaseline){
      if(!string(e.markdownBaseline.sourceId)||!Array.isArray(e.markdownBaseline.references))throw new Error('잘못된 Markdown 비교 원본입니다.');
      validateProject({...project,editorial:undefined,document:e.markdownBaseline.document,references:e.markdownBaseline.references});
    }
    for(const c of e.changes){
      if(c.documentPatch)validateProject({...project,editorial:undefined,document:{...project.document,...c.documentPatch}});
      if(c.replacement)validateProject({...project,editorial:undefined,document:{...project.document,blocks:c.replacement}});
    }
  }
  if(project.document.endMatter!==undefined){
    if(!Array.isArray(project.document.endMatter))throw new Error('잘못된 말미 정보입니다.');
    for(const e of project.document.endMatter){if(!e||!string(e.id)||!string(e.title)||!['data','funding','conflict','acknowledgments','ethics','contributions','custom'].includes(e.kind)||typeof e.enabled!=='boolean'||typeof e.required!=='boolean'||!Array.isArray(e.content))throw new Error('잘못된 말미 항목입니다.');for(const n of e.content)inlines(n.content);}
  }
  if(project.document.importedMetadata!==undefined){
    if(!Array.isArray(project.document.importedMetadata))throw new Error("잘못된 원고 정보 추출 기록입니다.");
    for(const m of project.document.importedMetadata){
      if(!m||!["title","runningTitle","authors","affiliations","correspondence","submission","keywords","abstractLabel"].includes(m.field)||!string(m.sourceId)||!string(m.rule)||!Array.isArray(m.blocks))throw new Error("잘못된 원고 정보 추출 기록입니다.");
      for(const b of m.blocks){if(!b||!["paragraph","heading"].includes(b.kind)||!string(b.id))throw new Error("잘못된 원본 문단입니다.");inlines(b.content);}
    }
  }
  for(const b of [...project.document.blocks,...project.document.abstract]){
    if(!b||!string(b.id))throw new Error("원고 항목 ID가 없습니다.");
    if(b.kind==="paragraph"||b.kind==="heading"||b.kind==="unsupported")inlines(b.content);
    else if(b.kind==="table"){
      if(!Array.isArray(b.rows)||!Array.isArray(b.columnWeights)||!["auto","column","full"].includes(b.width))throw new Error("잘못된 표입니다.");
      if(b.normalization&&(!string(b.normalization.rule)||typeof b.normalization.confirmed!=="boolean"||!Array.isArray(b.normalization.sourceRows)||!Array.isArray(b.normalization.sourceColumnWeights)))throw new Error("잘못된 표 정리 기록입니다.");
      for(const row of [...b.rows,...b.normalization?.sourceRows??[]]){if(!Array.isArray(row.cells))throw new Error("잘못된 표 행입니다.");for(const c of row.cells){if(!number(c.rowspan,1,10000)||!number(c.colspan,1,1000)||!Number.isInteger(c.colspan)||!Number.isInteger(c.rowspan)||!Array.isArray(c.blocks))throw new Error("잘못된 병합 셀입니다.");for(const p of c.blocks)inlines(p.content);}}
    }else if(b.kind==="figure"){
      if(!string(b.assetId)||!["auto","column","full"].includes(b.width))throw new Error("잘못된 그림입니다.");
      if(b.crop){const c=b.crop;if(!string(c.assetSha256)||typeof c.confirmed!=='boolean'||![c.x,c.y].every(v=>number(v,0,1))||![c.width,c.height].every(v=>number(v,.000001,1))||c.x+c.width>1.000001||c.y+c.height>1.000001)throw new Error('잘못된 그림 크롭입니다.');}
    }
    else if(b.kind==='anchor'){if(!['table','figure'].includes(b.targetKind)||!Array.isArray(b.targetIds)||b.targetIds.some(id=>!string(id))||!string(b.sourceNumber)||!b.source)throw new Error('잘못된 배치 지점입니다.');inlines(b.source.content);}
    else if(b.kind!=="break")throw new Error("지원하지 않는 원고 항목입니다.");
    if((b.kind==="paragraph"||b.kind==="heading")&&b.level!==undefined&&!number(b.level,1,5))throw new Error("제목 단계는 1–5입니다.");
    if((b.kind==="paragraph"||b.kind==="heading")&&b.indentMm!==undefined&&!number(b.indentMm,0,60))throw new Error("잘못된 들여쓰기입니다.");
    if((b.kind==="figure"||b.kind==="table")&&b.caption){inlines(b.caption.title);if(!Array.isArray(b.caption.notes))throw new Error("잘못된 표·그림 주입니다.");for(const n of b.caption.notes)inlines(n.content);}
  }
  return cloneJournal(project);
}
export function safeProjectPath(path: string): boolean {
  return typeof path === "string" && path.length > 0 && !/[\\:]/.test(path) && !path.includes(String.fromCharCode(0)) && !path.startsWith("/") && path.split("/").every(p => p !== ".." && p !== "." && !!p);
}
