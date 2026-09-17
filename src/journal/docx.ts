import {selectPdfPage} from "./pdfArtwork";
import JSZip from "jszip";
import {symbolUnicode} from './symbolFonts';
import { attr, children, descendants, first, local, relPath, textOf, xml } from "./ooxml";
import { digestBytes } from "./storage";
import { imageInfo } from "./imageInfo";
import {extractEmfBitmap} from "./emfBitmap";
import {normalizePackedTable} from "./tableNormalization";
import {tableNoteKind} from "./tableNotes";
import { inferManuscriptHeading } from "./headingMapping";
import { mapManuscriptFrontMatter,type SourceParagraphFormat } from "./frontMatter";
import { readCitationField, referenceCandidate, sameReference } from "./references";
import {normalizeEditorial,endMatterKind} from './editorial';
import { cloneJournal, inlineText, newId, nodeText, type BinaryStore, type ChartData, type Inline, type JournalNode, type JournalProject, type JournalSource, type Paragraph, type TableCell, type TableNode } from "./types";

export interface AuthorFile { name: string; bytes: Uint8Array; role: JournalSource["role"] }
interface Relation { target: string; external: boolean; type:string }
interface Field { instruction: string; mode: "instruction" | "result"; refs: string[] }
interface Style { name: string; parent: string; level?: number }
const extension = (name: string): string => name.split(".").pop()?.toLowerCase() ?? "";
const property=(root:Element|undefined,name:string):Element|undefined=>root?children(root,name)[0]:undefined;

