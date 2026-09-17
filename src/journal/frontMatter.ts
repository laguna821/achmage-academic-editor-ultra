import {cloneJournal,inlineText,newId,type JournalNode,type JournalProject,type Paragraph,type ImportedMetadata} from "./types";

export interface SourceParagraphFormat {centered:boolean;bold:boolean;titleStyle:boolean}
const paragraph=(n:JournalNode):n is Paragraph=>n.kind==="paragraph"||n.kind==="heading";
const text=(n:JournalNode):string=>paragraph(n)?inlineText(n.content).trim():"";
const abstract=(n:JournalNode):boolean=>/^(?:abstracts?|초록)\s*(?:[:：.]|$)/i.test(text(n));
const running=/^running\s*(?:head|title)\s*:\s*/i;
const metaLabel=/^(?:authors?|affiliations?|correspond(?:ence|ing author)|e-?mail|postal address|address|ORCID|telephone|phone|word count|number of|data availability|ethics statement|conflicts? of interest|use of artificial intelligence|author note)\b/i;
const section=/^(?:\d+(?:\.\d+)*[.)]?\s+)?(?:introduction|background|methods?|results?|discussion|conclusions?|references?|bibliography|서론)\s*[:：.]?$/i;
const normalized=(s:string):string=>s.normalize("NFKC").replace(/\s+/g," ").trim().toLowerCase();
const regionNames=new Set<string>();
const displayNames=new Intl.DisplayNames(["en"],{type:"region"});
for(let a=65;a<=90;a++)for(let b=65;b<=90;b++){
  const code=String.fromCharCode(a,b),name=displayNames.of(code);
  if(name&&name!==code)regionNames.add(normalized(name));
}

