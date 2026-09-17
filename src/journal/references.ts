import { newId, type JournalIssue, type ReferenceRecord, type ReferenceAuthor, type ReferenceType } from "./types";
import { descendants, textOf, xml, attr } from "./ooxml";

export function emptyReference(raw = ""): ReferenceRecord { return { id: newId("ref"), type: "unknown", raw, title: "", author: [], confirmed: false, provenance: [] }; }
export function splitAuthor(value: string): ReferenceAuthor {
  const comma = value.indexOf(",");
  return comma < 0 ? { literal: value.trim() } : { family: value.slice(0, comma).trim(), given: value.slice(comma + 1).trim() };
}
export function referenceCandidate(raw: string): ReferenceRecord {
  const reference = emptyReference(raw);
  reference.doi = raw.match(/10\.\d{4,9}\/[^\s<>]+/i)?.[0].replace(/[.,;]+$/, "");
  reference.url = raw.match(/https?:\/\/[^\s<>]+/)?.[0].replace(/[.,;]+$/, "");
  const year = raw.match(/\((\d{4})([a-z])?\)/);
  reference.year = year?.[1];
  if (year?.index !== undefined) {
    reference.author = raw.slice(0, year.index).trim().replace(/\.$/, "").split(/\s*&\s*|;\s*/).filter(Boolean).map(splitAuthor);
    reference.title = raw.slice(year.index + year[0].length).replace(/^\s*\.\s*/, "").split(/\.\s+/)[0];
  }
  return reference;
}

function recordFromCsl(value: unknown, source: string): ReferenceRecord | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const string = (key: string): string => typeof data[key] === "string" || typeof data[key] === "number" ? String(data[key]) : "";
  const types = new Set<ReferenceType>(["article-journal","book","chapter","report","webpage","thesis","paper-conference","dataset","software"]);
  const reference = emptyReference();
  const type = string("type") as ReferenceType;
  reference.type = types.has(type) ? type : "unknown";
  reference.title = string("title");
  reference.author = Array.isArray(data.author) ? data.author.filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null).map(a => ({ family: typeof a.family === "string" ? a.family : undefined, given: typeof a.given === "string" ? a.given : undefined, literal: typeof a.literal === "string" ? a.literal : undefined })) : [];
  const date = data.issued as { "date-parts"?: unknown[][] } | undefined;
  const year = date?.["date-parts"]?.[0]?.[0];
  if (typeof year === "number" || typeof year === "string") reference.year = String(year);
  reference.containerTitle = string("container-title"); reference.volume = string("volume"); reference.issue = string("issue"); reference.pages = string("page"); reference.doi = string("DOI"); reference.url = string("URL"); reference.publisher = string("publisher"); reference.edition = string("edition");
  reference.provenance.push({ source, fields: Object.keys(data) });
  return reference;
}
export function readCitationField(instruction: string): ReferenceRecord[] {
  if (/ZOTERO_ITEM\s+CSL_CITATION/.test(instruction)) {
    try {
      const parsed = JSON.parse(instruction.slice(instruction.indexOf("{"))) as { citationItems?: { itemData?: unknown }[] };
      return (parsed.citationItems ?? []).map(i => recordFromCsl(i.itemData, "DOCX Zotero field")).filter((r): r is ReferenceRecord => !!r);
    } catch { return []; }
  }
  if (/EN\.CITE/.test(instruction) && instruction.includes("<")) {
    try {
      const doc = xml(instruction.slice(instruction.indexOf("<")));
      return descendants(doc, "record").map(record => {
        const r = emptyReference();
        const kind = attr(descendants(record, "ref-type")[0], "name").toLowerCase();
        const map: Record<string, ReferenceType> = { "journal article": "article-journal", book: "book", "book section": "chapter", report: "report", "web page": "webpage", thesis: "thesis", "conference paper": "paper-conference", dataset: "dataset", "computer program": "software" };
        r.type = map[kind] ?? "unknown";
        r.title = textOf(record, "title"); r.author = descendants(record, "author").map(a => splitAuthor(a.textContent ?? ""));
        r.year = textOf(record, "year"); r.containerTitle = textOf(record, "secondary-title"); r.volume = textOf(record, "volume"); r.issue = textOf(record, "number"); r.pages = textOf(record, "pages"); r.doi = textOf(record, "electronic-resource-num"); r.publisher = textOf(record, "publisher"); r.url = textOf(record, "url");
        r.provenance.push({ source: "DOCX EndNote field", fields: ["title","author","year","containerTitle","volume","issue","pages","doi"] });
        return r;
      });
    } catch { return []; }
  }
  return [];
}
export function sameReference(a: ReferenceRecord, b: ReferenceRecord): boolean {
  if (a.doi && b.doi) return normalizeDoi(a.doi) === normalizeDoi(b.doi);
  return !!a.title && !!a.year && a.title.toLowerCase().replace(/\W/g, "") === b.title.toLowerCase().replace(/\W/g, "") && a.year === b.year;
}
export function normalizeDoi(doi: string): string { return doi.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "").toLowerCase(); }
export function validateReference(r: ReferenceRecord): JournalIssue[] {
  const issues: JournalIssue[] = [];
  const add = (code: string, message: string): void => { issues.push({ id: `${r.id}:${code}`, severity: "warning", code, nodeId: r.id, message }); };
  if (r.type === "unknown") add("reference-type", "자료 종류를 확인하세요.");
  if (!r.title.trim()) add("reference-title", "자료 제목이 없습니다.");
  if (!r.author.length) add("reference-author", "저자 유무와 저자 없는 자료의 처리 방식을 확인하세요.");
  if (!r.year && !r.knownNoDate) add("reference-date", "연도 누락과 실제 무연도 자료를 구분하세요.");
  if ((r.type === "article-journal" || r.type === "chapter" || r.type === "paper-conference") && !r.containerTitle) add("reference-container", "수록된 학술지·책·학회자료 제목이 없습니다.");
  if ((r.type === "book" || r.type === "chapter") && !r.publisher) add("reference-publisher", "출판사를 확인하세요.");
  if (r.type === "chapter" && !r.editors?.length) add("reference-editors", "편저서의 편집자를 확인하세요.");
  if (r.changing && !r.accessed) add("reference-accessed", "내용이 바뀌는 자료의 조회 날짜가 없습니다.");
  if (r.title.length > 10 && r.title === r.title.toUpperCase() && /[A-Z]/.test(r.title)) add("reference-case", "제목 대소문자와 고유명사를 확인하세요.");
  return issues;
}

