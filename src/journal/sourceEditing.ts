import {isMap, isScalar, parseDocument, stringify} from 'yaml';

export interface SourceParts {prefix:string;yaml:string;suffix:string;body:string;eol:string}
export function sourceParts(text:string):SourceParts {
  const eol=text.includes('\r\n')?'\r\n':'\n';
  const match=text.match(/^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n(?:---|\.\.\.)[^\S\r\n]*(?:\r?\n|$))/);
  if(!match&&/^\uFEFF?---\r?\n/.test(text))throw Error('YAML: 닫는 --- 줄이 없습니다. 원문 첫 부분을 확인하세요.');
  if(!match)return {prefix:'',yaml:'',suffix:'',body:text,eol};
  return {prefix:match[1],yaml:match[2],suffix:match[3],body:text.slice(match[0].length),eol};
}
function yamlDocument(text:string){
  const document=parseDocument(text,{keepSourceTokens:true,uniqueKeys:true});
  if(document.errors.length)throw Error('YAML: '+document.errors[0].message);
  if(document.contents&&!isMap(document.contents))throw Error('YAML 속성은 이름: 값 형식이어야 합니다.');
  return document;
}
export function sourceProperties(text:string):Record<string,unknown>{return (yamlDocument(sourceParts(text).yaml).toJS()??{}) as Record<string,unknown>;}
/** Patch only the selected top-level pairs. Unrelated YAML, comments and body stay byte-for-byte intact. */
export function patchSourceProperties(text:string,changes:Record<string,unknown>):string {
  const parts=sourceParts(text),document=yamlDocument(parts.yaml),patches:{start:number;end:number;text:string}[]=[];
  const added:string[]=[];
  for(const [key,value]of Object.entries(changes)){
    const pair=isMap(document.contents)?document.contents.items.find(p=>isScalar(p.key)&&p.key.value===key):undefined;
    const replacement=value===undefined?'':stringify({[key]:value},{lineWidth:0}).trimEnd().replace(/\n/g,parts.eol);
    if(pair&&isScalar(pair.key)&&pair.key.range){
      const start=pair.key.range[0],range=pair.value&&typeof pair.value==='object'&&'range' in pair.value?pair.value.range as [number,number,number]|undefined:undefined;
      let end=range?.[1]??(parts.yaml.indexOf('\n',start)<0?parts.yaml.length:parts.yaml.indexOf('\n',start));
      if(value===undefined){end=range?.[2]??end;if(parts.yaml[end]==='\r')end++;if(parts.yaml[end]==='\n')end++;}
      const newline=value!==undefined&&parts.yaml.slice(start,end).endsWith('\n')?parts.eol:'';
      patches.push({start,end,text:replacement+newline});
    }else if(value!==undefined)added.push(replacement);
  }
  let yaml=parts.yaml;for(const p of patches.sort((a,b)=>b.start-a.start))yaml=yaml.slice(0,p.start)+p.text+yaml.slice(p.end);
  if(added.length)yaml+=(yaml&&!yaml.endsWith('\n')?parts.eol:'')+added.join(parts.eol);
  const result=parts.prefix?parts.prefix+yaml+parts.suffix+parts.body:(text.startsWith('\uFEFF')?'\uFEFF':'')+'---'+parts.eol+yaml+parts.eol+'---'+parts.eol+text.replace(/^\uFEFF/,'');
  sourceProperties(result);return result;
}
export function replaceSourceBody(text:string,body:string):string {const p=sourceParts(text);return p.prefix+p.yaml+p.suffix+body;}
export class SourceEditConflict extends Error {
  constructor(readonly base:string,readonly local:string,readonly remote:string){super('원문이 다른 창이나 동기화에서 변경되었습니다. 두 편집 내용을 확인하세요.');}
}
/** Independent body/frontmatter changes merge. Competing edits are never silently discarded. */
export function mergeSourceEdits(base:string,local:string,remote:string):string {
  if(remote===base||remote===local)return local;
  if(local===base)return remote;
  const b=sourceParts(base),l=sourceParts(local),r=sourceParts(remote);
  const front=(p:SourceParts)=>p.prefix+p.yaml+p.suffix;
  const bodyChanged=l.body!==b.body,frontChanged=front(l)!==front(b);
  if(bodyChanged&&r.body!==b.body&&r.body!==l.body||frontChanged&&front(r)!==front(b)&&front(r)!==front(l))throw new SourceEditConflict(base,local,remote);
  return (frontChanged?front(l):front(r))+(bodyChanged?l.body:r.body);
}
