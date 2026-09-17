import {parseEditorialSourceBlocks,editorialPlainText,type EditorialBlock,type EditorialInline} from '../io/editorialDocument';
import {markdownMetadata,applyMarkdownProperties} from './markdownProperties';
import {addAsset,attachCaptions} from './docx';
import {normalizeEditorial,isReferenceHeading,endMatterKind,captionMatch} from './editorial';
import {referenceCandidate} from './references';
import {digestBytes} from './storage';
import {cloneJournal,inlineText,newId,type BinaryStore,type Inline,type JournalNode,type JournalProject,type JournalSource,type Paragraph} from './types';

export interface MarkdownInput {name:string;text:string;path?:string;metadata?:Record<string,unknown>;titleMode?:'auto'|'heading'|'filename';headingShift?:number;resolveImage?:(src:string)=>Promise<{bytes:Uint8Array;name?:string;mime?:string}>}
const section=/^(?:\d+(?:\.\d+)*[.)]?\s*)?(abstract|introduction|background|methods?|results?|discussion|conclusions?|references?|bibliography|acknowledg(?:e)?ments?|서론|초록|참고문헌)$/i;
export async function importMarkdown(p:JournalProject,input:MarkdownInput,store:BinaryStore):Promise<JournalSource>{
  const bytes=new TextEncoder().encode(input.text),sha256=await digestBytes(bytes),source:JournalSource={id:newId('source'),name:input.name,path:`sources/${sha256}.md`,sha256,role:'manuscript',format:'markdown',originalPath:input.path};
  if(p.sources.some(s=>s.sha256===sha256))throw new Error('이미 가져온 Markdown 원고입니다.');
  source.markdownOptions={titleMode:input.titleMode??'auto',headingShift:input.headingShift};
  await store.put(source.path,bytes);p.sources.push(source);
  const front=input.text.match(/^\uFEFF?---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\s*(?:\r?\n|$)/),offset=front?front[0].split('\n').length-1:0;
  const body=front?input.text.slice(front[0].length):input.text,parsed=parseEditorialSourceBlocks(body),metadata=markdownMetadata(input.metadata??{});
  const addIssue=(code:string,message:string,nodeId?:string):void=>{p.issues.push({id:newId('md-issue'),code,message,severity:code==='markdown-image-missing'?'error':'warning',sourceId:source.id,nodeId});};
  const imageCache=new Map<string,Promise<string>>();
  const asset=(src:string):Promise<string>=>{
    const existing=imageCache.get(src);if(existing)return existing;
    const request=(async()=>{if(!input.resolveImage)throw new Error('이미지 파일 해석기가 없습니다.');const file=await input.resolveImage(src);return addAsset(p,file.bytes,file.name??src.split('/').at(-1)??'image',source.id,store,file.mime);})();imageCache.set(src,request);return request;
  };
  const inlines=async(values:EditorialInline[],marks:Partial<Inline>={}):Promise<Inline[]>=>{
    const out:Inline[]=[];
    for(const value of values){
      if(value.type==='text'||value.type==='code')out.push({...marks,text:value.value});
      else if(value.type==='hardbreak')out.push({...marks,text:'\n',break:true});
      else if(value.type==='image'){
        try{out.push({...marks,text:'',assetId:await asset(value.src)});}catch(e){out.push({...marks,text:`[Image required: ${value.alt||value.src}]`});addIssue('markdown-image-missing',e instanceof Error?e.message:String(e));}
      }else if(value.type==='link')out.push(...await inlines(value.children,{...marks,href:value.href}));
      else if(value.type==='wikilink')out.push({...marks,text:value.label||value.target});
      else if(value.type==='styled')out.push(...await inlines(value.children,{...marks,...(value.style==='strong'?{bold:true}:value.style==='emphasis'?{italic:true}:value.style==='superscript'?{superscript:true}:value.style==='subscript'?{subscript:true}:{})}));
    }
    return out;
  };
  let shift=input.headingShift??0;
  const leading=parsed[0]?.block;
  const explicitTitle=typeof metadata.title==='string'?metadata.title:'';
  const consume=leading?.type==='heading'&&leading.level===1&&input.titleMode!=='filename'&&(input.titleMode==='heading'||explicitTitle===editorialPlainText(leading.inlines)||!explicitTitle&&!section.test(editorialPlainText(leading.inlines).trim()));
  p.document.title=explicitTitle||(consume&&leading?.type==='heading'?editorialPlainText(leading.inlines):input.name.replace(/\.md$/i,''));
  if(consume&&input.headingShift===undefined)shift=-1;
  else if(input.headingShift===undefined&&parsed.some(b=>b.block.type==='heading')&&!parsed.some(b=>b.block.type==='heading'&&b.block.level===1))shift=-1;
  for(const key of ['doi','volume','issue','year','received','revised','accepted','runningTitle'] as const)if(typeof metadata[key]==='string'||typeof metadata[key]==='number')p.document[key]=String(metadata[key]);
  if(Array.isArray(metadata.keywords))p.document.keywords=metadata.keywords.filter((k):k is string=>typeof k==='string');
  if(typeof metadata.abstract==='string')p.document.abstract=[{id:newId('abstract'),kind:'paragraph',role:'abstract',content:[{text:metadata.abstract}],origin:{sourceId:source.id,path:'markdown/frontmatter/abstract',text:metadata.abstract}}];
  const lines=input.text.split(/\r?\n/);
  const origin=(start:number,end:number,path:string,text?:string)=>({sourceId:source.id,path:`markdown/lines[${start+offset}:${end+offset}]/${path}`,text:text??lines.slice(start+offset-1,end+offset).join('\n')});
  const convert=async(b:EditorialBlock,start:number,end:number,path:string,quote=0,list?:Paragraph['list']):Promise<JournalNode[]>=>{
    const id=newId(b.type),baseOrigin=origin(start,end,path);
    if(b.type==='paragraph'||b.type==='heading'){
      // A linked image still has a figure identity and keeps its adjacent caption.
      const pictureInlines=b.inlines.flatMap(v=>v.type==='link'&&v.children.every(c=>c.type==='image')?v.children:v);
      const pictures=pictureInlines.filter((v):v is Extract<EditorialInline,{type:'image'}>=>v.type==='image');
      if(b.type==='paragraph'&&pictures.length&&pictureInlines.every(v=>v.type==='image'||v.type==='hardbreak'||v.type==='text'&&!v.value.trim())){
        const figures:JournalNode[]=[];
        for(const [occurrence,pic]of pictures.entries()){
          let assetId='';try{assetId=await asset(pic.src);}catch(e){addIssue('markdown-image-missing',e instanceof Error?e.message:String(e),id);}
          const alt=captionMatch(pic.alt.trim()),number=alt&&!/^(table|표)$/i.test(alt[1])?alt[2]:'',title=number?alt![3]:pic.alt;
          figures.push({id:occurrence?newId('figure'):id,kind:'figure',assetId,width:'auto',origin:{...baseOrigin,occurrence},...(!assetId?{sourceObject:{type:'missing-image' as const,part:pic.src,description:`Markdown 이미지 원본 필요: ${pic.src}`}}:{}),...(pic.alt.trim()?{caption:{number,title:title?[{text:title}]:[],notes:[]}}:{})});
        }return figures;
      }
      const content=await inlines(b.inlines),level=b.type==='heading'?Math.max(1,Math.min(5,b.level+shift)):undefined;
      if(b.type==='heading'&&b.level+shift>5)addIssue('markdown-heading-level','제목 6을 저널 제목 5에 연결했습니다. 계층을 확인하세요.',id);
      return [{id,kind:b.type,level,role:quote?'quote':'body',content,list,indentMm:quote?quote*4:undefined,origin:{...baseOrigin,text:inlineText(content)}}];
    }
    if(b.type==='code')return [{id,kind:'paragraph',role:'code',content:[{text:b.value}],origin:{...baseOrigin,text:b.value}}];
    if(b.type==='table'){
      const rows=[];
      for(const [ri,row]of [b.header,...b.rows].entries()){const cells=[];for(const [ci,cell]of row.entries()){const content=await inlines(cell);cells.push({id:newId('cell'),colspan:1,rowspan:1,header:ri===0,blocks:[{id:newId('p'),kind:'paragraph' as const,content,origin:origin(start,end,`${path}/row[${ri}]/cell[${ci}]`,inlineText(content))}]});}rows.push({id:newId('row'),header:ri===0,cells});}
      return [{id,kind:'table',rows,columnWeights:b.header.map(()=>1),width:'auto',origin:baseOrigin}];
    }
    if(b.type==='list'){
      const out:JournalNode[]=[];
      for(const [i,item]of b.items.entries())for(const [j,child]of item.blocks.entries())out.push(...await convert(child,start,end,`${path}/item[${i}]/block[${j}]`,quote,{id,level:(list?.level??-1)+1,ordered:b.ordered,label:j===0?(item.checked===undefined?b.ordered?`${(b.start??1)+i}. `:'• ':item.checked?'☑ ':'☐ '):''}));
      return out;
    }
    if(b.type==='quote'||b.type==='callout'){
      const out:JournalNode[]=b.type==='callout'?[{id,kind:'paragraph',role:'quote',content:[{text:b.kind,bold:true}],origin:baseOrigin}]:[];
      for(const [i,child]of b.blocks.entries())out.push(...await convert(child,start,end,`${path}/quote[${i}]`,quote+1,list));return out;
    }
    return [{id,kind:'paragraph',content:[{text:'—'}],origin:baseOrigin}];
  };
  const nodes:JournalNode[]=[];
  for(const [i,item]of parsed.entries()){
    if(i===0&&consume){p.document.importedMetadata??=[];p.document.importedMetadata.push({field:'title',sourceId:source.id,rule:'markdown-title',blocks:[{id:newId('title'),kind:'heading',level:1,content:[{text:p.document.title}],origin:origin(item.startLine,item.endLine,'title',p.document.title)}]});continue;}
    nodes.push(...await convert(item.block,item.startLine,item.endLine,`block[${i}]`));
  }
  // A plain image alt is a fallback title; an explicit adjacent Figure caption wins.
  for(const [i,n]of nodes.entries())if(n.kind==='figure'&&n.caption&&!n.caption.source){
    const adjacent=[nodes[i-1],nodes[i+1]].some(a=>a&&(a.kind==='paragraph'||a.kind==='heading')&&/^\s*(Figure|Fig\.?|그림)\s*\d/i.test(inlineText(a.content)));
    if(adjacent)delete n.caption;
  }
  attachCaptions(nodes);
  let abstract=false,references=false;
  for(const n of nodes){
    if(n.kind==='heading'||n.kind==='paragraph'){
      const text=inlineText(n.content).trim();
      if(/^(abstract|초록)[:.]?$/i.test(text)){
        abstract=true;references=false;p.document.importedMetadata??=[];p.document.importedMetadata.push({field:'abstractLabel',sourceId:source.id,rule:'markdown-abstract',blocks:[cloneJournal(n)]});continue;
      }
      if(/^keywords?\s*:/i.test(text)){p.document.keywords=text.replace(/^keywords?\s*:\s*/i,'').split(/[,;]/).map(s=>s.trim()).filter(Boolean);abstract=false;p.document.importedMetadata??=[];p.document.importedMetadata.push({field:'keywords',sourceId:source.id,rule:'markdown-keywords',blocks:[cloneJournal(n)]});continue;}
      if(n.kind==='heading')abstract=false;
      if(abstract){n.kind='paragraph';n.role='abstract';p.document.abstract.push(n);continue;}
      if(isReferenceHeading(n)){references=true;n.kind='heading';n.level=1;}
      else if(n.kind==='heading'||endMatterKind(text))references=false;
      if(references&&n.kind==='paragraph'){n.role='reference';const r=referenceCandidate(text);r.sourceParagraphIds=[n.id];p.references.push(r);}
    }
    p.document.blocks.push(n);
  }
  normalizeEditorial(p);
  applyMarkdownProperties(p,input.metadata??{},source.id);
  if(p.editorial)p.editorial.markdownBaseline={sourceId:source.id,document:cloneJournal(p.document),references:cloneJournal(p.references)};
  return source;
}

