import {academicChecks} from './appearance';
import {publicationReviewed} from './publication';
import type {JournalProject,LayoutResult,JournalIssue} from './types';
/** Editorial checks are advisory once a current PDF exists. Renderer/source failures remain exceptions. */
export function exportReadiness(p:JournalProject,result:LayoutResult):JournalIssue[]{
  const issues=[...p.issues,...result.issues].filter(i=>i.severity==='error'||i.severity==='warning'&&!p.acknowledgements[i.id]);
  const add=(code:string,message:string)=>issues.push({id:code,code,message,severity:'warning'});
  if(!p.document.title.trim())add('title-empty','제목이 비어 있습니다.');
  if(academicChecks(p)&&!publicationReviewed(p,result.pageCount))add('publication-unreviewed','발행정보와 최종 쪽수를 아직 확정하지 않았습니다.');
  if(p.changes.some(c=>c.decision==='pending')||p.editorial?.changes.some(c=>c.status==='pending'))add('changes-pending','아직 확인하지 않은 원고 변경 사항이 있습니다.');
  return issues.filter((v,i,a)=>a.findIndex(o=>o.id===v.id&&o.message===v.message)===i);
}
