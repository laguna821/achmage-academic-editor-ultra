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
    const draw=async(holder:HTMLElement,pageNumber:number):Promise<void>=>{
      if(holder.dataset.rendered)return;holder.dataset.rendered="true";
      const pg=await pdf.getPage(pageNumber);if(generation!==this.generation)return;
      const viewport=pg.getViewport({scale:1.3}),canvas=holder.querySelector("canvas")!;
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      const context=canvas.getContext("2d");if(context)await pg.render({canvasContext:context,viewport}).promise;
    };
    this.observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){this.observer?.unobserve(e.target);void draw(e.target as HTMLElement,Number((e.target as HTMLElement).dataset.page)).catch(()=>undefined);}},{root:this.host,rootMargin:"500px"});
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
