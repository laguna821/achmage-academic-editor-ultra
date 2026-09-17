import {editableStoryText,finalizeEditableThreads,validateEditableLayout,type EditableLayoutSnapshot,type EditRect,type EditFrame} from '../editableLayout';

/** Append empty capacity to the existing story. No text copies or re-layout. */
export function withContinuationPages(source:EditableLayoutSnapshot,count:number,columns:EditRect[]):EditableLayoutSnapshot{
  if(!Number.isInteger(count)||count<0||count>10)throw Error('추가 연결 페이지는 0~10쪽입니다.');
  if(!count)return source;
  const s=structuredClone(source),body=s.stories.find(st=>st.id==='journal:body-story');
  if(columns.length===2&&columns[0].x+columns[0].width>columns[1].x)throw Error('연결 페이지의 왼쪽·오른쪽 단이 겹치거나 순서가 다릅니다.');
  if(!body||columns.length!==2||columns.some(r=>![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.width<=0||r.height<=0||r.x<0||r.y<0||r.x+r.width>s.pageWidth+.1||r.y+r.height>s.pageHeight+.1))throw Error('연결 페이지의 본문 영역이 올바르지 않습니다.');
  const frames=s.frames.filter(f=>f.storyId===body.id).sort((a,b)=>a.order-b.order),end=editableStoryText(body).length;
  const last=frames.at(-1);if(!last)throw Error('연결할 본문 박스가 없습니다.');let previous:EditFrame=last;
  for(let i=1;i<=count;i++)for(const [col,r]of columns.entries()){
    const page=source.pageCount+i,id=`af:continuation:${page}:${col}`,frame:EditFrame={...r,id,storyId:body.id,page,order:previous.order+1,paragraphIds:[],start:end,end,previousFrameId:previous.id,layer:'body'};
    previous.nextFrameId=id;s.frames.push(frame);previous=frame;
  }
  s.pageCount+=count;
  for(let page=source.pageCount+1;page<=s.pageCount;page++){
    const folio=s.firstPage+page-1,prototypePage=source.frames.find(f=>f.master&&(s.firstPage+f.page-1)%2===folio%2)?.page;
    if(prototypePage===undefined)continue;
    for(const f of source.frames.filter(f=>f.page===prototypePage&&f.master)){
      const original=source.stories.find(st=>st.id===f.storyId)!;
      const id=`af:master:${page}:${f.master!.item}`,story=structuredClone(original);story.id=id+':story';
      for(const [i,p]of story.paragraphs.entries()){p.id=id+':p'+i;for(const run of p.runs)if(run.field==='page-number')run.text=String(folio);}
      s.stories.push(story);s.frames.push({...structuredClone(f),id,storyId:story.id,page,order:0,paragraphIds:story.paragraphs.map(p=>p.id),previousFrameId:undefined,nextFrameId:undefined});
    }
    for(const sh of source.shapes.filter(sh=>sh.page===prototypePage&&sh.master))s.shapes.push({...structuredClone(sh),id:`af:master:${page}:${sh.master!.item}`,page});
  }
  finalizeEditableThreads(s);
  const errors=validateEditableLayout(s).filter(i=>i.severity==='error');if(errors.length)throw Error(errors[0].message);
  return s;
}
