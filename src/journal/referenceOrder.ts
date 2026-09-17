import {isReferenceHeading} from './editorial';
import {inlineText,type JournalIssue,type JournalProject,type ReferenceRecord,type Paragraph} from './types';

const fold=(s:string):string=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const titleKey=(s:string):string=>fold(s).replace(/^(a|an|the) /,'');
/** Sorting confidence is independent of accepting all bibliographic metadata. */
export function inferredAuthorKey(r:ReferenceRecord):string|undefined{
  if(r.sort?.confirmed&&r.sort.authorKey.trim())return r.sort.authorKey;
  if(r.confirmed&&r.author.length)return r.author.map(a=>a.family?`${a.family}, ${a.given??''}`:a.literal??'').join(' | ');
  const prefix=r.raw.match(/^\s*(.+?)\s*\((?:\d{4}[a-z]?(?:,\s*[^)]+)?|n\.d\.|in press)\)/i)?.[1]?.trim();
  if(!prefix)return;
  if(/^[\p{L}\p{M}'’ .-]+,\s*(?:[A-Z]\.[\s-]*)+/u.test(prefix))return prefix;
  // Corporate names have no inverted personal-name punctuation.
  if(!/[,;&]/.test(prefix)&&/\p{L}/u.test(prefix))return prefix;
}
export function compareReferences(a:ReferenceRecord,b:ReferenceRecord):number{
  const compare=(a:string,b:string):number=>a<b?-1:a>b?1:0;
  const author=compare(fold(inferredAuthorKey(a)??a.raw),fold(inferredAuthorKey(b)??b.raw));if(author)return author;
  const year=(r:ReferenceRecord):number=>r.knownNoDate||/\(n\.d\.\)/i.test(r.raw)?-1:/\(in press\)/i.test(r.raw)?10000:Number(r.year??r.raw.match(/\((\d{4})/)?.[1]??9999);
  return year(a)-year(b)||compare(titleKey(a.sort?.titleKey??a.title??a.raw),titleKey(b.sort?.titleKey??b.title??b.raw));
}
export function sortReferenceBlocks(p:JournalProject):JournalIssue[]{
  if(!p.editorial?.enabled||!p.editorial.sortReferences)return [];
  const issues:JournalIssue[]=[];
  const records=p.references;
  for(const r of records){
    r.sourceParagraphIds??=p.document.blocks.filter(n=>(n.kind==='paragraph'||n.kind==='heading')&&n.role==='reference'&&inlineText(n.content).trim()===r.raw.trim()).map(n=>n.id);
    if(!inferredAuthorKey(r))issues.push({id:r.id+':reference-sort-key',nodeId:r.id,code:'reference-sort-key',severity:'error',message:'참고문헌의 저자/단체명 또는 무저자 자료 제목 정렬 키를 확인하세요.'});
  }
  const sorted=[...records].sort(compareReferences);p.references=sorted;
  const ids=new Set(records.flatMap(r=>r.sourceParagraphIds??[]));
  const blocks=new Map(p.document.blocks.filter(n=>ids.has(n.id)).map(n=>[n.id,n]));
  const references=sorted.flatMap(r=>{
    const parts=(r.sourceParagraphIds??[]).map(id=>blocks.get(id)).filter((n):n is Paragraph=>!!n&&(n.kind==='paragraph'||n.kind==='heading'));
    if(!parts.length)return [];
    return [{...parts[0],content:parts.flatMap((n,i)=>[...(i?[{text:' '}]:[]),...n.content])}];
  });
  const index=p.document.blocks.findIndex(isReferenceHeading);
  if(index>=0){p.document.blocks=p.document.blocks.filter(n=>!ids.has(n.id));const at=p.document.blocks.findIndex(isReferenceHeading);p.document.blocks.splice(at+1,0,...references);}
  return issues;
}
