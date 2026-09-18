import type {LayoutBox,LayoutOverride} from './types';

export type PlacementLane='left'|'right'|'full';
export interface PlacementRect {x:number;y:number;width:number;height:number}
export interface PlacementPage {page:number;bounds:PlacementRect;columns:[PlacementRect,PlacementRect];obstacles:(PlacementRect&{nodeId:string})[]}
export const overlaps=(a:PlacementRect,b:PlacementRect):boolean=>a.x<b.x+b.width-.5&&a.x+a.width>b.x+.5&&a.y<b.y+b.height-.5&&a.y+a.height>b.y+.5;
export function boxLane(box:LayoutBox,page:PlacementPage):PlacementLane{
  return box.width>page.columns[0].width+1?'full':box.x>=page.columns[1].x-1?'right':'left';
}
/** PDF points throughout; scrolling and zoom are handled only at the pointer boundary. */
export function snapPlacement(box:LayoutBox,page:PlacementPage,lane:PlacementLane,y:number):{override:LayoutOverride;valid:boolean}{
  const column=lane==='full'?page.bounds:page.columns[lane==='left'?0:1];
  const scaled=box.height*(column.width/box.width),height=Math.max(24,Math.min(scaled,column.height));
  const top=Math.max(column.y,Math.min(y,column.y+column.height-height));
  const override:LayoutOverride={id:box.nodeId,page:page.page,x:column.x,y:top,width:column.width,height,locked:true,snapLane:lane};
  return {override,valid:column.height>=24&&!page.obstacles.some(r=>r.nodeId!==box.nodeId&&overlaps({...override,height},r))};
}
export function edgeScrollSpeed(y:number,top:number,bottom:number):number{
  const edge=Math.min(48,(bottom-top)/4);
  return y<top+edge?-720*Math.min(1,(top+edge-y)/edge):y>bottom-edge?720*Math.min(1,(y-bottom+edge)/edge):0;
}
