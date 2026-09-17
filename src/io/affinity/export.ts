import JSZip from 'jszip';
import {Buffer} from 'node:buffer';
import {setTimeout as yieldExport} from 'node:timers/promises';
import {sha256Bytes} from '../hash';
import {validateEditableLayout,type EditableLayoutSnapshot,type EditIssue} from '../editableLayout';
import {createSnapshotDocument} from './document.mjs';
import {freshArchiveAsync} from './native.mjs';
import type {AfExportResult,AfFont,AfExportOptions,AfResource} from './types';

export function afActive(signal?:AbortSignal):void{if(signal?.aborted)throw new DOMException('AF 내보내기를 취소했습니다.','AbortError');}
export function afPreflight(s:EditableLayoutSnapshot,fonts:AfFont[]):EditIssue[]{
  const issues=[...s.issues.filter(i=>i.severity==='error'),...validateEditableLayout(s)];
  const error=(code:string,message:string,sourceId?:string):void=>{issues.push({severity:'error',code,message,sourceId});};
  if(s.version!==2)error('af-snapshot','다시 조판한 뒤 AF로 내보내세요.');
  if(s.pageCount>300||s.stories.reduce((n,st)=>n+st.paragraphs.reduce((n,p)=>n+p.runs.reduce((n,r)=>n+r.text.length,0),0),0)>1000000)error('af-size','현재 AF 내보내기는 300쪽·본문 100만 자까지 지원합니다.');
  for(const p of [...s.stories.flatMap(st=>st.paragraphs),...s.tables.flatMap(t=>t.cells.flatMap(c=>c.paragraphs))]){
    const st=s.styles[p.style];if(!st)continue;
    for(const r of p.runs){
      if(r.imageId)error('af-inline-image','본문 줄 안의 이미지는 아직 AF로 내보낼 수 없습니다. 독립된 그림으로 배치하세요.',p.sourceId);
      if(r.superscript&&r.subscript)error('af-script','한 글자에 위첨자와 아래첨자를 동시에 지정할 수 없습니다.',p.sourceId);
      if(r.text&&!fonts.some(f=>f.family===st.font&&f.bold===!!(r.bold??st.bold)&&f.italic===!!(r.italic??st.italic)))error('af-font',`${st.font}의 ${r.bold??st.bold?'굵게 ':''}${r.italic??st.italic?'기울임 ':''}글꼴 파일이 없습니다. 글꼴을 등록하고 다시 조판하세요.`,p.sourceId);
    }
  }
  for(const i of s.images)if(i.crop)error('af-crop','자른 그림의 AF 호환성 검증이 필요합니다. 원본 그림을 사용하거나 PDF·IDML로 내보내세요.',i.sourceId);
  for(const shape of s.shapes)if(shape.stroke&&shape.strokeWidth)error('af-shape','외곽선 도형은 아직 AF로 내보낼 수 없습니다. PDF·IDML로 내보내세요.',shape.id);
  return issues.filter((v,i,a)=>a.findIndex(q=>q.code===v.code&&q.sourceId===v.sourceId&&q.message===v.message)===i);
}
export async function exportAf(s:EditableLayoutSnapshot,resources:AfResource[],fonts:AfFont[],referencePdf:Uint8Array,options:AfExportOptions={}):Promise<AfExportResult>{
  afActive(options.signal);const issues=[...s.issues.filter(i=>i.severity!=='error'),...afPreflight(s,fonts)],errors=issues.filter(i=>i.severity==='error');
  if(errors.length)throw Error(errors.slice(0,6).map(i=>i.message).join('\n'));
  options.progress?.('연결 텍스트·표·그림으로 AF 파일을 만드는 중…');
  await yieldExport(0,undefined,{signal:options.signal});afActive(options.signal);
  const out=createSnapshotDocument(s,resources,fonts,{pageLayout:options.pageLayout??'single'});
  afActive(options.signal);const af=await freshArchiveAsync(Buffer.from(out.bytes),out.assets.map(a=>({...a,bytes:Buffer.from(a.bytes)})),options);
  options.progress?.('AF와 비교용 PDF를 편집 패키지로 묶는 중…');
  const zip=new JSZip(),fileDate=new Date('2026-09-17T00:00:00Z');
  const add=(name:string,value:Uint8Array|string):void=>{zip.file(name,value,{date:fileDate});};
  add('document.af',af);add('reference.pdf',referencePdf);
  const assets=[];
  for(const [i,a]of s.assets.entries()){
    const name=`originals/${i+1}-${a.name.replace(/[^\p{L}\p{N}._-]/gu,'_').slice(0,100)}`;
    add(name,a.bytes);assets.push({id:a.id,file:name,sha256:sha256Bytes(a.bytes)});
  }
  const {stories,...report}=out.report;
  add('export-report.json',JSON.stringify({...report,stories:stories.map(({text,...st})=>({...st,textSha256:sha256Bytes(new TextEncoder().encode(text))})),originalAssets:assets,afSha256:sha256Bytes(af),capacity:'unmeasured-native-reflow',issues},null,2));
  add('README.ko.txt','HanMark AF 편집 패키지 (실험 기능)\n\nAffinity에서 document.af를 여세요. 본문 박스는 왼쪽 → 오른쪽 → 다음 페이지 순서로 연결돼 있습니다. 표와 그림은 별도 객체입니다.\n\nreference.pdf는 HanMark 조판 기준본입니다. Affinity의 줄바꿈·단어 간격 때문에 같은 내용이 다른 위치에 보일 수 있습니다. 텍스트가 넘쳐도 원문은 본문 안에 보존됩니다. 마지막 박스를 더 큰 박스나 다음 페이지의 박스에 연결하면 이어서 편집할 수 있습니다. 추가 연결 페이지를 선택했다면 문서 끝의 빈 박스까지 이미 연결돼 있습니다. 추가 페이지는 편집 공간이며 머리말·쪽수·발행정보를 최종 확인하세요.\n\n글꼴은 함께 배포하지 않습니다. export-report.json에 표시된 글꼴이 설치된 컴퓨터에서 여세요. 원본 그림은 originals 폴더에 보존합니다. AF 안에는 그림의 PDF 표현과 미리보기가 내장됩니다. 본문을 고친 뒤 원래 Markdown/DOCX로 자동 역반영하지 않습니다.\n');
  const pack=await zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}},()=>afActive(options.signal));
  afActive(options.signal);return {af,package:pack,issues,snapshot:s};
}
