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
  constructor(private readonly host:HTMLElement,private readonly select:(id:string)=>void,private readonly change:(override:LayoutOverride)=>void){}
  async show(result:LayoutResult):Promise<void>{
    this.clear();const generation=this.generation;
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
      const canvas=holder.createEl("canvas");canvas.setAttribute("aria-label",`PDF ${n}쪽`);holder.append(canvas);this.host.append(holder);
      for(const box of result.boxes.filter(b=>b.page===n&&["figure","table","text-frame","metadata"].includes(b.kind)))this.overlay(holder,box,viewport.width,viewport.height);
      this.observer.observe(holder);
    }
  }
  private overlay(holder:HTMLElement,box:LayoutBox,pageWidth:number,pageHeight:number):void{
    const handle=holder.createDiv();handle.className="aaeu-journal-box"+(box.kind==="text-frame"?" is-frame":"");
    handle.tabIndex=0;handle.setAttribute("role","button");handle.setAttribute("aria-label",`${box.kind} 위치 조정`);handle.dataset.nodeId=box.nodeId;
    const position=(x:number,y:number,w:number,h:number):void=>{handle.style.left=x/pageWidth*100+"%";handle.style.top=y/pageHeight*100+"%";handle.style.width=w/pageWidth*100+"%";handle.style.height=h/pageHeight*100+"%";};
    position(box.x,box.y,box.width,box.height);
    if(box.kind==="metadata"){
      handle.classList.add("is-metadata");handle.setAttribute("aria-label",box.text??"발행정보 수정");handle.title=box.text??"발행정보 수정";
      handle.onclick=()=>this.select(box.nodeId);handle.onkeydown=event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();this.select(box.nodeId);}};return;
    }
    const resize=handle.createSpan();resize.className="aaeu-journal-resize";handle.append(resize);
    handle.onpointerdown=event=>{
      if(event.button!==0)return;event.preventDefault();event.stopPropagation();this.select(box.nodeId);
      const size=event.target===resize,startX=event.clientX,startY=event.clientY,scale=pageWidth/holder.getBoundingClientRect().width;
      handle.setPointerCapture(event.pointerId);
      let value={x:box.x,y:box.y,width:box.width,height:box.height};
      handle.onpointermove=e=>{const dx=(e.clientX-startX)*scale,dy=(e.clientY-startY)*scale;
        value=size?{...value,width:Math.max(36,box.width+dx),height:Math.max(24,box.height+dy)}:{...value,x:Math.max(0,box.x+dx),y:Math.max(0,box.y+dy)};
        position(value.x,value.y,value.width,value.height);
      };
      handle.onpointerup=e=>{handle.releasePointerCapture(e.pointerId);handle.onpointermove=null;handle.onpointerup=null;this.change({id:box.nodeId,page:box.page,...value,locked:true});};
      handle.onpointercancel=()=>{handle.onpointermove=null;handle.onpointerup=null;position(box.x,box.y,box.width,box.height);};
    };
    handle.onkeydown=event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();this.select(box.nodeId);} };
    holder.append(handle);
  }
  clear():void{this.generation++;this.observer?.disconnect();this.observer=null;for(const cleanup of this.cleanups)cleanup();this.cleanups=[];if(this.pdf)void this.pdf.destroy();this.pdf=null;this.host.replaceChildren();}
  focusNode(id:string,boxes:LayoutBox[]):void{
    const box=boxes.find(b=>b.nodeId===id);if(!box)return;
    const page=Array.from(this.host.querySelectorAll<HTMLElement>('.aaeu-journal-page')).find(h=>h.dataset.page===String(box.page));page?.scrollIntoView({block:'center'});
  }
  destroy():void{this.clear();}
}
