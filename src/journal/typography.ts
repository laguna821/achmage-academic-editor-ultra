import {type JournalEngine} from './engine';
import {compositionQuality,typographyCandidates,boundedSearch,NO_ADJUSTMENT,type TypeAdjustment} from './quality';
import {literal,pt,paragraphContent} from './typst';
import {inlineText,type CompositionAdjustment,type JournalProject,type Paragraph} from './types';
import {digestBytes} from './storage';

type TypographyResult = Awaited<ReturnType<typeof chooseTypography>>;
/** One successful result, bounded to this composer. Failed/cancelled or superseded
 * work cannot publish a cache entry. Consumers receive independent mutable data. */
export class TypographyMemo {
  private entry: {key:string;result:TypographyResult}|null=null;
  private generation=0;
  readonly stats={hits:0,misses:0};
  async get(key:string,compute:()=>Promise<TypographyResult>,check:()=>void):Promise<TypographyResult>{
    check();
    if(this.entry?.key===key){this.stats.hits++;return structuredClone(this.entry.result);}
    const generation=++this.generation;this.entry=null;this.stats.misses++;
    const result=await compute();check();
    if(generation===this.generation)this.entry={key,result:structuredClone(result)};
    return result;
  }
}

/** Include rendered content as well as raw runs: changes, style resolution and
 * citation/asset paths can change the expression without changing paragraph IDs. */
export async function typographyKey(base:string,width:number,fontFingerprint:string,files:{path:string;sha256?:string;bytes:Uint8Array}[],project:JournalProject,nodes:Paragraph[]):Promise<string>{
  const dependencies=await Promise.all(files.map(async f=>[f.path,f.sha256??await digestBytes(f.bytes)]));
  return digestBytes(new TextEncoder().encode(JSON.stringify([base,width,fontFingerprint,dependencies,compositionQuality(project),nodes.map(n=>[n,paragraphContent(n,project,false,NO_ADJUSTMENT,width)])])));
}

interface Word {kind?:string;key?:string;x?:number;y?:number;width?:number}
interface Sample {adjust:TypeAdjustment;height:number;severe:number;spacing:number;distortion:number}
/** Evaluate actual word positions after the line breaker. Each bounded window
 * contains at most six paragraphs (well below three ordinary two-column pages).
 * Measurement and final rendering share the exact same Typst expression. */
export async function chooseTypography(engine:JournalEngine,base:string,files:{path:string;bytes:Uint8Array}[],project:JournalProject,nodes:Paragraph[],width:number,check:()=>void):Promise<{values:Map<string,TypeAdjustment>;adjustments:CompositionAdjustment[]}>{
  const q=compositionQuality(project),values=new Map<string,TypeAdjustment>(),adjustments:CompositionAdjustment[]=[];
  if(!q.enabled)return {values,adjustments};
  const eligible=nodes.filter(n=>typographyCandidates(q,n).length>1&&inlineText(n.content).trim().length>80);
  for(let start=0;start<eligible.length;start+=6){
    check();const window=eligible.slice(start,start+6),samples=new Map<string,Sample[]>();
    const sample=async(entries:{node:Paragraph;a:TypeAdjustment}[]):Promise<void>=>{
      const requests=entries.map((e,i)=>({...e,key:String(i),expr:paragraphContent(e.node,project,false,e.a,width)}));
      const source=base+`\n#set page(height:10000pt,margin:0pt)\n#set block(above:0pt,below:0pt)\n`+requests.map(r=>{
        const key=literal(r.key);
        return `#block(width:${pt(width)})[#show regex("\\\\S+"): it => context {let pos=here().position();metadata((kind:"quality-word",key:${key},x:pos.x/1pt,y:pos.y/1pt,width:measure(it).width/1pt));it}\n#${r.expr}]\n#context metadata((kind:"quality-height",key:${key},height:measure(block(width:${pt(width)},${r.expr})).height/1pt))\n#pagebreak()\n`;
      }).join('');
      const result=await engine.compile(source,files,false);check();
      const meta=(Array.isArray(result.metadata)?result.metadata:[]) as (Word&{height?:number})[];
      const size=project.preset.body.sizePt;
      for(const r of requests){
        const words=meta.filter(m=>m.kind==='quality-word'&&m.key===r.key),height=meta.find(m=>m.kind==='quality-height'&&m.key===r.key)?.height;
        if(height===undefined||!Number.isFinite(height))throw new Error('자동 보정 후보의 높이를 측정하지 못했습니다.');
        let severe=0,spacing=0;
        for(let i=1;i<words.length;i++){
          const a=words[i-1],b=words[i];
          if(typeof a.y!=='number'||typeof b.y!=='number'||Math.abs(a.y-b.y)>.2)continue;
          const gap=(b.x!-a.x!-a.width!)*r.a.scaleX;
          if(gap<0||gap>width/2)continue;
          if(gap>size)severe++;
          spacing+=Math.max(0,gap-size*.55)**2;
        }
        const distortion=Math.abs(r.a.trackingEm)/.005+Math.abs(r.a.scaleX-1)/.005;
        const list=samples.get(r.node.id)??[];list.push({adjust:r.a,height,severe,spacing,distortion});samples.set(r.node.id,list);
      }
    };
    // Measure the untouched paragraph first. Healthy paragraphs need no
    // alternative shapes, keeping long manuscripts within bounded memory.
    await sample(window.map(node=>({node,a:NO_ADJUSTMENT})));
    const size=project.preset.body.sizePt;
    const alternatives=window.filter(n=>{const s=samples.get(n.id)![0];return s.severe||s.spacing>size*size;}).flatMap(node=>typographyCandidates(q,node).slice(1).map(a=>({node,a})));
    if(alternatives.length)await sample(alternatives);
    const choices=window.map(n=>{
      const list=samples.get(n.id)!,original=list[0];
      // If ordinary spacing is already healthy, leave typography alone. A
      // shorter paragraph by itself is not a reason to compress all the text.
      const allowed=original.severe||original.spacing>size*size?list:[original];
      return allowed.map((sample,index)=>({value:{id:n.id,sample},key:String(index).padStart(2,'0'),cost:[sample.severe,Math.round(sample.spacing*100)/100,sample.distortion]}));
    });
    const selected=boundedSearch(choices,()=>true);
    for(const n of window)values.set(n.id,NO_ADJUSTMENT);
    // Never apply an incomplete search path after the deterministic work cap.
    if(selected.values.length!==window.length)continue;
    for(const {id,sample}of selected.values){
      values.set(id,sample.adjust);
      if(sample.distortion)adjustments.push({nodeId:id,rule:'paragraph-word-spacing',before:'tracking 0em / width 100%',after:`tracking ${sample.adjust.trackingEm}em / width ${Math.round(sample.adjust.scaleX*1000)/10}%`,reason:'실제 줄바꿈 뒤 단어 사이의 과도한 간격을 줄이는 제한 보정'});
    }
  }
  return {values,adjustments};
}
