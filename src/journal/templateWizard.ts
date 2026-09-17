import {selectPdfPage} from "./pdfArtwork";
import {Modal,Notice,type App} from "obsidian";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import type {FileGateway} from "../io/fileGateway";
import {action,choose,field} from "./forms";
import {JournalEngine} from "./engine";
import {JournalComposer} from "./layout";
import {JournalPreview} from "./preview";
import {ensureProjectFonts} from "./autoFonts";
import {discoverSystemFonts} from "./systemFonts";
import {applyTemplate,blankTemplate,copyTemplateAssets,exportTemplate,importTemplate,templateFromProject,validateTemplate,type JournalTemplate,JournalTemplateLibrary} from "./templates";
import {FONT_GROUPS,TEXT_LIMITS,TEXT_TOKENS} from "./appearance";
import {journalStyles,resolvedMaster} from "./master";
import {addAsset} from "./docx";
import {cloneJournal,newId,type BinaryStore,type JournalProject} from "./types";

export async function resolveFonts(app:App,p:JournalProject,store:BinaryStore):Promise<boolean>{
  const missing=await ensureProjectFonts(p,store);if(!missing.length)return true;
  const catalog=await discoverSystemFonts(),families=[...new Set([...p.fonts.map(f=>f.family),...catalog.fonts.map(f=>f.family)])];
  return new Promise(resolve=>{
    const modal=new Modal(app);modal.titleEl.setText("사용할 수 없는 글꼴");
    modal.contentEl.createEl("p",{text:"설치되지 않았거나 읽을 수 없는 글꼴의 대체 서체를 선택하세요. 원래 글꼴을 설치한 뒤 목록을 새로고침할 수도 있습니다."});
    const replacements=new Map<string,string>();let accepted=false;
    for(const name of missing)choose(modal.contentEl,name,"",{"":"대체 글꼴 선택",...Object.fromEntries(families.filter(f=>!missing.includes(f)).map(f=>[f,f]))},v=>replacements.set(name,v));
    const button=action(modal.contentEl,"선택한 글꼴 적용",async()=>{
      if(missing.some(f=>!replacements.get(f))){new Notice("각 글꼴의 대체 서체를 선택하세요.");return;}
      button.disabled=true;
      try{
        if(p.preset.appearance)p.preset.appearance.substitutions={...p.preset.appearance.substitutions,...Object.fromEntries(replacements)};
        const styles=journalStyles(p.preset);p.preset.textStyles??={};
        for(const [role,s]of Object.entries(styles)){const font=replacements.get(s.font);if(font)p.preset.textStyles[role as keyof typeof styles]={...s,font};}
        // Group overrides win over role defaults, so replace them too.
        for(const key of Object.keys(FONT_GROUPS) as (keyof typeof FONT_GROUPS)[]){const font=p.preset.appearance?.fonts[key];if(font&&replacements.has(font))p.preset.appearance!.fonts[key]=replacements.get(font)!;}
        p.preset.fallbackFonts=p.preset.fallbackFonts?.map(f=>replacements.get(f)??f);
        const unresolved=await ensureProjectFonts(p,store);if(unresolved.length)throw new Error("글꼴을 읽을 수 없습니다: "+unresolved.join(", "));
        accepted=true;modal.close();
      }catch(e){new Notice(String(e));}finally{button.disabled=false;}
    });
    action(modal.contentEl,"취소",()=>modal.close());modal.onClose=()=>resolve(accepted);modal.open();
  });
}

