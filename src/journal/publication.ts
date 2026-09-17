import type {ArticleDocument,JournalProject} from "./types";
export const publicationMode=(d:ArticleDocument):"aop"|"issue"=>d.publication?.mode??"issue";
export const copyrightYear=(d:ArticleDocument):string=>d.publication?.copyrightYear?.trim()||d.year.trim();
export const canonicalDoi=(value:string):string=>value.trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i,"");
export const publicationRunning=(d:ArticleDocument,name:string):string=>[name,d.year].filter(Boolean).join(" ");
export const articleRunning=(d:ArticleDocument):string=>[d.runningAuthors?.trim()||d.authors.map(a=>a.name).join(", "),d.runningTitle||d.title].filter(Boolean).join(": ");
export function publicationMissing(d:ArticleDocument):string[]{
  const fields:("doi"|"year"|"received"|"revised"|"accepted"|"volume"|"issue")[]=["doi","year","received","revised","accepted"];
  if(publicationMode(d)==="issue")fields.push("volume","issue");
  return fields.filter(key=>!(d[key]??"").trim());
}
/** Only entered information changes between AOP and issue. Hidden issue data survives. */
export function publicationSuffix(d:ArticleDocument,lastPage:number):string{
  if(publicationMode(d)==="aop")return d.year.trim()?" "+d.year.trim():"";
  const issue=d.volume.trim()+(d.issue.trim()?`(${d.issue.trim()})`:"");
  const parts=[d.year.trim(),issue].filter(Boolean).join("; ");
  return `${parts?" "+parts:""}${parts?",":""} ${d.firstPage}–${lastPage}.`;
}
export function publicationSnapshot(project:JournalProject,pages:number):string{
  const d=project.document;
  return JSON.stringify({mode:publicationMode(d),title:d.title,runningTitle:d.runningTitle,runningAuthors:d.runningAuthors,doi:canonicalDoi(d.doi),volume:d.volume,issue:d.issue,year:d.year,firstPage:d.firstPage,pages,copyrightYear:copyrightYear(d),received:d.received,revised:d.revised,accepted:d.accepted,authors:d.authors,affiliations:d.affiliations,affiliationMarkers:d.affiliationMarkers,preset:project.preset,fonts:project.fonts.map(f=>f.sha256),endMatter:d.endMatter,objects:d.blocks.filter(n=>n.kind==='figure'||n.kind==='table'||n.kind==='anchor'),overrides:project.overrides,editorial:project.editorial,sourceHashes:project.sources.map(s=>s.sha256)});
}
export const publicationReviewed=(p:JournalProject,pages:number):boolean=>p.document.publication?.review?.snapshot===publicationSnapshot(p,pages);
