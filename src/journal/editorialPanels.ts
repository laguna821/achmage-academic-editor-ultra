import {academicChecks} from "./appearance";
import {assetPreview} from './assetPreview';
import {Modal,type App} from 'obsidian';
import {action,choose,field} from './forms';
import {enableEditorial,endMatterLabels,endMatterSnapshot,restoreEditorialChange,sourceChangeText} from './editorial';
import {resolveMarkdownChange} from './markdown';
import {inlineText,newId,type CaptionDetection,type FigureNode,type ImageCrop,type JournalAsset,type JournalProject} from './types';
type Edit=(fn:(p:JournalProject)=>void,refresh?:boolean)=>void;
export function editorialPanel(host:HTMLElement,p:JournalProject,edit:Edit,select:(id:string)=>void):void{
  host.createEl('h3',{text:'원고 정리와 연결'});
  if(!p.editorial?.enabled){action(host,'이 프로젝트에 새 원고 정리 규칙 적용',()=>edit(enableEditorial));return;}
  choose(host,'표·그림 번호',p.editorial.numbering,{layout:'최종 편집본 배치 순서',source:'저자 원고 번호 유지'},v=>edit(p=>{p.editorial!.numbering=v as 'source'|'layout';}));
  choose(host,'참고문헌 정렬',p.editorial.sortReferences?'yes':'no',{yes:'APA 저자 순 정렬',no:'원문 순서 유지'},v=>edit(p=>{p.editorial!.sortReferences=v==='yes';}));
  host.createEl('p',{text:'원고 정리의 원본과 변경 이유를 보존합니다. 모호한 연결은 해당 항목에서 확인하세요.'});
  for(const c of p.editorial.changes){
    const row=host.createDiv({cls:'aaeu-journal-card'});row.createEl('strong',{text:`${c.status} · ${c.reason}`});
    const details=row.createEl('details');details.createEl('summary',{text:'원문과 위치'});details.createEl('pre',{text:sourceChangeText(c)});
    details.createEl('p',{text:c.source.map(n=>n.origin?.path??n.id).join('\n')});
    if(c.replacement){row.createEl('p',{text:'새 원문'});row.createEl('pre',{text:sourceChangeText({...c,source:c.replacement})});}
    if(c.documentPatch)row.createEl('pre',{text:JSON.stringify(c.documentPatch,null,2)});
    if(c.targetId)action(row,'출력 위치·항목 보기',()=>select(c.targetId!));
    if(c.rule==='markdown-reimport'&&c.status==='pending'){
      action(row,'새 원문 적용',()=>edit(p=>resolveMarkdownChange(p,c.id,true)));
      action(row,'기존 편집 유지',()=>edit(p=>resolveMarkdownChange(p,c.id,false)));
    }else if(c.status==='applied'&&c.rule!=='markdown-reimport')action(row,'원상복구',()=>edit(p=>restoreEditorialChange(p,c.id)));
  }
}
export function endMatterPanel(host:HTMLElement,p:JournalProject,edit:Edit,select:(id:string)=>void):void{
  host.createEl('h3',{text:'References 앞의 논문 말미 정보'});
  host.createEl('p',{text:'내용은 편집자가 확인해 입력합니다. 제목·본문 서식은 저널 프리셋을 따릅니다.'});
  let kind='acknowledgments';choose(host,'추가할 항목',kind,endMatterLabels,v=>{kind=v;});
  action(host,'항목 추가',()=>edit(p=>{p.document.endMatter??=[];p.document.endMatter.push({id:newId('end-matter'),kind:kind as keyof typeof endMatterLabels,title:endMatterLabels[kind as keyof typeof endMatterLabels],content:[],enabled:true,required:false});}));
  for(const [index,e]of (p.document.endMatter??[]).entries()){
    const card=host.createDiv({cls:'aaeu-journal-card'});card.dataset.endMatterId=e.id;
    card.createEl('strong',{text:e.title+(academicChecks(p)&&e.required?' · 필수 확인':' · 선택')});
    choose(card,'표시',e.enabled?'yes':'no',{yes:'출력',no:'제외'},v=>edit(p=>{p.document.endMatter!.find(b=>b.id===e.id)!.enabled=v==='yes';}));
    field(card,'항목 제목',e.title,v=>edit(p=>{p.document.endMatter!.find(b=>b.id===e.id)!.title=v;},false));
    field(card,'항목 내용',e.content.map(n=>inlineText(n.content)).join('\n'),v=>edit(p=>{const item=p.document.endMatter!.find(b=>b.id===e.id)!;item.content=v.split('\n').map((text,i)=>({...item.content[i],id:item.content[i]?.id??newId('statement'),kind:'paragraph',content:[{text}]}));},false),true);
    if(!e.enabled)field(card,'제외 사유',e.omissionReason??'',v=>edit(p=>{p.document.endMatter!.find(b=>b.id===e.id)!.omissionReason=v;},false),true);
    card.createEl('p',{text:e.reviewed===endMatterSnapshot(e)?'✓ 현재 내용 확인 완료':academicChecks(p)?'내용 확인 필요':'일반 간행물 · 내용 확인은 선택입니다.'});
    action(card,'내용 확인',()=>edit(p=>{const item=p.document.endMatter!.find(b=>b.id===e.id)!;item.reviewed=endMatterSnapshot(item);}));
    action(card,'PDF 위치 보기',()=>select(e.id));
    for(const [delta,label]of [[-1,'위로'],[1,'아래로']] as const)action(card,label,()=>edit(p=>{const list=p.document.endMatter!,at=list.findIndex(b=>b.id===e.id),target=at+delta;if(target>=0&&target<list.length){const [item]=list.splice(at,1);list.splice(target,0,item);}}));
    if(!e.required)action(card,'항목 제거',()=>edit(p=>{p.document.endMatter!.splice(index,1);}));
    if(e.source){const details=card.createEl('details');details.createEl('summary',{text:'원고에서 가져온 내용'});details.createEl('pre',{text:sourceChangeText({id:'',rule:'',reason:'',status:'applied',source:e.source})});}
  }
}
export async function cropDialog(app:App,node:FigureNode,asset:JournalAsset,bytes:Uint8Array,detection:CaptionDetection|undefined,apply:(crop:ImageCrop|undefined,title:string)=>void):Promise<void>{
  const previewBytes=await assetPreview(bytes,asset.mime);
  return new Promise(resolve=>{
    const modal=new Modal(app);modal.titleEl.setText('이미지 캡션 확인과 크롭');modal.modalEl.addClass('aaeu-crop-modal');
    const url=URL.createObjectURL(new Blob([previewBytes.bytes.slice().buffer],{type:previewBytes.mime}));
    const original=modal.contentEl.createDiv({cls:'aaeu-crop-original'}),img=original.createEl('img',{attr:{src:url,alt:'원본 그림'}}),overlay=original.createDiv({cls:'aaeu-crop-rectangle'});
    modal.contentEl.createEl('p',{text:'원본은 보존됩니다. 테두리가 남길 영역입니다. 축·범례·패널 표시가 잘리지 않는지 확인하세요.'});
    let rect=node.crop?{x:node.crop.x,y:node.crop.y,width:node.crop.width,height:node.crop.height}:{x:0,y:0,width:1,height:1};
    const inputs:Partial<Record<keyof typeof rect,HTMLInputElement|HTMLTextAreaElement>>={};
    const preview=modal.contentEl.createDiv({cls:'aaeu-crop-preview'}),previewImg=preview.createEl('img',{attr:{src:url,alt:'크롭 적용 후 미리보기'}});
    const update=():void=>{
      overlay.style.left=rect.x*100+'%';overlay.style.top=rect.y*100+'%';overlay.style.width=rect.width*100+'%';overlay.style.height=rect.height*100+'%';
      const ratio=(img.naturalWidth||asset.widthPx||1)/(img.naturalHeight||asset.heightPx||1);preview.style.aspectRatio=String(ratio*rect.width/rect.height);
      previewImg.style.width=100/rect.width+'%';previewImg.style.left=-100*rect.x/rect.width+'%';previewImg.style.top=-100*rect.y/rect.height+'%';
      for(const k of Object.keys(inputs) as (keyof typeof rect)[])inputs[k]!.value=(rect[k]*100).toFixed(2);
    };
    img.onload=update;
    for(const [key,label]of [['x','왼쪽 (%)'],['y','위쪽 (%)'],['width','가로 (%)'],['height','세로 (%)']] as const)inputs[key]=field(modal.contentEl,label,String(rect[key]*100),v=>{const n=Number(v)/100;if(!Number.isFinite(n))return;rect[key]=Math.min((key==='x'||key==='y') ? 0.999 : 1,Math.max((key==='width'||key==='height') ? 0.001 : 0,n));rect.width=Math.min(rect.width,1-rect.x);rect.height=Math.min(rect.height,1-rect.y);update();});
    const title=field(modal.contentEl,'출력할 캡션 제목',inlineText(node.caption?.title??[]),()=>undefined,true);
    if(detection?.status==='failed')modal.contentEl.createEl('p',{text:detection.message??'자동 탐지 실패 · 영역을 직접 지정할 수 있습니다.'});
    for(const c of detection?.candidates??[]){
      const row=modal.contentEl.createDiv({cls:'aaeu-journal-card'});row.createEl('p',{text:`탐지: ${c.text} · 신뢰도 ${Math.round(c.confidence)}%`});
      if(c.crop)action(row,'이 크롭 후보 미리보기',()=>{rect={...c.crop!};update();});
      else row.createEl('p',{text:'안전하게 분리되는 여백을 찾지 못했습니다. 영역을 직접 확인하세요.'});
      action(row,'탐지한 제목을 편집란으로',()=>{title.value=c.text.replace(/^\s*(?:fig(?:ure)?\.?|table|그림|표)\s*[A-Z]?\d+[a-z]?[.:]?\s*/i,'');});
    }
    action(modal.contentEl,'확인한 크롭과 캡션 적용',()=>{if(rect.width<=0||rect.height<=0)return;apply({...rect,assetSha256:asset.sha256,confirmed:true},title.value);modal.close();});
    action(modal.contentEl,'원본 유지 · 크롭 해제',()=>{apply(undefined,title.value);modal.close();});action(modal.contentEl,'취소',()=>modal.close());
    modal.onClose=()=>{URL.revokeObjectURL(url);resolve();};modal.open();update();
  });
}
export function markdownImportDialog(app:App,text:string,initial?:{titleMode:'auto'|'heading'|'filename';headingShift?:number}):Promise<{titleMode:'auto'|'heading'|'filename';headingShift?:number}|null>{
  return new Promise(resolve=>{
    const modal=new Modal(app);modal.titleEl.setText('Markdown 제목과 계층 확인');
    const options={titleMode:initial?.titleMode??'auto',headingShift:initial?.headingShift};
    modal.contentEl.createEl('p',{text:'현재 노트와 이미지를 독립된 편집본으로 가져옵니다. YAML title이 있으면 논문 제목으로 우선 사용합니다.'});
    modal.contentEl.createEl('pre',{text:text.split(/\r?\n/).filter(line=>/^#{1,6}\s/.test(line)).slice(0,12).join('\n')||'제목 표시가 없습니다.'});
    choose(modal.contentEl,'첫 # 제목',options.titleMode,{auto:'논문 제목 후보 자동 판단',heading:'첫 # 제목을 논문 제목으로 사용',filename:'본문 제목으로 유지 · 파일명 사용'},v=>{options.titleMode=v as typeof options.titleMode;});
    choose(modal.contentEl,'본문 제목 계층',options.headingShift===undefined?'auto':String(options.headingShift),{auto:'논문 제목 분리 시 한 단계 올림','0':'Markdown 계층 유지','-1':'한 단계 올림','1':'한 단계 내림'},v=>{options.headingShift=v==='auto'?undefined:Number(v);});
    let accepted=false;action(modal.contentEl,'이 매핑으로 가져오기',()=>{accepted=true;modal.close();});action(modal.contentEl,'취소',()=>modal.close());
    modal.onClose=()=>resolve(accepted?options:null);modal.open();
  });
}