/** Keep the edited snapshot; changes from a newer source are explicit review proposals. */
export function mergeMarkdownRevision(current:JournalProject,incoming:JournalProject):JournalProject{
  const p=cloneJournal(current);if(!p.editorial)throw new Error('원고 정리 기능을 활성화하세요.');
  if(p.editorial.changes.some(c=>c.rule==='markdown-reimport'&&c.status==='pending'))throw new Error('앞선 Markdown 변경 목록을 먼저 확인하세요.');
  const oldSource=[...p.sources].reverse().find(s=>s.format==='markdown'),newSource=incoming.sources.find(s=>s.format==='markdown');
  if(!oldSource||!newSource)throw new Error('다시 가져올 Markdown 원고가 없습니다.');
  if(oldSource.sha256===newSource.sha256)return p;
  const assets=new Map<string,string>();
  for(const a of incoming.assets){const found=p.assets.find(b=>b.sha256===a.sha256);assets.set(a.id,found?.id??a.id);if(!found)p.assets.push(cloneJournal(a));}
  const document=cloneJournal(incoming.document),references=cloneJournal(incoming.references),baseline=p.editorial.markdownBaseline;
  const oldDocument=baseline?.document??p.document,old=oldDocument.blocks,fresh=document.blocks,used=new Set<string>(),ids=new Map<string,string>();
  const remapAssets=(value:unknown):void=>{if(!value||typeof value!=='object')return;for(const [key,v]of Object.entries(value)){if(key==='assetId'&&typeof v==='string')(value as Record<string,unknown>)[key]=assets.get(v)??v;else remapAssets(v);}};
  remapAssets(document);
  // Compare immutable source snapshots, never the editor's modified content.
  const shape=(value:unknown):string=>JSON.stringify(value,(key,v:unknown)=>['id','origin','source','sourceRows','reviewed','publication','importedMetadata','objectReference','sourceParagraphIds'].includes(key)?undefined:v);
  const exact=(n:JournalNode,b:JournalNode):boolean=>n.kind===b.kind&&shape(n)===shape(b);
  for(const [i,n]of fresh.entries()){
    const match=old.find(b=>!used.has(b.id)&&exact(n,b))??old.find(b=>!used.has(b.id)&&b.kind===n.kind&&b.origin?.path===n.origin?.path);
    const originalId=n.id;if(match){used.add(match.id);n.id=match.id;}ids.set(originalId,n.id);
    if(match&&exact(n,match))continue;
    const edited=p.document.blocks.find(b=>b.id===match?.id);
    p.editorial.changes.push({id:newId('reimport'),rule:'markdown-reimport',status:'pending',source:edited?[cloneJournal(edited)]:[],targetId:n.id,replacement:[n],reason:match?'Markdown 원문의 변경 내용을 기존 편집본과 비교하세요.':'Markdown 원문에 새 항목이 있습니다.',beforeId:fresh[i-1]?.id,afterId:fresh[i+1]?.id});
  }
  for(const n of old)if(!used.has(n.id))p.editorial.changes.push({id:newId('reimport'),rule:'markdown-reimport',status:'pending',source:[cloneJournal(n)],targetId:n.id,replacement:[],reason:'새 Markdown 원문에서 이 항목이 제거됐습니다.'});
  const remapIds=(value:unknown):void=>{if(!value||typeof value!=='object')return;for(const [key,v]of Object.entries(value)){if(['targetIds','sourceParagraphIds','ids'].includes(key)&&Array.isArray(v))(value as Record<string,unknown>)[key]=v.map((id:unknown)=>typeof id==='string'?ids.get(id)??id:id);else remapIds(v);}};
  remapIds(document);remapIds(references);
  for(const c of p.editorial.changes.filter(c=>c.rule==='markdown-reimport'&&c.status==='pending')){
    c.afterId=ids.get(c.afterId??'')??c.afterId;remapIds(c.replacement);c.referenceCandidates=cloneJournal(references);
  }
  const order=fresh.map(n=>n.id),retainedOld=old.filter(n=>order.includes(n.id)).map(n=>n.id),retainedNew=order.filter(id=>used.has(id));
  if(JSON.stringify(retainedOld)!==JSON.stringify(retainedNew))p.editorial.changes.push({id:newId('reimport'),rule:'markdown-reimport',status:'pending',source:[],reason:'Markdown 원문에서 항목 순서가 바뀌었습니다.',documentOrder:order});
  for(const key of ['title','runningTitle','authors','affiliations','abstract','keywords','doi','volume','issue','year','firstPage','received','revised','accepted','endMatter'] as const){
    if(shape(oldDocument[key])===shape(document[key]))continue;
    if(key==='endMatter')for(const e of document.endMatter??[]){const prior=oldDocument.endMatter?.find(o=>o.kind===e.kind);if(prior)e.id=prior.id;}
    p.editorial.changes.push({id:newId('reimport'),rule:'markdown-reimport',status:'pending',source:[],reason:`Markdown 원문 ${key} 변경을 확인하세요. 기존 편집값: ${JSON.stringify(p.document[key])}`,documentPatch:{[key]:document[key]}});
  }
  p.editorial.markdownBaseline={sourceId:newSource.id,document:cloneJournal(document),references};
  p.sources.push(cloneJournal(newSource));return p;
}
export function resolveMarkdownChange(p:JournalProject,id:string,apply:boolean):void{
  const c=p.editorial?.changes.find(c=>c.id===id);if(!c||c.rule!=='markdown-reimport'||c.status!=='pending')return;
  if(apply){
    if(c.documentPatch)Object.assign(p.document,cloneJournal(c.documentPatch));
    else if(c.documentOrder){
      const slots=p.document.blocks.map((n,i)=>c.documentOrder!.includes(n.id)?i:-1).filter(i=>i>=0),ordered=c.documentOrder.flatMap(id=>p.document.blocks.filter(n=>n.id===id));
      slots.forEach((slot,i)=>{p.document.blocks[slot]=ordered[i];});
    }else{
      const index=p.document.blocks.findIndex(n=>n.id===c.targetId),before=p.document.blocks.findIndex(n=>n.id===c.beforeId),after=p.document.blocks.findIndex(n=>n.id===c.afterId);
      p.document.blocks.splice(index>=0?index:before>=0?before+1:after>=0?after:p.document.blocks.length,index>=0?1:0,...cloneJournal(c.replacement??[]));
      p.references=p.references.filter(r=>!r.sourceParagraphIds?.includes(c.targetId??''));
      p.references.push(...cloneJournal((c.referenceCandidates??[]).filter(r=>r.sourceParagraphIds?.includes(c.targetId??'')&&c.replacement?.length)));
    }
    c.status='applied';
  }else c.status='reverted';
}