export async function importAuthorFile(project: JournalProject, file: AuthorFile, store: BinaryStore): Promise<JournalSource> {
  const hash = await digestBytes(file.bytes);
  const source: JournalSource = { id: newId("source"), name: file.name, path: `sources/${hash}.${extension(file.name)}`, sha256: hash, role: file.role,...(extension(file.name)==='docx'?{format:'docx' as const}:{}) };
  if (project.sources.some(s => s.sha256 === hash && s.role !== "ignore")) throw new Error(`이미 가져온 파일입니다: ${file.name}`);
  await store.put(source.path, file.bytes); project.sources.push(source);
  if (file.role === "ignore") return source;
  if (extension(file.name) !== "docx") {
    const asset = await addAsset(project, file.bytes, file.name, source.id, store);
    project.document.blocks.push({ id: newId("figure"), kind: "figure", assetId: asset, width: "auto", origin: { sourceId: source.id, path: file.name } });
    return source;
  }
  const zip = await JSZip.loadAsync(file.bytes);
  if (Object.keys(zip.files).length > 5000) throw new Error("DOCX 패키지 항목이 너무 많습니다.");
  const documentText = await zip.file("word/document.xml")?.async("string");
  if (!documentText || documentText.length > 40 * 1024 * 1024) throw new Error("DOCX 본문이 없거나 너무 큽니다.");
  const document = xml(documentText);
  const relText = await zip.file("word/_rels/document.xml.rels")?.async("string");
  const relations = new Map<string, Relation>();
  if (relText) for (const r of descendants(xml(relText), "Relationship")) relations.set(attr(r,"Id"), { target: attr(r,"Target"), external: attr(r,"TargetMode") === "External",type:attr(r,"Type") });
  const partTypes=new Map<string,string>(),extensionTypes=new Map<string,string>();
  const typeText=await zip.file("[Content_Types].xml")?.async("string");
  if(typeText)for(const el of children(xml(typeText).documentElement)){
    if(local(el)==="Override")partTypes.set(attr(el,"PartName").replace(/^\//,""),attr(el,"ContentType"));
    else if(local(el)==="Default")extensionTypes.set(attr(el,"Extension").toLowerCase(),attr(el,"ContentType"));
  }
  const styles = new Map<string, Style>();
  const styleText = await zip.file("word/styles.xml")?.async("string");
  if (styleText) for (const s of descendants(xml(styleText), "style")) {
    const outline = first(s,"outlineLvl");
    styles.set(attr(s,"styleId"), { name: attr(first(s,"name"),"val"), parent: attr(first(s,"basedOn"),"val"), level: outline ? Number(attr(outline,"val")) + 1 : undefined });
  }
  const media = new Map<string, string>();
  let totalBytes = 0;
  for (const [id, relation] of relations) {
    if (relation.external || (!relation.type.endsWith("/image")&&!/\.(png|jpe?g|svg|gif|webp|tiff?|emf|wmf)$/i.test(relation.target))) continue;
    const path = relPath("word/document.xml", relation.target), entry = zip.file(path);
    if (!entry) continue;
    const bytes = await entry.async("uint8array"); totalBytes += bytes.length;
    if (totalBytes > 256 * 1024 * 1024) throw new Error("DOCX 이미지 해제 크기가 너무 큽니다.");
    media.set(id, await addAsset(project, bytes, path.split("/").pop() ?? id, source.id, store,partTypes.get(path)??extensionTypes.get(extension(path))));
  }
  const sourceIssue = (code: string, message: string, nodeId?: string,severity:"info"|"warning"|"error"="warning"): void => { project.issues.push({ id: newId("issue"), severity, code, message, sourceId: source.id, nodeId }); };
  const revisionIds = new WeakMap<Element,string>();
  function changeId(element: Element): string {
    const cached = revisionIds.get(element); if (cached) return cached;
    const tag = local(element), id = newId("change");
    project.changes.push({ id, kind: tag === "ins" ? "insert" : tag === "del" ? "delete" : "unsupported", author: attr(element,"author"), date: attr(element,"date"), decision: "pending", sourceId: source.id, detail: tag });
    revisionIds.set(element, id); return id;
  }
  for (const tag of ["rPrChange","pPrChange","tblPrChange","trPrChange","tcPrChange","tblGridChange","moveFrom","moveTo"]) for (const el of descendants(document,tag)) changeId(el);
  if (project.changes.some(c => c.sourceId === source.id && c.kind === "unsupported")) sourceIssue("unsupported-revisions", "서식·이동 변경 기록이 있습니다. 원본에서 확인하거나 확정한 대체 원고를 사용하세요.");
  const fields: Field[] = [];
  function runContent(root: Element, inherited: Inline = { text: "" }): Inline[] {
    const result: Inline[] = [];
    for (const el of children(root)) {
      const tag = local(el);
      if (["pPr","rPr","sdtPr","smartTagPr","bookmarkStart","bookmarkEnd","proofErr"].includes(tag)) continue;
      if (tag === "AlternateContent") { const selected = children(el,"Choice")[0] ?? children(el,"Fallback")[0]; if (selected) result.push(...runContent(selected,inherited)); continue; }
      if (tag === "ins" || tag === "del") { result.push(...runContent(el, { ...inherited, changeIds: [...inherited.changeIds ?? [], changeId(el)] })); continue; }
      if (tag === "r") {
        const props = children(el,"rPr")[0];
        const enabled = (name: string): boolean | undefined => { const p = props ? children(props,name)[0] : undefined; return p ? !["0","false","off"].includes(attr(p,"val")) : undefined; };
        const vertical = attr(property(props,"vertAlign"),"val");
        result.push(...runContent(el, { ...inherited, bold: enabled("b") ?? inherited.bold, italic: enabled("i") ?? inherited.italic, superscript: vertical === "superscript" || inherited.superscript, subscript: vertical === "subscript" || inherited.subscript })); continue;
      }
      if (tag === "hyperlink") {
        const r = relations.get(attr(el,"id"));
        const href = r?.external && /^https?:\/\//i.test(r.target) ? r.target : undefined;
        result.push(...runContent(el, { ...inherited, href })); continue;
      }
      if (tag === "fldChar") {
        const type = attr(el,"fldCharType");
        if (type === "begin") fields.push({ instruction:"", mode:"instruction", refs:[] });
        if (type === "separate" && fields.length) {
          const field = fields[fields.length-1]; field.mode="result";
          for (const ref of readCitationField(field.instruction)) {
            const existing = project.references.find(r=>sameReference(r,ref));
            if (!existing) project.references.push(ref);
            field.refs.push(existing?.id ?? ref.id);
          }
        }
        if (type === "end") fields.pop();
        continue;
      }
      if (tag === "instrText") { if (fields.length) fields[fields.length-1].instruction += el.textContent ?? ""; continue; }
      const field = fields[fields.length-1];
      if (field?.mode === "instruction") continue;
      const value = { ...inherited, citationIds: field?.refs.length ? field.refs : inherited.citationIds };
      if (tag === "t" || tag === "delText") result.push({ ...value, text: el.textContent ?? "" });
      else if (tag === "tab") result.push({ ...value, text: "\t" });
      else if (tag === "br" || tag === "cr") result.push({ ...value, text: "\n", break: true });
      else if (tag === "blip" || tag === "imagedata") {
        const relationId=attr(el,"embed")||attr(el,"id")||attr(el,"link"),assetId=media.get(relationId);
        if (assetId) result.push({ ...value, text: "", assetId });
        else sourceIssue("missing-embedded-image",`원고의 그림 데이터가 없습니다: ${relationId||"연결 ID 없음"}. 외부 연결 그림은 파일을 별도로 가져오세요.`,undefined,"error");
      } else if (tag === "footnoteReference" || tag === "endnoteReference") result.push({ ...value, text: `[${tag === "footnoteReference" ? "fn" : "en"}:${attr(el,"id")}]`, superscript: true });
      else if (tag === "sym") {
        const font=attr(el,'font'),code=attr(el,'char'),mapped=symbolUnicode(font,code);
        if(mapped){sourceIssue('symbol-font-mapped',`${font}:${code} → ${mapped} (공개 Unicode 매핑)`,undefined,'info');result.push({...value,text:mapped});}
        else {sourceIssue('symbol-font','글꼴 기호의 유니코드 변환을 확인하세요.');result.push({...value,text:`[${font}:${code}]`});}
      }
      else if (tag === "oMath" || tag === "oMathPara") {
        const text = descendants(el,"t").map(t=>t.textContent ?? "").join("");
        sourceIssue("equation-review", "수식의 구조를 원본과 대조하세요."); result.push({ ...value, text: text || "[수식 원본 확인]" });
      } else result.push(...runContent(el, value));
    }
    return result;
  }
  let paragraphIndex = 0;
  const paragraphFormats=new Map<string,SourceParagraphFormat>();
  function paragraph(el: Element, path: string): Paragraph {
    fields.length = 0;
    const props = children(el,"pPr")[0], styleId = attr(property(props,"pStyle"),"val");
    let style = styles.get(styleId), level = style?.level;
    const seen = new Set<string>();
    while (style && !level && style.parent && !seen.has(style.parent)) { seen.add(style.parent); style = styles.get(style.parent); level = style?.level; }
    if (!level) level = Number((styleId+" "+(styles.get(styleId)?.name ?? "")).match(/(?:heading|제목)\s*([1-5])/i)?.[1]) || undefined;
    const mapped = project.styleMappings[styleId];
    const ancestorChanges: string[]=[];
    for(let parent=el.parentNode;parent&&parent.nodeType===1;parent=parent.parentNode) if(["ins","del"].includes(local(parent)))ancestorChanges.push(changeId(parent as Element));
    const p: Paragraph = { id: newId("p"), kind: mapped?.kind ?? (level && level <= 5 ? "heading" : "paragraph"), level: mapped?.level ?? level, role: mapped?.role ?? "body", content: runContent(el,{text:"",changeIds:ancestorChanges.length?ancestorChanges:undefined}), style: styleId, origin: { sourceId: source.id, path, text: descendants(el,"t").map(t=>t.textContent??"").join("") }, keepNext: !!property(props,"keepNext") };
    const num = property(props,"numPr");
    if (num) p.list = { id: attr(first(num,"numId"),"val"), level: Number(attr(first(num,"ilvl"),"val")) || 0, ordered: false };
    paragraphFormats.set(p.id,{centered:attr(property(props,"jc"),"val")==="center",bold:p.content.filter(r=>r.text.trim()).every(r=>r.bold),titleStyle:/^(?:article\s*title|title|제목)$/i.test(styles.get(styleId)?.name??styleId)});
    return p;
  }
  function table(el: Element, path: string): TableNode {
    const table: TableNode = { id:newId("table"), kind:"table", rows:[], columnWeights:children(children(el,"tblGrid")[0] ?? el,"gridCol").map(c=>Number(attr(c,"w"))||1), width:"auto", origin:{sourceId:source.id,path} };
    const merged = new Map<number,TableCell>();
    for (const [ri, tr] of children(el,"tr").entries()) {
      const header = !!property(children(tr,"trPr")[0],"tblHeader");
      const row = { id:newId("row"), cells:[] as TableCell[], header }; let column = 0;
      for (const [ci, tc] of children(tr,"tc").entries()) {
        const props = children(tc,"tcPr")[0], span = Math.max(1,Number(attr(property(props,"gridSpan"),"val")) || 1);
        const merge = property(props,"vMerge");
        const blocks = children(tc,"p").map((p,pi)=>paragraph(p,`${path}/tr[${ri}]/tc[${ci}]/p[${pi}]`));
        if (merge && attr(merge,"val") !== "restart" && merged.has(column)) {
          const above=merged.get(column)!; above.rowspan++;
          if (blocks.some(p=>inlineText(p.content).trim())) above.blocks.push(...blocks);
        } else {
          const cell: TableCell = { id:newId("cell"), blocks, colspan:span, rowspan:1, header };
          row.cells.push(cell); if (merge) merged.set(column,cell); else merged.delete(column);
        }
        column+=span;
        if (children(tc,"tbl").length) sourceIssue("nested-table", "표 안의 표는 원본과 대조해 별도 표로 정리해야 합니다.",table.id,'error');
      }
      table.rows.push(row);
    }
    if(normalizePackedTable(table))sourceIssue("table-normalization-review","한 셀에 나열된 통계값을 실제 행으로 정리했습니다. 원본 셀을 보존했으며 행과 머리글의 대응 확인이 필요합니다.",table.id);
    return table;
  }
  let imported: JournalNode[] = [];
  const body = first(document,"body");
  if (!body) throw new Error("DOCX 본문이 없습니다.");
  function bodyBlocks(root:Element):Element[]{return children(root).flatMap(el=>["sdt","sdtContent","customXml","ins","del"].includes(local(el))?bodyBlocks(el):local(el)==="sdtPr"?[]:[el]);}
  for (const child of bodyBlocks(body)) {
    if (local(child) === "tbl") imported.push(table(child,`word/document.xml/table[${imported.filter(b=>b.kind==="table").length}]`));
    else if (local(child) === "p") {
      const p=paragraph(child,`word/document.xml/p[${paragraphIndex++}]`);
      const imageRuns=p.content.filter(r=>r.assetId);
      const inlineCaption=imageRuns.length===1&&/^[\s\u200b]*(?:Figure|Fig\.?|그림)\s*\d+[a-z]?[.:]?\s+\S/i.test(inlineText(p.content));
      if (imageRuns.length && (!p.content.some(r=>r.text.trim())||inlineCaption)) {
        for(const [occurrence,r]of imageRuns.entries()) imported.push({id:newId("figure"),kind:"figure",assetId:r.assetId!,width:"auto",origin:{...p.origin!,occurrence}});
        if(inlineCaption)imported.push({...p,content:p.content.filter(r=>!r.assetId)});
      } else if (p.content.length) imported.push(p);
      for (const [chartIndex,chartElement] of descendants(child,"chart").entries()) {
        const relation = relations.get(attr(chartElement,"id")); if (!relation || relation.external) continue;
        const chartText=await zip.file(relPath("word/document.xml",relation.target))?.async("string");
        if (!chartText) continue;
        const part=relPath('word/document.xml',relation.target);
        if(project.editorial?.enabled&&project.editorial.preserveCharts){
          // A Choice chart and its Fallback preview denote one object. The
          // preview must come from this drawing, never an unrelated media part.
          let wrapper:Element|undefined=chartElement;
          while(wrapper&&local(wrapper)!=='AlternateContent'&&wrapper!==child)wrapper=wrapper.parentNode?.nodeType===1?wrapper.parentNode as Element:undefined;
          const fallback=wrapper&&local(wrapper)==='AlternateContent'?children(wrapper,'Fallback')[0]:undefined;
          const preview=fallback?descendants(fallback,'blip').map(b=>media.get(attr(b,'embed'))).find(Boolean)??descendants(fallback,'imagedata').map(b=>media.get(attr(b,'id'))).find(Boolean):undefined;
          imported.push({id:newId('figure'),kind:'figure',assetId:preview??'',width:'auto',sourceObject:{type:'office-chart',part,description:preview?'DOCX 원본 차트 미리보기':'원본 Office 차트의 이미지가 없습니다. 원본 그림을 연결하세요.'},origin:{...p.origin!,occurrence:imageRuns.length+chartIndex}});
        }else{
          const chart=parseOfficeChart(xml(chartText));
          if (chart) imported.push({id:newId("figure"),kind:"figure",assetId:"",width:"auto",chart,origin:{...p.origin!,occurrence:imageRuns.length+chartIndex}});
          else imported.push({id:newId("unsupported"),kind:"unsupported",description:"지원되지 않는 Office 차트",content:[],origin:p.origin});
        }
      }
      if (descendants(child,"OLEObject").length || descendants(child,"relIds").length) imported.push({id:newId("unsupported"),kind:"unsupported",description:"OLE 또는 SmartArt 원본 확인 필요",content:[],origin:p.origin});
    } else if (!["sectPr","bookmarkStart","bookmarkEnd"].includes(local(child))) {
      imported.push({id:newId("unsupported"),kind:"unsupported",description:`본문 구조 확인 필요: ${local(child)}`,content:runContent(child),origin:{sourceId:source.id,path:"word/document.xml"}});
    }
  }
  for (const part of ["footnotes","endnotes"]) {
    const text=await zip.file(`word/${part}.xml`)?.async("string"); if(!text)continue;
    const noteDoc=xml(text);
    for(const note of children(noteDoc.documentElement)) {
      if(Number(attr(note,"id"))<=0)continue;
      for(const [index,p]of children(note,"p").entries()) { const block=paragraph(p,`word/${part}.xml/${attr(note,"id")}/p[${index}]`);block.role="note"; block.content.unshift({text:`[${part==="footnotes"?"fn":"en"}:${attr(note,"id")}] `}); imported.push(block); }
    }
  }
  attachCaptions(imported);
  if(file.role==="manuscript")imported=mapManuscriptFrontMatter(project,imported,paragraphFormats);
  if (file.role === "title") {
    const texts=imported.filter((b):b is Paragraph=>b.kind==="paragraph"||b.kind==="heading");
    if (!project.document.title) project.document.title=inlineText(texts[0]?.content ?? []);
    for (const node of imported) project.document.blocks.push(node);
    sourceIssue("title-mapping", "표지 파일에서 저자·소속·제목을 메타데이터에 지정한 뒤 중복 본문을 정리하세요.");
  } else {
    let inReferences=false, inAbstract=false, keywordLabel:Paragraph|undefined;
    const bodyStart=(text:string):boolean=>/^(?:\d+(?:\.\d+)*[.)]?\s+)?(?:introduction|서론)\s*[:：.]?$/i.test(text.trim());
    const structuredAbstractHeading=(text:string):boolean=>/^(?:background|rationale|purpose|objectives?|methods?|methodology|results?|findings|conclusions?|implications)\s*[:：.]?$/i.test(text.trim());
    const keywords=(text:string):void=>{project.document.keywords=text.split(/[,;；]/).map(x=>x.trim()).filter(Boolean);};
    const preserveMapped=(field:'keywords'|'abstractLabel',blocks:Paragraph[]):void=>{
      project.document.importedMetadata??=[];
      project.document.importedMetadata.push({field,sourceId:source.id,blocks:cloneJournal(blocks),rule:field==='keywords'?'explicit-keyword-label':'explicit-abstract-label'});
    };
    for(const node of imported) {
      if(keywordLabel){
        const text=node.kind==="paragraph"?inlineText(node.content).trim():"";
        if(text&&!bodyStart(text)&&text.split(/\s+/).length<=120&&(/[,;；]/.test(text)||text.split(/\s+/).length<=12)){
          keywords(text);preserveMapped('keywords',[keywordLabel,node as Paragraph]);keywordLabel=undefined;continue;
        }
        project.document.blocks.push(keywordLabel);
        sourceIssue("keywords-mapping","키워드 제목 다음 내용을 확인해 키워드를 지정하세요.",keywordLabel.id);
        keywordLabel=undefined;
      }
      if (node.kind==="heading" || node.kind==="paragraph") {
        const text=inlineText(node.content).trim();
        const raw=inlineText(node.content);
        const abstractLabel=raw.match(/^\s*(?:abstracts?|초록)\s*(?:[:：.]\s*|$)/i);
        const keywordPrefix=raw.match(/^\s*(?:key\s?words?|키워드)[ \t]*(?:[:：][ \t\r\n]*|\r?\n\s*|\s*$)/i);
        // Authors often use bold text instead of a Word heading style. This
        // explicit section label must end the abstract even without keywords.
        if(bodyStart(text)){node.kind="heading";node.level=1;node.list=undefined;}
        if(/^(references?|bibliography|참고문헌)$/i.test(text)){inReferences=true;inAbstract=false;node.kind="heading";node.level=1;}
        else if(abstractLabel){
          inAbstract=true;inReferences=false;
          if(!raw.slice(abstractLabel[0].length).trim()){preserveMapped('abstractLabel',[node]);continue;}
          node.content=afterInlinePrefix(node.content,abstractLabel[0].length);
        }
        else if(inAbstract&&keywordPrefix){
          const value=raw.slice(keywordPrefix[0].length).trim();
          if(value){keywords(value);preserveMapped('keywords',[node]);}else keywordLabel=node;
          inAbstract=false;continue;
        }
        else if(inAbstract&&node.kind==="heading"&&!structuredAbstractHeading(text))inAbstract=false;
        else if(inReferences && (/^(appendix|appendices|부록|figures|tables)\b/i.test(text)||endMatterKind(text)))inReferences=false;
        if(inAbstract){node.role="abstract";node.kind="paragraph";delete node.level;project.document.abstract.push(node);continue;}
        if(!inReferences&&!project.styleMappings[node.style??""]){
          const inferred=inferManuscriptHeading(node);
          if(inferred){node.kind="heading";node.level=inferred;sourceIssue("heading-mapping-review","원고의 번호·독립 제목·강조 서식으로 제목 단계를 지정했습니다. 제목 계층을 확인하세요.",node.id);}
        }
        if(inReferences && node.kind==="paragraph" && node.role!=='note' && text){
          node.role="reference";
          const candidate=referenceCandidate(text), existing=project.references.find(r=>sameReference(r,candidate));
          if(existing){existing.raw=text;candidate.id=existing.id;existing.sourceParagraphIds=[...new Set([...(existing.sourceParagraphIds??[]),node.id])];}else {candidate.sourceParagraphIds=[node.id];project.references.push(candidate);}
        }
      }
      const duplicate=node.kind==="table" ? project.document.blocks.find(b=>b.kind==="table"&&nodeText(b)===nodeText(node)) : undefined;
      if(duplicate)sourceIssue("duplicate-table", "별첨과 본문에 같은 내용의 표가 있습니다. 교체 또는 추가 여부를 확인하세요.",node.id);
      project.document.blocks.push(node);
    }
    if(keywordLabel){project.document.blocks.push(keywordLabel);sourceIssue("keywords-mapping","키워드 제목 뒤에 내용이 없습니다.",keywordLabel.id);}
    if(project.document.abstract.map(p=>inlineText(p.content)).join(" ").split(/\s+/).length>1200)sourceIssue("abstract-boundary-review","초록이 매우 깁니다. 초록과 본문 경계를 확인하세요.");
  }
  normalizeEditorial(project);
  return source;
}

/** Remove a recognized label while retaining inline emphasis, links and revisions. */
function afterInlinePrefix(content:Inline[],count:number):Inline[]{
  const result:Inline[]=[];
  for(const run of content){
    const length=run.break?1:run.text.length;
    if(count>=length&&count>0){count-=length;continue;}
    result.push(count>0?{...run,text:run.text.slice(count)}:{...run});count=0;
  }
  return result;
}

export async function addAsset(project: JournalProject, bytes: Uint8Array, name: string, sourceId: string, store: BinaryStore,declaredMime?:string): Promise<string> {
  const info=imageInfo(bytes,name,declaredMime);
  const pdf=info.mime==="application/pdf"?await selectPdfPage(bytes):undefined;
  if(pdf&&pdf.pages>1&&sourceId!=="template")throw Error("그림으로 사용할 PDF는 한 페이지로 선택해 등록하세요.");
  const hash=await digestBytes(bytes), existing=project.assets.find(a=>a.sha256===hash);if(existing)return existing.mime==='application/pdf'?existing.id:project.assets.find(a=>a.derivedFrom===existing.id)?.id??existing.id;
  const id=newId("asset"),path=`assets/${hash}.${info.extension}`;
  await store.put(path,bytes);
  project.assets.push({id,name,path,sha256:hash,bytes:bytes.length,mime:info.mime,widthPx:info.widthPx,heightPx:info.heightPx,aspectRatio:pdf?pdf.width/pdf.height:info.aspectRatio,widthPt:pdf?.width,heightPt:pdf?.height,sourceId});
  if(info.extension==="emf"){
    const bitmap=await extractEmfBitmap(bytes);
    if(bitmap){
      const rendered=await addAsset(project,bitmap,name+".png",sourceId,store,"image/png");project.assets.find(a=>a.id===rendered)!.derivedFrom=id;
      project.issues.push({id:newId("issue"),severity:"info",code:"emf-embedded-bitmap",sourceId,message:"EMF에 포함된 단일 비트맵을 원래 픽셀 그대로 PNG로 복원했습니다. 원본 EMF도 보관합니다."});return rendered;
    }
  }
  return id;
}
export function attachCaptions(nodes: JournalNode[]): void {
  // Learn source direction before removing captions. Otherwise a sequence of
  // image / caption / image / caption shifts every caption onto the next image.
  const labels=/^[\s\u200b]*(Table|Figure|Fig\.?|표|그림)\s*([A-Z]?\d+[a-z]?)[.:]?\s*(.*)$/is;
  const votes={table:{above:0,below:0},figure:{above:0,below:0}};
  for(const [i,n]of nodes.entries()){
    if(n.kind!=='paragraph'&&n.kind!=='heading')continue;
    const match=inlineText(n.content).match(labels);if(!match)continue;
    const kind=/^(table|표)$/i.test(match[1])?'table':'figure';
    const before=nodes[i-1]?.kind===kind,after=nodes[i+1]?.kind===kind||(!match[3].trim()&&nodes[i+1]?.kind==='paragraph'&&nodes[i+2]?.kind===kind);
    if(before&&!after)votes[kind].below++;if(after&&!before)votes[kind].above++;
  }
  for(let i=0;i<nodes.length;i++) {
    const p=nodes[i];if(p.kind!=="paragraph"&&p.kind!=="heading")continue;
    const match=inlineText(p.content).match(/^[\s\u200b]*(Table|Figure|Fig\.?|표|그림)\s*([A-Z]?\d+[a-z]?)[.:]?\s*(.*)$/is);if(!match)continue;
    const kind=/^(table|표)$/i.test(match[1])?"table":"figure";
    const next=nodes[i+1],previous=nodes[i-1];
    const titleSource=!match[3].trim()&&next?.kind==='paragraph'&&inlineText(next.content).trim()&&!tableNoteKind(next)&&!/^\s*(?:Table|Figure|Fig\.)\s*\d/i.test(inlineText(next.content))&&(nodes[i+2]?.kind===kind||previous?.kind===kind)?next:undefined;
    const ownImage=kind==='figure'&&previous?.kind==='figure'&&!!previous.origin?.path&&previous.origin.path===p.origin?.path;
    const ahead=next?.kind===kind?next:titleSource&&nodes[i+2]?.kind===kind?nodes[i+2]:undefined;
    const behind=previous?.kind===kind?previous:undefined;
    const below=votes[kind].below>votes[kind].above||(votes[kind].below===votes[kind].above&&kind==='figure');
    const available=(n:JournalNode|undefined):boolean=>!!n&&(n.kind==='figure'||n.kind==='table')&&!n.caption?.number;
    const target=ownImage?previous:below?(available(behind)?behind:ahead):(available(ahead)?ahead:behind);
    if(!target || (target.kind!=="table"&&target.kind!=="figure") || target.caption?.number)continue;
    target.caption={number:match[2],title:titleSource?cloneJournal(titleSource.content):afterInlinePrefix(p.content,match[0].length-match[3].length),notes:target.caption?.notes??[],source:cloneJournal(p),...(titleSource?{titleSource:cloneJournal(titleSource)}:{})};nodes.splice(i,titleSource?2:1);i--;
  }
  for(let i=0;i<nodes.length;i++){
    const object=nodes[i];if(object.kind!=="table"&&object.kind!=="figure")continue;
    let next=i+1;
    while(next<nodes.length){
      const note=nodes[next];if(note.kind!=="paragraph")break;
      if(!inlineText(note.content).trim()&&!note.content.some(r=>r.assetId)){next++;continue;}
      if(!tableNoteKind(note))break;
      object.caption??={number:"",title:[],notes:[]};object.caption.notes.push({...note,role:"note"});nodes.splice(next,1);
    }
  }
}
function parseOfficeChart(doc: Document): ChartData | undefined {
  const plot=first(doc,"plotArea");if(!plot)return;
  const kind=first(plot,"barChart")?"bar":first(plot,"lineChart")?"line":first(plot,"scatterChart")?"scatter":undefined;if(!kind)return;
  const values=(root:Element|undefined):number[]=>root?descendants(root,"pt").map(p=>Number(textOf(p,"v"))):[];
  const series=descendants(plot,"ser").map(ser=>({name:textOf(first(ser,"tx")??ser,"v"),values:values(first(ser,kind==="scatter"?"yVal":"val")),x:kind==="scatter"?values(first(ser,"xVal")):undefined,errors:first(ser,"errBars")?values(first(first(ser,"errBars")!,"plus")):undefined}));
  if(!series.length||series.some(s=>s.values.some(n=>!Number.isFinite(n))))return;
  const cat=first(plot,"cat"),categories=cat?descendants(cat,"pt").map(p=>textOf(p,"v")):[];
  const group=attr(first(plot,"grouping"),"val");
  if(group && !["standard","clustered"].includes(group))return;
  return {type:kind,categories,series,horizontal:attr(first(plot,"barDir"),"val")==="bar",title:descendants(first(doc,"title")??doc,"t").map(t=>t.textContent??"").join("")||undefined};
}