/** Extract only source-backed front matter. Position-based guesses remain reviewable. */
export function mapManuscriptFrontMatter(project:JournalProject,nodes:JournalNode[],formats:Map<string,SourceParagraphFormat>):JournalNode[]{
  const boundary=nodes.findIndex(abstract);
  if(boundary<0)return nodes; // Do not guess a title from an arbitrary first body paragraph.
  const before=nodes.slice(0,boundary).filter(n=>!paragraph(n)||text(n)),removed=new Set<string>();
  const transferred:ImportedMetadata[]=[];
  const transfer=(field:ImportedMetadata["field"],blocks:Paragraph[],rule:string):void=>{
    if(!blocks.length)return;
    transferred.push({field,sourceId:blocks[0].origin?.sourceId??"",blocks:cloneJournal(blocks),rule});
    for(const b of blocks)removed.add(b.id);
  };
  for(const n of before)if(paragraph(n)&&running.test(text(n))&&!project.document.runningTitle){
    project.document.runningTitle=text(n).replace(running,"");transfer("runningTitle",[n],"explicit-running-title-label");
  }
  const candidate=(n:JournalNode):n is Paragraph=>{
    if(!paragraph(n)||removed.has(n.id))return false;
    const value=text(n),words=value.split(/\s+/).length;
    return !metaLabel.test(value)&&!section.test(value)&&!running.test(value)&&!/[\n@]/.test(value)&&words>=3&&words<=65&&value.length<=600&&!n.content.some(r=>r.assetId||r.changeIds?.length);
  };
  let titleBlocks:Paragraph[]=[];
  if(!project.document.title){
    const first=before.find(n=>!removed.has(n.id));
    if(first&&candidate(first)){
      titleBlocks=[first];
      const next=before[before.indexOf(first)+1];
      if(next&&candidate(next)&&text(first).endsWith(":")&&formats.get(next.id)?.bold&&formats.get(first.id)?.bold)titleBlocks.push(next);
    }else if(!before.length){
      // Some manuscripts put a centered title immediately after the abstract's
      // keyword line. Require presentation evidence, not a publication-title match.
      const keywords=nodes.findIndex((n,i)=>i>boundary&&i<20&&/^key\s?words?\s*[:：]/i.test(text(n)));
      const next=keywords>=0?nodes[keywords+1]:undefined;
      if(next&&candidate(next)&&formats.get(next.id)?.centered&&formats.get(next.id)?.bold)titleBlocks=[next];
    }
    if(titleBlocks.length){
      project.document.title=titleBlocks.map(text).join(" ");
      transfer("title",titleBlocks,"front-matter-position-and-format");
      // Duplicated cover/body titles before the abstract are retained in the
      // source mapping but should not be printed twice as body paragraphs.
      const duplicates=before.filter((n):n is Paragraph=>paragraph(n)&&!removed.has(n.id)&&normalized(text(n))===normalized(project.document.title));
      transfer("title",duplicates,"identical-repeated-front-title");
    }
  }
  // Explicitly labelled authors are accepted as candidates; unlabelled names
  // require a single personal-name line plus email and institution evidence.
  const afterTitle=titleBlocks.length?before.slice(before.indexOf(titleBlocks[titleBlocks.length-1])+1):[];
  const authorLine=afterTitle.find(n=>!removed.has(n.id));
  const emailLine=before.find(n=>/^e-?mail\s*:/i.test(text(n)));
  const email=emailLine?text(emailLine).match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0]:undefined;
  const institution=/\b(?:university|department|faculty|institute|school|college|hospital)\b/i;
  const affiliationLines=afterTitle.filter((n):n is Paragraph=>paragraph(n)&&!removed.has(n.id)&&(/^affiliation\s*:/i.test(text(n))||(!metaLabel.test(text(n))&&institution.test(text(n))))&&!/[@\n]/.test(text(n)));
  const lastAffiliation=affiliationLines[affiliationLines.length-1];
  const region=lastAffiliation?afterTitle[afterTitle.indexOf(lastAffiliation)+1]:undefined;
  if(region&&paragraph(region)&&regionNames.has(normalized(text(region))))affiliationLines.push(region);
  if(!project.document.authors.length&&authorLine&&paragraph(authorLine)){
    const value=text(authorLine),explicit=/^authors?\s*:/i.test(value);
    const name=value.replace(/^authors?\s*:\s*/i,"").replace(/^(?:Dr\.?|Prof\.?)\s+/i,"").replace(/,?\s+(?:Ph\.?D\.?|MD|M\.D\.)$/i,"").trim();
    const personal=/^[\p{L}\p{M}.'’-]+(?:\s+[\p{L}\p{M}.'’-]+){1,5}$/u.test(name)&&!metaLabel.test(value)&&!institution.test(value)&&!authorLine.content.some(r=>r.changeIds?.length);
    if(personal&&(explicit||(email&&affiliationLines.length))){
      project.document.authors=[{name,affiliations:[],...(email?{email,corresponding:true}:{})}];
      transfer("authors",[authorLine],explicit?"explicit-author-label":"single-name-email-institution");
      if(affiliationLines.length&&!project.document.affiliations.length){
        const lines=affiliationLines.map(n=>text(n).replace(/^affiliation\s*:\s*/i,""));
        project.document.affiliations=[lines.join(", ")];project.document.authors[0].affiliations=["1"];
        transfer("affiliations",affiliationLines,"single-author-institution-lines");
      }
      const addressLine=before.find(n=>/^(?:postal\s+)?address\s*:/i.test(text(n)));
      if(addressLine&&paragraph(addressLine)){project.document.authors[0].address=text(addressLine).replace(/^(?:postal\s+)?address\s*:\s*/i,"");transfer("correspondence",[addressLine],"explicit-address-label");}
      if(emailLine&&paragraph(emailLine))transfer("correspondence",[emailLine],"explicit-email-label");
    }
  }
  for(const n of before)if(paragraph(n)&&!removed.has(n.id)&&/^(?:(?:word count|number of (?:tables|figures|references)|ORCID|telephone|phone)\s*:|\d{3,4}-\d{4}-\d{4}-[\dX]{4}$)/i.test(text(n)))transfer("submission",[n],"submission-metadata-label");
  if(transferred.length){
    project.document.importedMetadata=[...project.document.importedMetadata??[],...transferred];
    const sourceId=transferred[0].sourceId;
    project.issues.push({id:newId("issue"),severity:"warning",code:"front-matter-review",sourceId,message:"원고에서 제목·저자 등의 정보를 추출했습니다. 원고 정보의 추출 근거와 값을 확인하세요. 원문 문단은 보존됩니다."});
  }
  return nodes.filter(n=>!removed.has(n.id));
}