export class JournalTemplateWizard extends Modal{
  private step=0;
  private template:JournalTemplate;
  private draft:JournalProject;
  private engine=new JournalEngine();
  private preview:JournalPreview|null=null;
  private controller:AbortController|null=null;
  private catalog:Awaited<ReturnType<typeof discoverSystemFonts>>={fonts:[],warnings:[]};
  private previewKey="";
  private closed=false;
  constructor(app:App,private gateway:FileGateway,private source:JournalProject,private store:BinaryStore,private library:JournalTemplateLibrary,private apply:(p:JournalProject)=>void){
    super(app);this.draft=cloneJournal(source);this.template=templateFromProject(source);
  }
  onOpen():void{
    this.modalEl.addClass("aaeu-journal-template-modal");this.titleEl.setText("저널 템플릿");this.render();
    void discoverSystemFonts().then(c=>{this.catalog=c;if(!this.closed&&this.step===2)this.render();}).catch(e=>new Notice(String(e)));
  }
  onClose():void{this.closed=true;this.controller?.abort();this.engine.dispose();this.preview?.destroy();}
  private run(fn:()=>Promise<void>):void{void fn().catch(e=>new Notice(e instanceof Error?e.message:String(e),8000));}
  private key():string{return JSON.stringify(this.template);}
  private render():void{
    this.preview?.destroy();this.preview=null;this.contentEl.empty();
    const host=this.contentEl,steps=["기본 정보","로고","색상·글꼴","문구","미리보기·저장"];
    const nav=host.createDiv({cls:"aaeu-journal-template-steps"});
    steps.forEach((label,i)=>{const b=action(nav,`${i+1}. ${label}`,()=>{this.controller?.abort();this.step=i;this.render();});b.setAttribute("aria-current",this.step===i?"step":"false");});
    const a=this.template.appearance;
    const text=(label:string,value:string,max:number,change:(v:string)=>void,multi=false):void=>{
      const input=field(host,label,value,change,multi);input.maxLength=max;
      const counter=host.createEl("small",{text:`${value.length}/${max}자 · 실제 영역에 맞는지는 미리보기에서 확인합니다.`});
      input.oninput=()=>{change(input.value);counter.setText(`${input.value.length}/${max}자 · 실제 영역에 맞는지는 미리보기에서 확인합니다.`);};
    };
    if(this.step===0){
      host.createEl("p",{text:"로고·색상·문구·글꼴을 바꿉니다. 글자 크기와 간격, 표·그림 배치 규칙은 유지됩니다."});
      const row=host.createDiv();this.run(async()=>{
        const templates=await this.library.list();if(!row.isConnected)return;
        choose(row,"저장된 템플릿","",{"":"템플릿 선택",...Object.fromEntries(templates.map(t=>[t.id,t.name]))},id=>this.run(async()=>{const t=templates.find(t=>t.id===id);if(!t)return;await copyTemplateAssets(t,this.library.store,this.store);this.template=cloneJournal(t);for(const asset of t.assets)if(!this.draft.assets.some(a=>a.id===asset.id))this.draft.assets.push(cloneJournal(asset));this.previewKey="";this.render();}));
      });
      action(host,"새 사용자 템플릿",()=>{this.template=blankTemplate();this.previewKey="";this.render();});
      action(host,"현재 템플릿 복제",()=>{this.template={...cloneJournal(this.template),id:newId("template"),name:(this.template.name+" 복사").slice(0,100)};this.render();});
      action(host,"템플릿 가져오기",()=>this.run(async()=>{const f=await this.gateway.pickFiles({extensions:["zip"],maxFiles:1,maxTotalBytes:40*1024*1024});if(f[0]){this.template=await importTemplate(f[0].bytes,this.store);for(const asset of this.template.assets)if(!this.draft.assets.some(a=>a.id===asset.id))this.draft.assets.push(cloneJournal(asset));this.render();}}));
      const remove=action(host,"저장된 템플릿 삭제",()=>this.run(async()=>{await this.library.remove(this.template.id);this.template={...this.template,id:newId("template")};this.render();new Notice("목록에서 삭제했습니다. 기존 원고는 유지됩니다.");}));remove.disabled=this.template.id.startsWith("builtin:");
      text("템플릿 이름",this.template.name,100,v=>this.template.name=v);
      choose(host,"출판물 유형",a.kind,{academic:"학술지",general:"일반 간행물"},v=>{a.kind=v as typeof a.kind;a.referenceChecks=v==="academic";this.render();});
      choose(host,"참고문헌 검사",a.referenceChecks?"yes":"no",{yes:"사용",no:"사용 안 함"},v=>a.referenceChecks=v==="yes");
      text("저널·간행물 이름",a.journalName,100,v=>a.journalName=v);
      host.createEl("p",{text:a.kind==="academic"?"학술 발행정보와 논문 말미 정보를 확인합니다. DOI 조회는 버튼을 눌렀을 때만 실행됩니다.":"DOI·접수일·교신저자·학술 선언문을 필수로 요구하지 않습니다. 내용 누락·넘침 검사는 유지됩니다."});
    }else if(this.step===1){
      for(const [key,label]of [["logo","주 로고"],["mark","작은 마크"]] as const){
        choose(host,label,a[key].mode,key==="logo"?{none:"비우기",hnmr:"HNMR 기본 로고",asset:"사용자 이미지"}:{none:"비우기",crossmark:"Crossmark",asset:"사용자 이미지"},v=>{if(key==="logo")a.logo={mode:v as typeof a.logo.mode};else a.mark={mode:v as typeof a.mark.mode};this.render();});
        if(a[key].mode==="asset"){
          host.createEl("p",{text:this.template.assets.find(f=>f.id===a[key].assetId)?.name??"파일을 선택하세요."});
          action(host,label+" 파일 선택",()=>this.run(()=>this.pickLogo(key)));
        }
      }
      const m=resolvedMaster(this.source.preset),h=Math.max(1,m.topRuleYpt-m.topRulePt/2-m.logoYpt-4);
      host.createEl("p",{text:`PDF·PNG·JPG · 파일당 최대 20MB. PDF는 벡터 원본을 유지합니다. 주 로고 ${(m.logoWidthPt*25.4/72).toFixed(1)} × ${(h*25.4/72).toFixed(1)}mm, 작은 마크 ${(m.crossmarkWidthPt*25.4/72).toFixed(1)}mm 정사각형 영역 안에 비율을 유지합니다. 300dpi 기준 약 ${Math.ceil(m.logoWidthPt*300/72)} × ${Math.ceil(h*300/72)}px / ${Math.ceil(m.crossmarkWidthPt*300/72)}px 정사각형을 권장합니다.`});
    }else if(this.step===2){
      for(const [key,label]of [["key","메인 키컬러"],["rule","가로선 색상"],["abstract","Abstract 배경색"]] as const){
        const input=field(host,label,a.colors[key],v=>a.colors[key]=v) as HTMLInputElement;input.type="color";input.oninput=()=>a.colors[key]=input.value;
      }
      const families=[...new Set([...this.draft.fonts.map(f=>f.family),...this.catalog.fonts.map(f=>f.family)])].sort((a,b)=>a.localeCompare(b));
      for(const [key,label]of [["body","본문"],["heading","제목"],["auxiliary","보조정보"]] as const){
        const current=a.fonts[key]??"";
        choose(host,label+" 글꼴",current,{"":"기존 서체 유지",...(current?{[current]:current}:{}),...Object.fromEntries(families.map(f=>[f,f]))},v=>{if(v)a.fonts[key]=v;else delete a.fonts[key];});
        const description=host.createEl("small");description.setText(current?this.catalog.fonts.filter(f=>f.family===current).map(f=>f.style).filter((v,i,list)=>list.indexOf(v)===i).join(" · "):"현재 원고의 역할별 서체를 유지합니다.");
      }
      action(host,"글꼴 목록 새로고침",()=>this.run(async()=>{this.catalog=await discoverSystemFonts(true);this.render();}));
      host.createEl("p",{text:`설치 글꼴 ${families.length}개 · 필요한 파일만 프로젝트에 저장합니다. ${this.catalog.warnings.join(" ")}`});
    }else if(this.step===3){
      const variableField=(label:string,value:string|undefined,max:number,set:(v:string|undefined)=>void):void=>{
        choose(host,label+" 방식",value===undefined?"legacy":"custom",{legacy:"기존 문구 유지",custom:"사용자 문구 · 비워 두면 숨김"},v=>{set(v==="legacy"?undefined:"");this.render();});
        if(value!==undefined){
          const input=field(host,label,value,v=>set(v),true);input.maxLength=max;input.oninput=()=>set(input.value);
          choose(host,label+" 변수 삽입","",{"":"변수 선택",...Object.fromEntries(TEXT_TOKENS.map(t=>[t,t]))},v=>{if(!v)return;const start=input.selectionStart??input.value.length,end=input.selectionEnd??start;input.value=(input.value.slice(0,start)+"{"+v+"}"+input.value.slice(end)).slice(0,max);set(input.value);input.focus();});
          host.createEl("small",{text:`최대 ${max}자. 미리보기에서 실제 글꼴로 공간을 검사합니다.`});
        }
      };
      variableField("첫 페이지 좌상단",a.publicationText,TEXT_LIMITS.publication,v=>a.publicationText=v);
      variableField("Copyright·라이선스",a.copyrightText,TEXT_LIMITS.copyright,v=>a.copyrightText=v);
      choose(host,"후속 페이지 왼쪽",a.leftHeader.mode,{legacy:"기존 홀짝 머리말",journal:"저널·간행물 이름",title:"논문 제목",text:"사용자 문구",none:"비우기"},v=>{a.leftHeader.mode=v as typeof a.leftHeader.mode;this.render();});
      if(a.leftHeader.mode==="text")text("왼쪽 머리말 문구",a.leftHeader.text,160,v=>a.leftHeader.text=v);
      choose(host,"후속 페이지 오른쪽",a.rightHeader.mode,{page:"쪽수",text:"문구", "text-page":"문구와 쪽수",none:"비우기"},v=>{a.rightHeader.mode=v as typeof a.rightHeader.mode;this.render();});
      if(["text","text-page"].includes(a.rightHeader.mode))text("오른쪽 머리말 문구",a.rightHeader.text,160,v=>a.rightHeader.text=v);
      host.createEl("p",{text:"DOI·권호·날짜·교신저자는 원고의 발행정보 패널에서 입력합니다. {year}, {page} 같은 변수는 그 값을 사용합니다. AOP에서는 권·호·쪽수를 숨깁니다."});
    }else{
      host.createEl("p",{text:`${this.template.name} · ${a.kind==="academic"?"학술지":"일반 간행물"} · 본문과 발행정보는 유지됩니다. 미리보기 확인 후 저장·적용하세요.`});
      const message=host.createEl("p");
      const previewHost=host.createDiv({cls:"aaeu-journal-template-preview"});
      this.preview=new JournalPreview(previewHost,()=>undefined,()=>undefined);
      const draw=action(host,"현재 원고로 미리보기",()=>this.run(async()=>{
        draw.disabled=true;this.controller?.abort();const controller=this.controller=new AbortController();
        try{
          const t=validateTemplate(this.template);this.draft=cloneJournal(this.source);applyTemplate(this.draft,t);
          if(!await resolveFonts(this.app,this.draft,this.store))return;
          if(controller.signal.aborted||this.closed)return;
          const fonts:Uint8Array[]=[];for(const path of new Set(this.draft.fonts.map(f=>f.path))){const b=await this.store.get(path);if(b)fonts.push(b);}
          await this.engine.initialize(fonts);
          const result=await new JournalComposer(this.engine).compose(this.draft,this.store,controller.signal,s=>message.setText(s));
          if(controller.signal.aborted||this.closed)return;
          await this.preview?.show(result);
          const overflow=result.issues.filter(i=>i.severity==="error"&&/^(template-|master-|running-header)/.test(i.code));
          message.setText(overflow.length?overflow.map(i=>i.message).join("\n"):`${result.pageCount}쪽 · 검사 ${result.issues.length}건. 본문 오류는 원고의 검사 결과에서 확인하세요.`);
          // Font substitution is part of the previewed snapshot.
          this.template.appearance=cloneJournal(this.draft.preset.appearance!);
          this.previewKey=overflow.length?"":this.key();save.disabled=!!overflow.length;
        }finally{draw.disabled=false;}
      }));
      const save=action(host,"템플릿 저장 및 원고에 적용",()=>this.run(async()=>{
        if(this.previewKey!==this.key())throw new Error("변경한 템플릿의 미리보기를 먼저 확인하세요.");
        const t=await this.library.save(this.template,this.store);
        this.draft.preset.template={id:t.id,name:t.name,version:1};this.apply(this.draft);this.close();
      }));save.disabled=true;
      action(host,"템플릿 내보내기",()=>this.run(async()=>{await this.gateway.saveFile(await exportTemplate(this.template,this.store),"aaeu-journal-template.zip");}));
    }
    const footer=host.createDiv({cls:"aaeu-journal-template-steps"});
    const back=action(footer,"이전",()=>{this.step--;this.render();});back.disabled=this.step===0;
    const next=action(footer,"다음",()=>{this.step++;this.render();});next.disabled=this.step===4;
    action(footer,"닫기",()=>this.close());
  }
  private async pickLogo(key:"logo"|"mark"):Promise<void>{
    const files=await this.gateway.pickFiles({extensions:["pdf","png","jpg","jpeg"],maxFiles:1,maxTotalBytes:20*1024*1024}),f=files[0];if(!f)return;
    let bytes=f.bytes,name=f.name,mime=/\.pdf$/i.test(name)?"application/pdf":/\.png$/i.test(name)?"image/png":"image/jpeg",original:string|undefined;
    if(mime==="application/pdf"){
      const pdf=await getDocument({data:bytes.slice(),isEvalSupported:false,useSystemFonts:false}).promise;
      try{
        let page=1;
        if(pdf.numPages>1){const chosen=await new Promise<number|null>(resolve=>{const m=new Modal(this.app);let result:number|null=null;m.titleEl.setText("로고로 사용할 PDF 페이지");choose(m.contentEl,"페이지","1",Object.fromEntries(Array.from({length:pdf.numPages},(_,i)=>[String(i+1),String(i+1)])),v=>page=Number(v));action(m.contentEl,"선택",()=>{result=page;m.close();});m.onClose=()=>resolve(result);m.open();});if(chosen===null)return;page=chosen;}
        original=await addAsset(this.draft,bytes,name,"template",this.store,mime);
        const selected=await selectPdfPage(bytes,page);bytes=selected.bytes;
        if(selected.pages>1)name=name.replace(/\.pdf$/i,"-page-"+page+".pdf");
      }finally{await pdf.destroy();}
    }
    const assetId=await addAsset(this.draft,bytes,name,"template",this.store,mime),asset=this.draft.assets.find(a=>a.id===assetId)!;if(original&&original!==assetId)asset.derivedFrom=original;
    if(mime==="application/pdf"){const info=await selectPdfPage(bytes);Object.assign(asset,{widthPt:info.width,heightPt:info.height,aspectRatio:info.width/info.height});}
    this.template.appearance[key]={mode:"asset",assetId:asset.id};
    const ids=[this.template.appearance.logo.assetId,this.template.appearance.mark.assetId],selected=this.draft.assets.filter(a=>ids.includes(a.id));
    this.template.assets=cloneJournal(this.draft.assets.filter(a=>ids.includes(a.id)||selected.some(s=>s.derivedFrom===a.id)));
    this.render();
  }
}
