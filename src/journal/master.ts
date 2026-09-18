import {pdfMeasurePath} from "./imageInfo";
import { FONT_GROUPS, customHeader, resolveTemplateText } from "./appearance";
import { MM, literal, pt } from "./syntax";
import type { JournalMaster, JournalPreset, JournalProject, JournalStyleRole, JournalTextStyle } from "./types";
import { canonicalDoi,copyrightYear,publicationMode,publicationSuffix,publicationRunning,articleRunning } from "./publication";

export const JOURNAL_MASTER:JournalMaster={
  enabled:true,publicationYpt:83.643,topRuleYpt:120.274,topRulePt:4,titleYpt:137.475,
  abstractWidthMm:104.273,abstractPadLeftMm:2.98,abstractPadRightMm:2.17,abstractPadTopMm:.74,abstractPadBottomMm:2.1393,sidebarGapMm:1.95,
  bottomRuleYpt:614.486,bottomRulePt:4,copyrightYpt:623.713,runningHeaderYpt:59.016,runningRuleYpt:72.785,runningRulePt:2,
  logoRightInsetPt:0,logoYpt:86.5,logoWidthPt:126.43,crossmarkRightInsetPt:-1.887,crossmarkYpt:52.404,crossmarkWidthPt:31.1,
  titleAfterPt:3.2,authorsAfterPt:1.75,affiliationsAfterPt:9.413,abstractLabelAfterPt:2.35,keywordsBeforePt:13.01,abstractAfterPt:8.71,correspondenceTopPt:1.87,correspondenceGapPt:10.5,
  journalName:"ACADEMIC EDITOR ULTRA",printIssn:"",onlineIssn:"",copyrightOwner:"",showLogo:false,showCrossmark:false,
  licenseText:""
};
/** Legacy name retained for project readers. */
export const HNMR_MASTER=JOURNAL_MASTER;
export const resolvedMaster=(p:JournalPreset):JournalMaster=>({...HNMR_MASTER,...p.master});
export const journalSpacing=(p:JournalPreset):NonNullable<JournalPreset["spacing"]>=>({floatBeforeMm:p.gapMm,floatAfterMm:p.gapMm,captionGapPt:3,noteGapPt:3,headingBeforePt:12,headingAfterPt:1,...p.spacing});
export const headingSpacing=(p:JournalPreset,level:number):{beforePt:number;afterPt:number;followingHeadingPt:number}=>({beforePt:journalSpacing(p).headingBeforePt,afterPt:journalSpacing(p).headingAfterPt,followingHeadingPt:1.9525,...p.headingSpacing?.[Math.min(5,Math.max(1,level)) as 1]});
export const headingTransition=(p:JournalPreset,from:number,to:number):number=>p.headingTransitionsPt?.[`${from}:${to}`]??headingSpacing(p,from).followingHeadingPt;
export function journalStyles(p:JournalPreset):Record<JournalStyleRole,JournalTextStyle>{
  const style=(font:string,sizePt:number,leadingPt:number,color=p.inkColor,bold=false,italic=false):JournalTextStyle=>({font,sizePt,leadingPt,color,bold,italic,align:"left",indentMm:0,trackingEm:0});
  const result:Record<JournalStyleRole,JournalTextStyle> = {
    body:{...style(p.body.font,p.body.sizePt,p.body.leadingPt),align:"justify",indentMm:p.body.indentMm,trackingEm:p.body.trackingEm},
    title:style(p.title.font,p.title.sizePt,p.title.sizePt*1.2,p.inkColor,true),
    abstract:{...style(p.abstract.font,p.abstract.sizePt,p.abstract.leadingPt,"#221f1f"),align:"justify"},
    table:style(p.body.font,p.table.sizePt,p.table.leadingPt),caption:style(p.body.font,p.caption.sizePt,p.caption.leadingPt),note:style(p.body.font,8,10),
    reference:style(p.body.font,p.references.sizePt,p.references.leadingPt),
    publication:style(p.title.font,8.7,10.44),authors:style(p.title.font,11,13.2),affiliations:style(p.title.font,10,12),
    abstractLabel:style(p.abstract.font,8.4,10.75,p.keyColor,true),keywords:style(p.abstract.font,8.54,10.8,"#000000",true),
    sidebar:style("Gill Sans MT",7.5,9),sidebarLabel:style("Gill Sans MT",7.5,9,p.keyColor,true),
    copyright:{...style("Gill Sans MT",10,12),align:"justify"},runningHeader:style("Gill Sans MT",9.3,11.16),pageNumber:style("Arial",9.3,11.16,"#000000"),
    heading1:style(p.title.font,12,14.4,p.keyColor,true),heading2:style(p.body.font,11,13.2,p.inkColor,true),
    heading3:style(p.body.font,10,12,p.inkColor,true,true),heading4:style(p.body.font,10,12,p.inkColor,true),heading5:style(p.body.font,10,12,p.inkColor,true,true),
    ...p.textStyles
  };
  for(const [group,roles]of Object.entries(FONT_GROUPS)){const font=p.appearance?.fonts[group as keyof typeof FONT_GROUPS];if(font)for(const role of roles)result[role]={...result[role],font};}
  for(const role of Object.keys(result) as JournalStyleRole[]){const replacement=p.appearance?.substitutions?.[result[role].font];if(replacement)result[role]={...result[role],font:replacement};}
  return result;
}
/** Derived for one composition; also handed to editable writers so they use the
 * exact resolved roles and spacing that produced the reference PDF. */
