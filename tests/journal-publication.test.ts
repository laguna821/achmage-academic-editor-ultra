import test from "node:test";
import assert from "node:assert/strict";
import {createJournalProject,validateProject,JournalHistory} from "../src/journal/project";
import {canonicalDoi,copyrightYear,publicationSuffix,publicationReviewed,publicationSnapshot,publicationMissing} from "../src/journal/publication";
import {headingSpacing,headingTransition,masterBackground} from "../src/journal/master";
test("AOP hides issue metadata without destroying it; issue pagination is derived",()=>{
  const p=createJournalProject(),d=p.document;Object.assign(d,{year:"2026",volume:"10",issue:"1",firstPage:23,doi:"https://doi.org/10.1234/example"});
  assert.equal(publicationSuffix(d,35)," 2026; 10(1), 23–35.");
  d.publication={mode:"aop",copyrightYear:"2027"};
  assert.equal(publicationSuffix(d,35)," 2026");assert.equal(copyrightYear(d),"2027");
  assert.equal(canonicalDoi(d.doi),"10.1234/example");assert.ok(!masterBackground(p).includes('10(1)'));assert.ok(masterBackground(p).includes('Copyright © 2027'));
  assert.ok(!publicationMissing(d).includes("volume"));d.publication.mode="issue";
  assert.equal(publicationSuffix(d,35)," 2026; 10(1), 23–35.");
  d.volume=d.issue="";assert.ok(!publicationSuffix(d,35).includes("()"));assert.ok(publicationMissing(d).includes("volume"));
});
test("publication approval is invalidated by changed metadata, page count or role styling",()=>{
  const p=createJournalProject();p.document.publication={mode:"issue"};
  p.document.publication.review={snapshot:publicationSnapshot(p,12),at:"2026-09-16T00:00:00Z"};
  assert.ok(publicationReviewed(p,12));assert.ok(!publicationReviewed(p,13));
  const history=new JournalHistory(p);history.change(p=>{p.document.year="2027";});assert.ok(!publicationReviewed(history.current,12));history.undo();assert.ok(publicationReviewed(history.current,12));
  history.change(p=>{p.document.publication!.mode="aop";});assert.ok(!publicationReviewed(history.current,12));
  history.undo();history.change(p=>{p.preset.master!.showLogo=!p.preset.master!.showLogo;});assert.ok(!publicationReviewed(history.current,12));
});
test("heading spacing distinguishes body gaps and consecutive heading transitions",()=>{
  const p=createJournalProject();assert.equal(headingSpacing(p.preset,2).beforePt,12);assert.equal(headingTransition(p.preset,1,2),1.9525);
  p.preset.headingSpacing={1:{beforePt:15,afterPt:3,followingHeadingPt:2}};
  p.preset.headingTransitionsPt={"1:2":0,"2:3":4};
  assert.equal(headingTransition(p.preset,1,2),0);assert.equal(headingTransition(p.preset,1,3),2);assert.equal(headingTransition(p.preset,2,3),4);
  assert.deepEqual(validateProject(p).preset.headingTransitionsPt,p.preset.headingTransitionsPt);
  p.preset.headingTransitionsPt["1:2"]=-1;assert.throws(()=>validateProject(p));
});
