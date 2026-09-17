import {cloneJournal,inlineText,type CompositionAdjustment,type CompositionQuality,type JournalNode,type JournalProject,type Paragraph} from './types';

export const QUALITY_DEFAULTS:CompositionQuality={version:1,enabled:true,balanceColumns:true,anchorFloats:true,trackingLimitEm:.01,horizontalScaleLimit:.01,leadingLimitPt:.2,spaceLimitPt:1,disabledNodes:[]};
/** Missing settings means a pre-quality saved project, never silently opt it in. */
export function compositionQuality(project:JournalProject):CompositionQuality{return project.preset.compositionQuality??{...cloneJournal(QUALITY_DEFAULTS),enabled:false};}
export interface TypeAdjustment {trackingEm:number;scaleX:number;leadingPt:number}
export const NO_ADJUSTMENT:TypeAdjustment={trackingEm:0,scaleX:1,leadingPt:0};
export function typographyCandidates(q:CompositionQuality,node:Paragraph):TypeAdjustment[]{
  if(!q.enabled||q.disabledNodes.includes(node.id)||node.kind!=='paragraph'||(node.role&&node.role!=='body')||node.content.some(r=>r.assetId||r.superscript||r.subscript||r.citationIds?.length)||/[=∑∫√±]/.test(inlineText(node.content)))return [NO_ADJUSTMENT];
  const offsets=(limit:number,step:number):number[]=>[0,...Array.from({length:Math.floor((limit+1e-8)/step)},(_,i)=>[(i+1)*step,-(i+1)*step]).flat()];
  return offsets(q.trackingLimitEm,.005).flatMap(trackingEm=>offsets(q.horizontalScaleLimit,.005).map(scale=>({trackingEm,scaleX:1+scale,leadingPt:0})));
}

/** Reorder floats only; preserve all body text, heading and number sequences.
 * Pins, explicit breaks and section starts are barriers. Ambiguous mentions
 * retain the source position and are exposed for editorial review. */
export function anchorFloats(project:JournalProject):{nodes:JournalNode[];adjustments:CompositionAdjustment[];unanchored:string[]}{
  const source=project.document.blocks,q=compositionQuality(project);
  if(!q.enabled||!q.anchorFloats)return {nodes:source.slice(),adjustments:[],unanchored:[]};
  const adjustments:CompositionAdjustment[]=[],unanchored:string[]=[],nodes:JournalNode[]=[];
  const pins=new Set(project.overrides.filter(o=>o.locked).map(o=>o.id));
  const segments:JournalNode[][]=[[]];
  for(const n of source){if(n.kind==='break'||pins.has(n.id)||(project.preset.sectionNewPage&&n.kind==='heading'&&n.level===1)){segments.push([n],[]);}else segments.at(-1)!.push(n);}
  for(const segment of segments){
    const targets=new Map<string,JournalNode[]>(),moved=new Set<string>();
    for(const [i,float]of segment.entries()){
      if(!['table','figure'].includes(float.kind)||pins.has(float.id)||q.disabledNodes.includes(float.id))continue;
      if(float.kind!=='table'&&float.kind!=='figure')continue;
      const explicit=segment.filter(n=>n.kind==='anchor'&&n.targetIds.length===1&&n.targetIds[0]===float.id);
      if(explicit.length){
        const target=explicit[0];const list=targets.get(target.id)??[];list.push(float);targets.set(target.id,list);moved.add(float.id);
        adjustments.push({nodeId:float.id,rule:'float-insert-anchor',before:i,after:segment.indexOf(target)+1,reason:'원고의 명시적 삽입 지점을 사용'});continue;
      }
      const number=(float.caption?.sourceNumber??float.caption?.number)?.trim();
      if(!number||!/^[\dA-Za-z]+$/.test(number)){unanchored.push(float.id);continue;}
      if(segment[i-1]?.kind==='heading'){unanchored.push(float.id);continue;}
      const pattern=new RegExp('\\b'+(float.kind==='table'?'Table':'(?:Figure|Fig\\.?)')+'\\s+'+number+'(?![\\dA-Za-z])','i');
      // Linked callouts already identify their object. Their displayed number
      // can change after layout and must not become a raw-number anchor for
      // another object on the next pass.
      const mentions=segment.filter((n):n is Paragraph=>n.kind==='paragraph'&&(!n.role||n.role==='body')&&(n.content.some(r=>r.objectReference?.ids.includes(float.id))||pattern.test(inlineText(n.content.map(r=>r.objectReference?{text:'\uFFFC'}:r)))));
      if(!mentions.length){unanchored.push(float.id);continue;}
      const target=mentions[0];if(segment.indexOf(target)===i-1)continue;
      const list=targets.get(target.id)??[];list.push(float);targets.set(target.id,list);moved.add(float.id);
      adjustments.push({nodeId:float.id,rule:'float-first-mention',before:i,after:segment.indexOf(target)+1,reason:'본문의 첫 Table/Figure 호출 바로 뒤에서 현재·다음 페이지 후보를 탐색'});
    }
    for(const node of segment)if(!moved.has(node.id)){nodes.push(node,...(targets.get(node.id)??[]));}
  }
  return {nodes,adjustments,unanchored};
}

export const SEARCH_LIMITS={pages:3,beam:32,expansions:4000} as const;
export interface SearchChoice<T>{value:T;cost:number[];key:string}
/** Lexicographic, bounded, deterministic beam. No clocks or random IDs. */
export function boundedSearch<T>(steps:SearchChoice<T>[][],hard:(values:T[])=>boolean):{values:T[];expansions:number;limited:boolean}{
  let beam:{values:T[];cost:number[];key:string}[]=[{values:[],cost:[],key:''}],expansions=0,limited=false;
  const compare=(a:typeof beam[number],b:typeof beam[number]):number=>{for(let i=0;i<Math.max(a.cost.length,b.cost.length);i++){const d=(a.cost[i]??0)-(b.cost[i]??0);if(Math.abs(d)>1e-8)return d;}return a.key<b.key?-1:a.key>b.key?1:0;};
  for(const choices of steps){
    const next:typeof beam=[];
    outer:for(const state of beam)for(const choice of choices){
      if(expansions>=SEARCH_LIMITS.expansions){limited=true;break outer;}expansions++;
      const values=[...state.values,choice.value];if(!hard(values))continue;
      next.push({values,cost:choice.cost.map((v,i)=>v+(state.cost[i]??0)),key:state.key+'|'+choice.key});
    }
    if(!next.length)break;beam=next.sort(compare).slice(0,SEARCH_LIMITS.beam);
  }
  return {values:beam.sort(compare)[0]?.values??[],expansions,limited};
}
