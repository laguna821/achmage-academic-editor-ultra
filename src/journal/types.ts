/** Journal projects are independent of the existing Markdown/theme settings schemas. */
export type Id = string;
export type ChangeDecision = "pending" | "accepted" | "rejected";
export interface AuthorChange { id: Id; kind: "insert" | "delete" | "unsupported"; author: string; date: string; decision: ChangeDecision; sourceId: Id; detail?: string }
export interface Inline {
  text: string;
  bold?: boolean; italic?: boolean; superscript?: boolean; subscript?: boolean;
  href?: string; changeIds?: Id[]; citationIds?: Id[]; locator?: string;
  assetId?: Id; break?: boolean;
  objectReference?: { ids: Id[]; label: string; sourceNumbers: string[] };
}
export interface Origin { sourceId: Id; path: string; text?: string;occurrence?:number }
export interface Paragraph {
  id: Id; kind: "paragraph" | "heading"; content: Inline[];
  level?: number; role?: "body" | "abstract" | "quote" | "reference" | "caption" | "note" | "code";
  style?: string; list?: { id: string; level: number; ordered: boolean; label?: string };
  origin?: Origin; keepNext?: boolean; indentMm?: number;
}
export interface TableCell { id: Id; blocks: Paragraph[]; colspan: number; rowspan: number; header: boolean; sourceCellId?:Id }
export interface TableRow { id: Id; cells: TableCell[]; header: boolean }
export interface Caption { number: string; title: Inline[]; notes: Paragraph[]; source?:Paragraph; titleSource?:Paragraph; sourceNumber?:string; sourceRows?:TableRow[] }
export interface TableNode { id: Id; kind: "table"; rows: TableRow[]; columnWeights: number[]; width: "auto" | "column" | "full"; caption?: Caption; origin?: Origin; normalization?:{rule:string;confirmed:boolean;sourceRows:TableRow[];sourceColumnWeights:number[]} }
export interface ChartSeries { name: string; values: number[]; x?: number[]; errors?: number[] }
export interface ChartData { type: "bar" | "line" | "scatter"; categories: string[]; series: ChartSeries[]; title?: string; xTitle?: string; yTitle?: string; yMin?: number; yMax?: number; stacked?: boolean; horizontal?: boolean }
export interface FigureNode { id: Id; kind: "figure"; assetId: Id; width: "auto" | "column" | "full"; caption?: Caption; chart?: ChartData; origin?: Origin; sourceObject?:{type:"office-chart"|"missing-image";part:string;description:string}; originalAssetId?:Id; crop?:ImageCrop }
export interface UnsupportedNode { id: Id; kind: "unsupported"; description: string; content: Inline[]; origin?: Origin; acknowledged?: boolean }
export interface BreakNode { id: Id; kind: "break"; target: "column" | "page"; origin?: Origin }
export interface AnchorNode { id:Id; kind:"anchor"; targetKind:"table"|"figure"; sourceNumber:string; targetIds:Id[]; source:Paragraph; origin?:Origin }
export type JournalNode = Paragraph | TableNode | FigureNode | UnsupportedNode | BreakNode | AnchorNode;
export interface ImageCrop { assetSha256:string; x:number; y:number; width:number; height:number; confirmed:boolean }
export interface CaptionDetection {assetId:Id;assetSha256:string;engine:string;status:"complete"|"failed";message?:string;review?:"keep"|"crop";candidates:{text:string;confidence:number;x:number;y:number;width:number;height:number;crop?:{x:number;y:number;width:number;height:number}}[]}
export interface EditorialChange {id:Id;rule:string;status:"applied"|"pending"|"reverted";source:JournalNode[];targetId?:Id;reason:string;beforeId?:Id;afterId?:Id;replacement?:JournalNode[];documentPatch?:Partial<ArticleDocument>;documentOrder?:Id[];referenceCandidates?:ReferenceRecord[]}
export interface EndMatter {id:Id;kind:"data"|"funding"|"conflict"|"acknowledgments"|"ethics"|"contributions"|"custom";title:string;content:Paragraph[];enabled:boolean;required:boolean;reviewed?:string;omissionReason?:string;source?:JournalNode[]}
export interface NumberAssignment {id:Id;kind:"table"|"figure";original:string;number:string;page:number}
export interface JournalAuthor { name: string; affiliations: string[]; corresponding?: boolean; email?: string; address?: string }
export interface ImportedMetadata {
  field:"title"|"runningTitle"|"authors"|"affiliations"|"correspondence"|"submission"|"keywords"|"abstractLabel";
  sourceId:Id; blocks:Paragraph[]; rule:string;
}
export interface ArticleDocument {
  journalMetadata?:{overrides:Record<string,string>;referenceChecks?:boolean;sidebar:{id:string;label:string;text:string}[];sidebarOrder:string[];hiddenSidebar:string[];correspondence?:string};
  title: string; runningTitle: string; runningAuthors?:string; authors: JournalAuthor[]; affiliations: string[];
  abstract: Paragraph[]; keywords: string[]; blocks: JournalNode[]; affiliationMarkers?:string[];
  doi: string; volume: string; issue: string; year: string; firstPage: number;
  received: string; revised: string; accepted: string;
  importedMetadata?:ImportedMetadata[];
  endMatter?:EndMatter[];
  publication?:{mode:"aop"|"issue";copyrightYear?:string;review?:{snapshot:string;at:string}};
}
export type ReferenceType = "article-journal" | "book" | "chapter" | "report" | "webpage" | "thesis" | "paper-conference" | "dataset" | "software" | "unknown";
export interface ReferenceAuthor { family?: string; given?: string; literal?: string }
export interface ReferenceRecord {
  id: Id; type: ReferenceType; raw: string; title: string; author: ReferenceAuthor[];
  year?: string; containerTitle?: string; volume?: string; issue?: string; pages?: string;
  doi?: string; url?: string; publisher?: string; edition?: string; editors?: ReferenceAuthor[];
  number?: string; accessed?: string; knownNoDate?: boolean; changing?: boolean;
  genre?: string; institution?: string; version?: string;
  confirmed: boolean; provenance: { source: string; date?: string; fields: string[] }[];
  sourceParagraphIds?:Id[];
  sort?:{authorKey:string;titleKey?:string;confirmed:boolean};
}
export interface JournalAsset { id: Id; name: string; mime: string; path: string; sha256: string; bytes: number; widthPx?: number; heightPx?: number;widthPt?:number;heightPt?:number;aspectRatio?:number; sourceId?: Id;derivedFrom?:Id }
export interface JournalSource { id: Id; name: string; path: string; sha256: string; role: "manuscript" | "title" | "tables" | "figures" | "appendix" | "ignore";format?:"docx"|"markdown";originalPath?:string;markdownOptions?:{titleMode:'auto'|'heading'|'filename';headingShift?:number} }
export interface FontAsset { id: Id; name: string; family: string; path: string; sha256: string }
export type JournalStyleRole="body"|"title"|"abstract"|"table"|"caption"|"note"|"reference"|"publication"|"authors"|"affiliations"|"abstractLabel"|"keywords"|"sidebar"|"sidebarLabel"|"copyright"|"runningHeader"|"pageNumber"|"heading1"|"heading2"|"heading3"|"heading4"|"heading5";
export interface JournalTextStyle {font:string;sizePt:number;leadingPt:number;color:string;bold:boolean;italic:boolean;align:"left"|"center"|"right"|"justify";indentMm:number;trackingEm:number}
export interface JournalMaster {
  enabled:boolean; logoAssetId?:string; crossmarkAssetId?:string;
  showLogo?:boolean;showCrossmark?:boolean;
  publicationYpt:number;topRuleYpt:number;topRulePt:number;titleYpt:number;
  abstractWidthMm:number;abstractPadLeftMm:number;abstractPadRightMm:number;
  abstractPadTopMm:number;abstractPadBottomMm:number;sidebarGapMm:number;
  bottomRuleYpt:number;bottomRulePt:number;copyrightYpt:number;
  runningHeaderYpt:number;runningRuleYpt:number;runningRulePt:number;
  journalName:string;printIssn:string;onlineIssn:string;copyrightOwner:string;licenseText:string;
  logoRightInsetPt:number;logoYpt:number;logoWidthPt:number;
  crossmarkRightInsetPt:number;crossmarkYpt:number;crossmarkWidthPt:number;
  titleAfterPt:number;authorsAfterPt:number;affiliationsAfterPt:number;
  abstractLabelAfterPt:number;keywordsBeforePt:number;abstractAfterPt:number;correspondenceTopPt:number;correspondenceGapPt:number;
}
export interface JournalPreset {
  appearance?:import("./appearance").JournalAppearance;
  template?:{id:string;name:string;version:1};
  schemaVersion: 1; id: string; name: string;
  page: { widthMm: number; heightMm: number; marginLeftMm: number; marginRightMm: number; topMm: number; bottomMm: number; gutterMm: number };
  body: { font: string; sizePt: number; leadingPt: number; indentMm: number; language: string; trackingEm: number };
  title: { font: string; sizePt: number };
  abstract: { font: string; sizePt: number; leadingPt: number; fill: string };
  references: { sizePt: number; leadingPt: number; hangingMm: number };
  table: { sizePt: number; leadingPt: number; minSizePt: number; paddingMm: number; outerRulePt: number; innerRulePt: number; ruleColor?:string; ruleMode?:"apa"|"rows" };
  caption: { sizePt: number; leadingPt: number };
  tableNotes?: { spacing:"journal"|"double"; groupGapPt:number };
  compositionQuality?:CompositionQuality;
  keyColor: string; inkColor: string; gapMm: number; photoDpi: number; lineDpi: number;
  sectionNewPage: boolean;
  textStyles?:Partial<Record<JournalStyleRole,JournalTextStyle>>;
  master?:JournalMaster;
  spacing?:{floatBeforeMm:number;floatAfterMm:number;captionGapPt:number;noteGapPt:number;headingBeforePt:number;headingAfterPt:number};
  headingSpacing?:Partial<Record<1|2|3|4|5,{beforePt:number;afterPt:number;followingHeadingPt:number}>>;
  headingTransitionsPt?:Record<string,number>;
  fallbackFonts?:string[];
}
export interface LayoutOverride { id: Id; page: number; x: number; y: number; width: number; height?: number; locked: boolean; trackingEm?: number; gapAfterPt?: number }
export interface CoverageEntry {key:string;nodeId:Id;kind:string;status:"rendered"|"transformed"|"excluded"|"unresolved";expected:number;actual:number;pages:number[];reason?:string}
export interface CompositionAudit {entries:CoverageEntry[];complete:boolean;issues:JournalIssue[]}
export interface CompositionAdjustment {nodeId:Id;rule:string;before:number|string;after:number|string;reason:string}
export interface CompositionQuality {version:1;enabled:boolean;balanceColumns:boolean;anchorFloats:boolean;trackingLimitEm:number;horizontalScaleLimit:number;leadingLimitPt:number;spaceLimitPt:number;disabledNodes:Id[]}
export interface JournalIssue { id: string; severity: "error" | "warning" | "info"; code: string; message: string; nodeId?: Id; sourceId?: Id; resolution?: string }
export interface JournalProject {
  markdown?:{mode:'source';path:string;sha256:string;templateId?:string;properties:Record<string,unknown>;dependencies:MarkdownDependency[]};
  migratedFrom?:{root:string;projectId:string;sha256:string};
  schemaVersion: 1 | 2; id: Id; revision: number; created: string; modified: string;
  document: ArticleDocument; sources: JournalSource[]; assets: JournalAsset[]; fonts: FontAsset[];
  references: ReferenceRecord[]; changes: AuthorChange[]; preset: JournalPreset;
  overrides: LayoutOverride[]; issues: JournalIssue[];
  styleMappings: Record<string, { kind: "paragraph" | "heading"; level?: number; role?: Paragraph["role"] }>;
  acknowledgements: Record<string, string>;
  editorial?:{enabled:boolean;numbering:"source"|"layout";sortReferences:boolean;preserveCharts:boolean;changes:EditorialChange[];detections:CaptionDetection[];markdownBaseline?:{sourceId:Id;document:ArticleDocument;references:ReferenceRecord[]}};
}
export interface LayoutBox { id: Id; nodeId: Id; page: number; x: number; y: number; width: number; height: number; kind: string; text?: string; fragment?: number; rowIds?: Id[]; cellIds?: Id[]; locked?: boolean; contentY?:number;contentHeight?:number;clearanceBeforePt?:number;clearanceAfterPt?:number;noteKind?:string;noteSources?:{id:Id;start:number;end:number}[];noteLeadingPt?:number;noteSizePt?:number;noteGapPt?:number }
export interface LayoutResult { editableSource?:import("./editableExport").JournalEditableSource; pdf: Uint8Array; boxes: LayoutBox[]; pageCount: number; issues: JournalIssue[]; elapsedMs: number; fingerprint: string; source: string; coverage?:CompositionAudit;adjustments?:CompositionAdjustment[];numbering?:NumberAssignment[] }
export interface BinaryStore { get(path: string): Promise<Uint8Array | null>; put(path: string, bytes: Uint8Array): Promise<void> }
export interface MarkdownDependency {src:string;kind:'remote'|'local'|'data';path:string;sha256:string;mime?:string;name:string;checkedAt:string;localPath?:string}

export function cloneJournal<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
export function newId(prefix: string): string { return `${prefix}-${crypto.randomUUID()}`; }
export function visibleInlines(content: Inline[], changes: AuthorChange[], view: "final" | "original" | "changes" = "final"): Inline[] {
  if (view === "changes") return content;
  const lookup = new Map(changes.map(c => [c.id, c]));
  return content.filter(run => (run.changeIds ?? []).every(id => {
    const change = lookup.get(id);
    if (!change || change.kind === "unsupported") return true;
    const accepted = change.decision === "accepted" || (change.decision === "pending" && view === "final");
    return change.kind === "insert" ? accepted : !accepted;
  }));
}
export function inlineText(content: Inline[]): string { return content.map(r => r.break ? "\n" : r.text).join(""); }
export function nodeText(node: JournalNode): string {
  if (node.kind === "paragraph" || node.kind === "heading" || node.kind === "unsupported") return inlineText(node.content);
  if (node.kind === "table") return node.rows.map(r => r.cells.map(c => c.blocks.map(b => inlineText(b.content)).join("\n")).join("\t")).join("\n");
  return node.kind === "figure" ? inlineText(node.caption?.title ?? []) : "";
}
