import type {EditRun,EditStyle} from '../io/editableLayout';
import type {JournalProject,Paragraph,Inline} from './types';
import type {TypeAdjustment} from './quality';
import {paragraphPresentation} from './typst';
import {visibleInlines} from './types';
const MM=72/25.4;
// Defaults in the compiler pinned by typst.ts 0.7.0 (Typst 0.14.2 fork).
// typst-library/src/model/par.rs: Limits<Rel>::SPACING_DEFAULT.
export const EDITABLE_WORD_SPACING={min:2/3,desired:1,max:1.5} as const;

/** Match inline display conventions used by textContent (tabs and 10pt images). */
export function captureInlines(content:Inline[],project:JournalProject):EditRun[]{
  return visibleInlines(content,project.changes).map(r=>{
    const asset=r.assetId?project.assets.find(a=>a.id===r.assetId):undefined;
    const aspect=asset?.aspectRatio??(asset?.widthPx&&asset.heightPx?asset.widthPx/asset.heightPx:1);
    return {text:r.break?'\n':r.text.replace(/\t/g,'    '),bold:r.bold,italic:r.italic,superscript:r.superscript,subscript:r.subscript,href:r.href,...(r.assetId?{imageId:r.assetId,imageWidth:10*aspect,imageHeight:10}:{})};
  });
}

export interface CapturedParagraph {
  sourceId:string;start:number;end:number;continued:boolean;runs:EditRun[];style:EditStyle;
}

/** Capture the exact fragment used for composition, including list markers,
 * first-line behavior and the selected terminal-column typography adjustment. */
export function captureParagraph(node:Paragraph,project:JournalProject,start:number,end:number,continued:boolean,adjustment:TypeAdjustment):CapturedParagraph{
  const p=paragraphPresentation(node,project,continued,adjustment),s=p.style;
  return {sourceId:node.id,start,end,continued,runs:[...(p.label?[{text:p.label}]:[]),...captureInlines(p.runs,project)],
    style:{font:s.font,size:s.sizePt,leading:p.leading,color:s.color,bold:s.bold,italic:s.italic,align:s.align,
      indent:(p.firstIndent-p.hang)*MM,leftIndent:(p.left+p.hang)*MM,tracking:p.tracking,horizontalScale:p.scaleX,before:0,after:0,
      blockTop:s.sizePt*(node.kind==='heading'?.75:.8),blockBottom:s.sizePt*(node.kind==='heading'?.25:.2),
      hyphenate:s.align==='justify',language:project.preset.body.language,wordSpacing:{...EDITABLE_WORD_SPACING},keepNext:node.kind==='heading',keepTogether:node.kind==='heading'}};
}
