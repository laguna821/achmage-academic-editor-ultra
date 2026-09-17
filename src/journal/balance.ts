import {type LayoutBox} from './types';

export interface BalancedBox extends LayoutBox {content:string;editableText?:import('./editableCapture').CapturedParagraph}
export interface BalanceItem {nodeId:string;kind:string;text?:string;fragment:number;offset:number}
export interface BalancePart {box:Omit<BalancedBox,'id'|'page'|'x'|'y'|'width'>;rest:BalanceItem|null}
export interface BalanceInput {
  page:number;left:number;right:number;width:number;top:number;bottom:number;line:number;
  leadingLimit:number;spaceLimit:number;items:BalanceItem[];
  part:(item:BalanceItem,available:number,leading:number,position:{start:boolean;y:number;previous?:BalancedBox})=>Promise<BalancePart|null>;
  check:()=>void;
}
/** Terminal text band only. Full-width floats, hard breaks, pins and altered
 * frames are handled as barriers by the caller. No text order is changed. */
export async function balanceTerminalBand(input:BalanceInput):Promise<{boxes:BalancedBox[];difference:number;leading:number;space:number;expansions:number}|null>{
  let expansions=0;
  const trial=async(cap:number,leading:number,space:number):Promise<BalancedBox[]|null>=>{
    const boxes:BalancedBox[]=[];let column=0,y=input.top;
    for(const original of input.items){
      let item:BalanceItem|null={...original};
      while(item){
        input.check();if(++expansions>4000)return null;
        const part=await input.part(item,input.top+cap-y,leading,{start:y<=input.top+.01,y,previous:boxes.at(-1)});
        if(!part){if(++column>1)return null;y=input.top;continue;}
        const b=part.box;
        if(b.height<=0||b.height>input.top+cap-y+.1)return null;
        const after=b.kind==='heading'?0:Math.max(-1,space);
        boxes.push({...b,id:`${b.nodeId}:balance:${boxes.length}`,page:input.page,x:column?input.right:input.left,y,width:input.width,contentY:y+(b.contentY??0)});
        y+=Math.max(b.contentHeight??b.height,b.height+after);
        item=part.rest;
        if(item){if(++column>1)return null;y=input.top;}
      }
    }
    return boxes;
  };
  const end=(boxes:BalancedBox[],right:boolean):number=>Math.max(input.top,...boxes.filter(b=>(b.x>input.left+.1)===right).map(b=>(b.contentY??b.y)+(b.contentHeight??b.height)));
  let best:{boxes:BalancedBox[];difference:number;leading:number;space:number;expansions:number}|null=null;
  // Zero distortion first. Only explore micro-leading/spacing if a paragraph
  // boundary prevents a one-line match. Both columns always use one leading.
  const variants=[{leading:0,space:0}];
  for(let n=1;n<=Math.floor((input.leadingLimit+1e-8)/.1);n++)for(const sign of [-1,1])variants.push({leading:n*.1*sign,space:0});
  for(const space of [-input.spaceLimit,input.spaceLimit])if(space)variants.push({leading:0,space});
  for(const {leading,space}of variants){
    let low=input.line*2,high=input.bottom-input.top;
    if(!await trial(high,leading,space))continue;
    for(let n=0;n<11&&high-low>.2;n++){const mid=(low+high)/2;if(await trial(mid,leading,space))high=mid;else low=mid;}
    for(const cap of [high,high+input.line*.5,high+input.line]){
      if(cap>input.bottom-input.top+.1)continue;
      const boxes=await trial(cap,leading,space);if(!boxes)continue;
      const difference=Math.abs(end(boxes,false)-end(boxes,true));
      const distortion=Math.abs(leading)*10+Math.abs(space),prior=best?Math.abs(best.leading)*10+Math.abs(best.space):Infinity;
      if(!best||difference<best.difference-.1||(Math.abs(difference-best.difference)<=.1&&distortion<prior))best={boxes,difference,leading,space,expansions};
    }
    if(best&&best.difference<=input.line+.1)break;
  }
  return best?{...best,expansions}:null;
}
