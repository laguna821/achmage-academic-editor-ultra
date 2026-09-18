import {t} from './i18n';
import {boxLane,snapPlacement,edgeScrollSpeed,type PlacementLane} from './placement';
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import * as pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import type { LayoutBox, LayoutOverride, LayoutResult } from "./types";
(window as unknown as {pdfjsWorker:typeof pdfWorker}).pdfjsWorker=pdfWorker;

/** Page pixels always come from the exact PDF subsequently exported. */
export class JournalPreview{
  private pdf:PDFDocumentProxy|null=null;
  private observer:IntersectionObserver|null=null;
  private generation=0;
  private cleanups:(()=>void)[]=[];
  private result:LayoutResult|null=null;
  private tools:HTMLElement|null=null;
  private selectedBox:LayoutBox|null=null;
  private dragCancel:(()=>void)|null=null;
  constructor(private readonly host:HTMLElement,private readonly select:(id:string,navigate?:boolean)=>void,private readonly change:(override:LayoutOverride)=>void){}
  async show(result:LayoutResult):Promise<void>{
    const scroll=this.host.scrollTop,selected=this.selectedBox?.nodeId;
    this.clear();this.result=result;const generation=this.generation;
    this.tools=this.host.createDiv({cls:'aaeu-placement-tools',attr:{role:'toolbar','aria-label':t('배치')}});this.renderTools();
    const pdf=await getDocument({data:result.pdf.slice(),isEvalSupported:false,useSystemFonts:false,disableFontFace:false}).promise;
    if(generation!==this.generation){await pdf.destroy();return;}this.pdf=pdf;
    const queues=new Map<HTMLElement,Promise<void>>(),visible=new Set<HTMLElement>();
    const draw=(holder:HTMLElement):void=>{
      const task=(queues.get(holder)??Promise.resolve()).catch(()=>undefined).then(async()=>{
        if(generation!==this.generation||!holder.isConnected)return;
        const pg=await pdf.getPage(Number(holder.dataset.page));if(generation!==this.generation)return;
        const base=pg.getViewport({scale:1});
        // Match actual screen pixels, including expanded proof and high-DPI displays.
        // Bound the page bitmap and keep rendering lazy for long manuscripts.
        const scale=Math.min(3,Math.max(1,holder.getBoundingClientRect().width*(window.devicePixelRatio||1)/base.width));
        const viewport=pg.getViewport({scale}),canvas=holder.querySelector("canvas")!,width=Math.ceil(viewport.width);
        if(holder.dataset.renderWidth===String(width))return;
        canvas.width=width;canvas.height=Math.ceil(viewport.height);
        const context=canvas.getContext("2d");if(!context)return;
        const render=pg.render({canvasContext:context,viewport});
        const cancel=():void=>render.cancel();this.cleanups.push(cancel);
        try{await render.promise;if(generation===this.generation)holder.dataset.renderWidth=String(width);}
        finally{const i=this.cleanups.indexOf(cancel);if(i>=0)this.cleanups.splice(i,1);}
      });queues.set(holder,task);void task.catch(()=>undefined);
    };
    this.observer=new IntersectionObserver(entries=>{for(const e of entries){const holder=e.target as HTMLElement;if(e.isIntersecting){visible.add(holder);draw(holder);}else visible.delete(holder);}},{root:this.host,rootMargin:"500px"});
    const resize=new ResizeObserver(()=>{for(const holder of visible)draw(holder);});resize.observe(this.host);this.cleanups.push(()=>resize.disconnect());
    for(let n=1;n<=pdf.numPages;n++){
      const pg=await pdf.getPage(n);if(generation!==this.generation)return;
      const viewport=pg.getViewport({scale:1}),holder=this.host.createDiv();
      holder.className="aaeu-journal-page";holder.dataset.page=String(n);holder.style.aspectRatio=String(viewport.width/viewport.height);
      const canvas=holder.createEl("canvas");canvas.setAttribute("aria-label",t("PDF {page}쪽",{page:n}));holder.append(canvas);this.host.append(holder);
      for(const box of result.boxes.filter(b=>b.page===n&&["figure","table","text-frame","metadata","paragraph","heading","reference","caption"].includes(b.kind)))this.overlay(holder,box,viewport.width,viewport.height);
      this.observer.observe(holder);
    }
    this.host.scrollTop=scroll;
    if(selected){const box=result.boxes.find(b=>b.nodeId===selected);if(box)this.selectObject(box);}
  }
  private overlay(holder:HTMLElement,box:LayoutBox,pageWidth:number,pageHeight:number):void{
    const handle=holder.createDiv();handle.className="aaeu-journal-box"+(box.kind==="text-frame"?" is-frame":"");
    handle.tabIndex=0;handle.setAttribute("role","button");handle.setAttribute("aria-label",t("표·그림 위치 조정"));handle.dataset.nodeId=box.nodeId;
    const position=(x:number,y:number,w:number,h:number):void=>{handle.style.left=x/pageWidth*100+"%";handle.style.top=y/pageHeight*100+"%";handle.style.width=w/pageWidth*100+"%";handle.style.height=h/pageHeight*100+"%";};
    position(box.x,box.y,box.width,box.height);
    if(["metadata","paragraph","heading","reference","caption"].includes(box.kind)){
      handle.classList.add(box.kind==="metadata"?"is-metadata":"is-text");handle.setAttribute("aria-label",box.kind==="metadata"?t(box.text??"발행정보 수정"):t("원문 편집"));handle.title=box.kind==="metadata"?t(box.text??"발행정보 수정"):t("원문 편집");
      handle.onclick=()=>this.select(box.nodeId);handle.onkeydown=event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();this.select(box.nodeId);}};return;
    }
    if(box.kind==='text-frame')return;
    handle.onpointerdown=event=>{
      if(event.button!==0||!this.result?.placementPages)return;
      event.preventDefault();event.stopPropagation();
      const first=this.result.boxes.find(b=>b.nodeId===box.nodeId&&b.kind===box.kind)!;
      this.selectObject(first);this.select(box.nodeId,false);
      if((box.fragment??0)>0){this.focusNode(first.nodeId,this.result.boxes);return;}
      const origin=this.result.placementPages.find(p=>p.page===box.page);if(!origin)return;
      const lane=boxLane(box,origin),startY=event.clientY,grab=(startY-holder.getBoundingClientRect().top)*pageWidth/holder.getBoundingClientRect().width-box.y;
      let clientY=startY,moved=false,last=performance.now(),raf=0,candidate:ReturnType<typeof snapPlacement>|undefined;
      const ghost=holder.createDiv({cls:'aaeu-placement-ghost'});ghost.setAttribute('aria-hidden','true');
      handle.setPointerCapture(event.pointerId);
      const reset=():void=>{this.host.win.cancelAnimationFrame(raf);ghost.remove();handle.classList.remove('is-dragging');handle.onpointermove=null;handle.onpointerup=null;handle.onpointercancel=null;handle.removeEventListener('lostpointercapture',reset);this.host.ownerDocument.removeEventListener('keydown',escape);if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);this.dragCancel=null;};
      const escape=(e:KeyboardEvent):void=>{if(e.key==='Escape'){e.preventDefault();reset();}};
      this.dragCancel=reset;this.host.ownerDocument.addEventListener('keydown',escape);handle.addEventListener('lostpointercapture',reset);
      const frame=(time:number):void=>{
        const dt=Math.min(32,time-last)/1000;last=time;
        if(moved){
          const host=this.host.getBoundingClientRect();this.host.scrollTop+=edgeScrollSpeed(clientY,host.top+(this.tools?.offsetHeight??0),host.bottom)*dt;
          const holders=Array.from(this.host.querySelectorAll<HTMLElement>('.aaeu-journal-page'));
          const target=holders.reduce<HTMLElement|undefined>((best,item)=>{const r=item.getBoundingClientRect(),b=best?.getBoundingClientRect();const distance=Math.max(r.top-clientY,0,clientY-r.bottom);return !b||distance<Math.max(b.top-clientY,0,clientY-b.bottom)?item:best;},undefined);
          const geometry=this.result?.placementPages?.find(p=>p.page===Number(target?.dataset.page));
          if(target&&geometry){
            const r=target.getBoundingClientRect(),scale=pageWidth/r.width;
            candidate=snapPlacement(box,geometry,lane,(clientY-r.top)*scale-grab);
            const o=candidate.override;target.append(ghost);ghost.style.left=o.x/pageWidth*100+'%';ghost.style.top=o.y/pageHeight*100+'%';ghost.style.width=o.width/pageWidth*100+'%';ghost.style.height=(o.height??24)/pageHeight*100+'%';ghost.classList.toggle('is-invalid',!candidate.valid);
            ghost.textContent=t(candidate.valid?'페이지 {page} · 놓아서 배치':'배치할 공간이 부족합니다',{page:o.page});
          }
        }
        raf=this.host.win.requestAnimationFrame(frame);
      };
      raf=this.host.win.requestAnimationFrame(frame);
      handle.onpointermove=e=>{clientY=e.clientY;moved||=Math.abs(clientY-startY)>3;if(moved)handle.classList.add('is-dragging');};
      handle.onpointerup=()=>{const value=candidate;reset();if(moved&&value?.valid)this.change(value.override);else if(moved)this.placementMessage(t('배치할 공간이 부족합니다'));};
      handle.onpointercancel=reset;
    };
    handle.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();this.selectObject(box);this.select(box.nodeId,false);}};
    holder.append(handle);
  }
  private placementMessage(message:string):void{this.tools?.querySelector('[role="status"]')?.replaceChildren(message);}
  selectObject(box:LayoutBox):void{
    if(!this.tools||!['figure','table'].includes(box.kind))return;
    this.selectedBox=this.result?.boxes.find(b=>b.nodeId===box.nodeId&&b.kind===box.kind)??box;
    const selected=this.selectedBox,geometry=this.result?.placementPages?.find(p=>p.page===selected.page);if(!geometry)return;
    this.renderTools();
  }
  private renderTools():void{
    if(!this.tools)return;const selected=this.selectedBox,geometry=this.result?.placementPages?.find(p=>p.page===selected?.page);
    this.tools.empty();
    for(const [lane,label]of [['left','왼쪽 칼럼'],['right','오른쪽 칼럼'],['full','전체 폭']] as const){
      const button=this.tools.createEl('button',{text:t(label),attr:{type:'button','aria-pressed':String(!!selected&&!!geometry&&boxLane(selected,geometry)===lane)}});
      button.disabled=!selected||!geometry;button.onclick=()=>this.setLane(lane);
    }
    this.tools.createSpan({text:t('위아래로 드래그 · 가장자리에서 자동 스크롤'),attr:{role:'status','aria-live':'polite'}});
  }
  setLane(lane:PlacementLane):void{
    const box=this.selectedBox,page=this.result?.placementPages?.find(p=>p.page===box?.page);if(!box||!page)return;
    const value=snapPlacement(box,page,lane,box.y);
    if(value.valid)this.change(value.override);else this.placementMessage(t('배치할 공간이 부족합니다'));
  }
  clear():void{this.dragCancel?.();this.generation++;this.observer?.disconnect();this.observer=null;for(const cleanup of this.cleanups)cleanup();this.cleanups=[];if(this.pdf)void this.pdf.destroy();this.pdf=null;this.host.replaceChildren();}
  focusNode(id:string,boxes:LayoutBox[]):void{
    const box=boxes.find(b=>b.nodeId===id);if(!box)return;
    const page=Array.from(this.host.querySelectorAll<HTMLElement>('.aaeu-journal-page')).find(h=>h.dataset.page===String(box.page));page?.scrollIntoView({block:'center'});
  }
  destroy():void{this.clear();}
}