export function resolveJournalSpec(p:JournalPreset){
  return {master:resolvedMaster(p),styles:journalStyles(p),spacing:journalSpacing(p),headings:Array.from({length:5},(_,i)=>headingSpacing(p,i+1))};
}
export type ResolvedJournalSpec=ReturnType<typeof resolveJournalSpec>;
export function styled(s:JournalTextStyle,markup:string):string{
  // Typst ignores paragraph breaks nested inside a single par. Keep each
  // Markdown abstract paragraph separate, including in measurement passes.
  const body=markup.includes("#v(")?markup:markup.split('#parbreak()').map(part=>`#par[${part}]`).join('#parbreak()');
  return `[#set text(font:journal-font(${literal(s.font)}),size:${pt(s.sizePt)},fill:rgb(${literal(s.color)}),weight:"${s.bold?"bold":"regular"}",style:"${s.italic?"italic":"normal"}",tracking:${s.trackingEm}em,top-edge:0.75em,bottom-edge:-0.25em);
#set par(leading:${pt(s.leadingPt-s.sizePt)},spacing:0pt,justify:${s.align==="justify"},first-line-indent:(amount:${s.indentMm}mm,all:true));
#align(${s.align==="justify"?"left":s.align})[${body}]]`;
}
export function masterBackground(project:JournalProject,headers?:{even:string;odd:string},pageCount?:number):string{
  const p=project.preset,m=resolvedMaster(p),d=project.document,s=journalStyles(p),a=p.appearance;
  if(!m.enabled)return "";
  const left=p.page.marginLeftMm*MM,width=(p.page.widthMm-p.page.marginLeftMm-p.page.marginRightMm)*MM,right=left+width;
  const place=(x:number,y:number,w:number,content:string):string=>`#place(top+left,dx:${pt(x)},dy:${pt(y)})[#block(width:${pt(w)},${content})]`;
  const rule=(y:number,size:number):string=>place(left,y,width,`[#line(length:100%,stroke:${pt(size)}+rgb(${literal(a?.colors.rule??p.keyColor)}))]`);
  const suffix=publicationSuffix(d,d.firstPage+(pageCount??1)-1);
  // The counter is resolved in the final document, including any bibliography pages.
  const defaultPublication=styled(s.publication,`#text(weight:"bold",fill:rgb(${literal(p.keyColor)}),${literal(m.journalName)})${publicationMode(d)==="aop"?`#text(${literal(suffix)})`:`#text(${literal(suffix.replace(/\d+\.$/,""))})#context (counter(page).final().first()+${d.firstPage}-1)#text(".")`}#linebreak()#text(${literal(`pISSN ${m.printIssn} · eISSN ${m.onlineIssn}`)})${d.doi?`#linebreak()#text(${literal("https://doi.org/"+canonicalDoi(d.doi))})`:""}`);
  const last=d.firstPage+(pageCount??1)-1;
  const publication=a?.publicationText!==undefined?styled(s.publication,`#text(${literal(resolveTemplateText(a.publicationText,project,d.firstPage,last))})`):defaultPublication;
  const assetPath=(id:string|undefined,fallback:string):string=>id?(()=>{const asset=project.assets.find(a=>a.id===id);return asset?.mime==="application/pdf"?pdfMeasurePath(asset):"/"+(asset?.path??"missing-master-asset");})():fallback;
  const image=(id:string|undefined,fallback:string,width:number,maxHeight:number):string=>`${project.assets.some(asset=>asset.id===id&&asset.mime==="application/pdf")?`#context {let pos=here().position();metadata((kind:"pdf-artwork",nodeId:${literal(id!)},page:here().page(),x:pos.x/1pt,y:pos.y/1pt,width:${width},height:${maxHeight}))}`:""}#image(${literal(assetPath(id,fallback))},width:${pt(width)}${id?`,height:${pt(maxHeight)},fit:"contain"`:""})`;
  const logo=m.showLogo===false?"":place(right-m.logoRightInsetPt-m.logoWidthPt,m.logoYpt,m.logoWidthPt,`[${image(m.logoAssetId,"/brand/hnmr-logo.svg",m.logoWidthPt,Math.max(1,m.topRuleYpt-m.topRulePt/2-m.logoYpt-4))}]`);
  const markImage=image(m.crossmarkAssetId,"/brand/crossmark.svg",m.crossmarkWidthPt,m.crossmarkWidthPt);
  const link="https://crossmark.crossref.org/dialog/?doi="+encodeURIComponent(canonicalDoi(d.doi))+"&domain=pdf";
  const mark=m.showCrossmark===false?"":place(right-m.crossmarkRightInsetPt-m.crossmarkWidthPt,m.crossmarkYpt,m.crossmarkWidthPt,`[${d.doi&&(!a||(a.mark.mode==="crossmark"||a.mark.crossmark===true))?`#link(${literal(link)})[${markImage}]`:markImage}]`);
  const defaultCopyright=styled(s.copyright,`#text(${literal(`Copyright © ${copyrightYear(d)} ${m.copyrightOwner}`)})#linebreak()#text(${literal(m.licenseText)})`);
  const copyright=a?.copyrightText!==undefined?styled(s.copyright,`#text(${literal(resolveTemplateText(a.copyrightText,project,d.firstPage,last))})`):defaultCopyright;
  const defaultHeader=styled(s.runningHeader,`#context if calc.rem(counter(page).get().first()+${d.firstPage}-1,2)==0 {text(${literal(headers?.even??publicationRunning(d,m.journalName))})} else {text(${literal(headers?.odd??articleRunning(d))})}`);
  const defaultNumber=publicationMode(d)==="aop"?"[]":styled({...s.pageNumber,align:"right"},`#context (counter(page).get().first()+${d.firstPage}-1)`);
  const dynamicHeader=(side:"left"|"right"):string=>{
    const style=side==="left"?s.runningHeader:{...s.pageNumber,align:"right" as const};
    const texts=Array.from({length:pageCount??1},(_,i)=>customHeader(project,side,d.firstPage+i,last)??(side==='left'?((d.firstPage+i)%2?headers?.odd??articleRunning(d):headers?.even??publicationRunning(d,m.journalName)):publicationMode(d)==='aop'?'':String(d.firstPage+i)));
    return styled(style,`#context text((${texts.map(literal).join(",")},).at(calc.min(counter(page).get().first()-1,${texts.length-1})))`);
  };
  const header=(a&&a.leftHeader.mode!=="legacy"||d.journalMetadata?.overrides['header-even']!==undefined||d.journalMetadata?.overrides['header-odd']!==undefined)?dynamicHeader("left"):defaultHeader;
  const number=a&&a.rightHeader.mode!=="page"?dynamicHeader("right"):defaultNumber;
  const rightWidth=a&&["text","text-page"].includes(a.rightHeader.mode)?width*.35:22;
  return `#set page(background:context if counter(page).get().first()==1 {[${place(left,m.publicationYpt,a?.publicationText!==undefined&&m.showLogo!==false?width-m.logoWidthPt-10:width,publication)}${logo}${mark}${rule(m.topRuleYpt,m.topRulePt)}${rule(m.bottomRuleYpt,m.bottomRulePt)}${place(left,m.copyrightYpt,width, copyright)}]} else {[${place(left,m.runningHeaderYpt,width-rightWidth-6,header)}${place(right-(rightWidth+3),m.runningHeaderYpt,rightWidth,number)}${rule(m.runningRuleYpt,m.runningRulePt)}]})\n`;
}
