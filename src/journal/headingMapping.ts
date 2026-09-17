import { inlineText, type Paragraph } from "./types";

// DOCX authors frequently format section labels without assigning Heading styles.
// Preserve the source runs and expose every inferred role for editorial review.
export function inferManuscriptHeading(p:Paragraph):number|undefined{
  if(p.kind!=="paragraph"||p.list||p.role&&p.role!=="body")return;
  const text=inlineText(p.content).replace(/[\u200b\ufeff]/g,"").trim();
  if(!text||text.length>160||text.split(/\s+/).length>20||/[.!?;]$/.test(text)||p.content.some(r=>r.break||r.assetId||r.changeIds?.length))return;
  if(/^(?:table|figure|fig\.|note|RQ\s*\d|H\s*\d)\b/i.test(text))return;
  const number=text.match(/^(\d{1,2}(?:\.\d{1,2})*)\.?\s+(?=\p{L})/u);
  const label=text.slice(number?.[0].length??0).replace(/[:：]$/,"").trim();
  const major=/^(?:introduction|background|theoretical framework|literature review|methods?|methodology|materials and methods|results?|findings|discussion|conclusions?|practical implications|limitations|ethical considerations|ethics statement|data availability(?: statement)?|funding(?: information)?|conflicts? of interest|acknowledg(?:e)?ments|서론|연구 방법|연구 결과|논의|결론)$/i.test(label);
  const runs=p.content.filter(r=>r.text.replace(/[\s\u200b\ufeff]/g,"").length);
  const bold=runs.length>0&&runs.every(r=>r.bold),italic=runs.length>0&&runs.every(r=>r.italic);
  // Decimal numbering is explicit hierarchy; a bare numbered sentence/list is not.
  if(number&&(major||bold||number[1].includes(".")))return Math.min(5,number[1].split(".").length);
  if(major)return 1;
  if(bold||italic)return bold&&italic?3:2;
}