/** Only called by the explicit reference lookup button. Transport is injected. */
export async function lookupCrossref(query: string, request: (url: string) => Promise<unknown>): Promise<ReferenceRecord[]> {
  const doi = normalizeDoi(query);
  const direct = /^10\.\d{4,9}\/\S+$/i.test(doi);
  const response = await request(direct ? `https://api.crossref.org/works/${encodeURIComponent(doi)}` : `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(query)}&rows=5`);
  if (!response || typeof response !== "object") throw new Error("서지정보 응답을 읽을 수 없습니다.");
  const message = (response as { message?: unknown }).message;
  const records = direct ? [message] : (message as { items?: unknown[] } | undefined)?.items ?? [];
  return records.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const data = item as Record<string, unknown>;
    const firstValue = (name: string): unknown => Array.isArray(data[name]) ? data[name][0] : data[name];
    const types: Record<string,string> = { "journal-article":"article-journal", "book-chapter":"chapter", "proceedings-article":"paper-conference", "posted-content":"report", "report":"report", "monograph":"book", "book":"book", "dissertation":"thesis", "dataset":"dataset" };
    const r = recordFromCsl({ ...data, type: types[String(data.type)] ?? "unknown", title: firstValue("title"), "container-title": firstValue("container-title"), issued: data.issued ?? data.published }, "Crossref");
    if (!r) return [];
    r.provenance[0].date = new Date().toISOString(); return [r];
  });
}

/** JSON is valid YAML. No interpolation of author input into Typst source. */
export function hayagrivaRecords(references: ReferenceRecord[]): string {
  const output: Record<string, unknown> = {};
  const name = (a: ReferenceAuthor): unknown => a.literal ? a.literal : { name: a.family ?? "", "given-name": a.given ?? "" };
  for (const r of references.filter(r => r.confirmed)) {
    const entry: Record<string, unknown> = { type: ({ "article-journal":"Article", book:"Book", chapter:"Chapter", report:"Report", webpage:"Web", thesis:"Thesis", "paper-conference":"Article", dataset:"Misc", software:"Misc", unknown:"Misc" })[r.type], title: { value: r.title, "sentence-case": r.title }, author: r.author.map(name) };
    if (r.year && /^\d{4}$/.test(r.year)) entry.date = r.year;
    if (r.doi) entry['serial-number'] = {doi:normalizeDoi(r.doi),...(r.number?{serial:r.number}:{})};
    if (r.pages) entry["page-range"] = r.pages.replace(/[-–—]/g, "-");
    if (r.edition) entry.edition = r.edition;
    if (r.number&&!r.doi) entry["serial-number"] = r.number;
    if (r.url) entry.url = r.accessed ? { value: r.url, date: r.accessed } : r.url;
    const corporate = r.author.length === 1 ? r.author[0].literal?.trim() : undefined;
    if (r.publisher && r.publisher.trim() !== corporate) entry.publisher = r.publisher;
    if (r.institution) entry.organization = r.institution;
    if (r.genre) entry.genre = r.genre;
    if (r.version) entry.version = r.version;
    if (r.containerTitle && !(r.type === "webpage" && r.containerTitle.trim() === corporate)) {
      const parent: Record<string, unknown> = { type: r.type === "chapter" ? "Book" : r.type === "webpage" ? "Web" : "Periodical", title: r.containerTitle };
      if (r.volume) parent.volume = r.volume;
      if (r.issue) parent.issue = r.issue;
      if (r.editors?.length) parent.editor = r.editors.map(name);
      if (r.type === "chapter" && r.publisher) { parent.publisher = r.publisher; delete entry.publisher; }
      entry.parent = parent;
    }
    output[r.id] = entry;
  }
  return JSON.stringify(output);
}
