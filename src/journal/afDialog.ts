import {Modal,type App} from 'obsidian';
import {action,choose} from './forms';
import type {AfPageLayout} from '../io/affinity/types';

export interface AfOptions {format:'package'|'af';continuationPages:number;pageLayout:AfPageLayout}
export function afDialog(app:App,signal?:AbortSignal):Promise<AfOptions|null>{
  return new Promise(resolve=>{
    if(signal?.aborted){resolve(null);return;}
    const modal=new Modal(app);modal.titleEl.setText('Affinity 편집 파일 내보내기');
    const options:AfOptions={format:'package',continuationPages:0,pageLayout:'facing'};let result:AfOptions|null=null;
    modal.contentEl.createEl('p',{text:'본문은 왼쪽 단 → 오른쪽 단 → 다음 페이지로 연결됩니다. 표·그림은 개별 객체로 편집할 수 있습니다.'});
    modal.contentEl.createEl('p',{text:'원고에 없는 제목·교신저자·그림은 누락 표시를 남겨 내보냅니다. 그림 교체 자리는 Affinity에서 교체할 수 있으며, 패키지의 검사 보고서에도 기록됩니다.'});
    choose(modal.contentEl,'저장 형식',options.format,{package:'AF + 비교용 PDF + 원본 그림 (.zip)',af:'Affinity 파일만 (.af)'},v=>{options.format=v as AfOptions['format'];});
    choose(modal.contentEl,'페이지 배치',options.pageLayout,{facing:'두 쪽씩 나란히 (1–2, 3–4…)',single:'한 쪽씩'},v=>{options.pageLayout=v as AfPageLayout;});
    modal.contentEl.createEl('p',{text:'나란히 배치는 첫 페이지를 왼쪽에 놓고, 좌우 머리말을 마스터 스프레드 하나로 묶습니다. 쪽번호와 본문 연결 순서는 그대로 유지됩니다.'});
    choose(modal.contentEl,'끝에 추가할 연결 페이지','0',{'0':'추가하지 않음','1':'1쪽','2':'2쪽','3':'3쪽'},v=>{options.continuationPages=Number(v);});
    modal.contentEl.createEl('p',{text:'추가 페이지는 넘치는 본문을 이어서 보여 줄 편집 공간입니다. 글자 크기는 바꾸지 않으며, 추가 페이지의 머리말·쪽수는 Affinity에서 마무리하세요.'});
    modal.contentEl.createEl('p',{text:'실험 기능: Affinity에서 줄바꿈과 최종 페이지를 확인하세요. 자른 그림·본문 줄 안의 이미지는 현재 PDF·IDML 내보내기를 이용하세요.'});
    action(modal.contentEl,'내보내기',()=>{result=options;modal.close();});
    action(modal.contentEl,'취소',()=>modal.close());
    const abort=():void=>modal.close();
    signal?.addEventListener('abort',abort,{once:true});
    modal.onClose=()=>{signal?.removeEventListener('abort',abort);resolve(result);};modal.open();
  });
}
