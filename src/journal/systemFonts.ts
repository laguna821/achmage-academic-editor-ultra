/** Desktop-only, read-only boundary. No caller-controlled commands or filesystem paths. */
import { open, readdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { basename, extname, join, resolve, win32 } from "node:path";
import { fontFamilies } from "./fonts";

export interface SystemFont { id:string; name:string; family:string; style:string; path:string; size:number; modified:number }
export interface FontCatalog { fonts:SystemFont[]; warnings:string[] }
const extension=/\.(ttf|otf|ttc|otc)$/i;
const MAX_FONT=64*1024*1024;
const MAX_FILES=10000;
const allowed=new Map<string,SystemFont>();
let pending:Promise<FontCatalog>|undefined;
let result:FontCatalog|undefined;
const cached=new Map<string,{stamp:string;families:string[];style:string}>();

function command(platform:NodeJS.Platform):Promise<string>{
  const windows=join(process.env.SystemRoot||"C:/Windows","System32");
  const programs:Partial<Record<NodeJS.Platform,[string,string[]]>>={
    win32:[join(windows,"WindowsPowerShell/v1.0/powershell.exe"),["-NoProfile","-NonInteractive","-Command","[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; @('HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts','HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts') | ForEach-Object { if(Test-Path -LiteralPath $_) { $key=Get-Item -LiteralPath $_; foreach($name in $key.GetValueNames()) { $key.GetValue($name) } } }"]],
    darwin:["/usr/sbin/system_profiler",["SPFontsDataType","-json"]],
    linux:["fc-list",["--format=%{file}\n"]]
  };
  const spec=programs[platform];if(!spec)return Promise.reject(new Error("지원하지 않는 OS입니다."));
  return new Promise((accept,reject)=>execFile(spec[0],spec[1],{encoding:"utf8",windowsHide:true,timeout:30000,maxBuffer:16*1024*1024,shell:false},(error,stdout)=>error?reject(new Error(error.message)):accept(stdout)));
}
export function catalogPaths(platform:string,output:string,systemRoot="C:/Windows",userRoot=""):string[]{
  if(platform==="darwin"){
    const found:string[]=[];
    const walk=(v:unknown):void=>{if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==="object"){const row=v as Record<string,unknown>;if(row.enabled==="no"||row.valid==="no")return;for(const value of Object.values(row)){if(typeof value==="string"&&value.startsWith("/")&&extension.test(value))found.push(value);else if(typeof value==="object")walk(value);}}};
    walk(JSON.parse(output) as unknown);return [...new Set(found)];
  }
  return [...new Set(output.split(/\r?\n/).map(v=>v.trim()).filter(v=>extension.test(v)).flatMap(v=>platform==="win32"&&!win32.isAbsolute(v)?[win32.join(systemRoot,"Fonts",v),...(userRoot?[win32.join(userRoot,"Microsoft/Windows/Fonts",v)]:[])]:[v]))];
}
async function fontDirectories(roots:string[]):Promise<string[]>{
  const found:string[]=[];
  const walk=async(root:string,depth:number):Promise<void>=>{
    if(depth>8||found.length>=MAX_FILES)return;
    const entries=await readdir(root,{withFileTypes:true}).catch(()=>[]);
    for(const item of entries){if(found.length>=MAX_FILES)break;const path=join(root,item.name);if(item.isDirectory())await walk(path,depth+1);else if((item.isFile()||item.isSymbolicLink())&&extension.test(path))found.push(path);}
  };
  for(const root of roots)await walk(root,0);return found;
}
/** Read only SFNT headers/name tables for discovery; never load every font into memory. */
async function inspect(path:string):Promise<{families:string[];style:string}>{
  const file=await open(path,"r");
  const read=async(offset:number,size:number):Promise<Uint8Array>=>{const b=new Uint8Array(size);const r=await file.read(b,0,size,offset);if(r.bytesRead!==size)throw new Error("잘못된 글꼴 헤더");return b;};
  try{
    const first=await read(0,12),view=new DataView(first.buffer);
    const collection=view.getUint32(0)===0x74746366;
    const count=collection?view.getUint32(8):1;if(count<1||count>100)throw new Error("글꼴 face 한도");
    const offsets=collection?await read(12,count*4):new Uint8Array(4),families=new Set<string>();let style="Regular";
    for(let face=0;face<count;face++){
      const offset=new DataView(offsets.buffer).getUint32(face*4),header=await read(offset,12),n=new DataView(header.buffer).getUint16(4);
      if(n>256)continue;
      const tables=await read(offset+12,n*16),tv=new DataView(tables.buffer);
      for(let i=0;i<n;i++){
        if(tv.getUint32(i*16)!==0x6e616d65)continue;
        const start=tv.getUint32(i*16+8),len=tv.getUint32(i*16+12);if(len<6||len>1024*1024)continue;
        const names=await read(start,len),small=new Uint8Array(28+len),sv=new DataView(small.buffer);
        small.set(header);sv.setUint16(4,1);sv.setUint32(12,0x6e616d65);sv.setUint32(20,28);sv.setUint32(24,len);small.set(names,28);
        fontFamilies(small).forEach(f=>families.add(f));
        const nv=new DataView(names.buffer),total=nv.getUint16(2),strings=nv.getUint16(4),styles:{id:number;lang:number;text:string}[]=[];
        for(let j=0;j<total&&6+j*12+12<=len;j++){
          const at=6+j*12,id=nv.getUint16(at+6),size=nv.getUint16(at+8),pos=strings+nv.getUint16(at+10);
          if(![2,17].includes(id)||pos+size>len)continue;
          const platform=nv.getUint16(at);
          styles.push({id,lang:nv.getUint16(at+4),text:new TextDecoder(platform===0||platform===3?"utf-16be":"macintosh").decode(names.subarray(pos,pos+size)).replace(/\0/g,"").trim()});
        }
        styles.sort((a,b)=>b.id-a.id||Number(b.lang===0x409)-Number(a.lang===0x409));style=collection?"Collection":styles[0]?.text||"Regular";
      }
    }
    return {families:[...families],style};
  }finally{await file.close();}
}
export function discoverSystemFonts(refresh=false):Promise<FontCatalog>{
  if(pending)return pending;if(result&&!refresh)return Promise.resolve(result);
  pending=(async()=>{
    const platform=process.platform,local=process.env.LOCALAPPDATA||"",system=process.env.SystemRoot||"C:/Windows";
    const roots=platform==="win32"?[join(system,"Fonts"),...(local?[join(local,"Microsoft/Windows/Fonts")]:[])]:platform==="darwin"?["/System/Library/Fonts","/Library/Fonts",join(homedir(),"Library/Fonts")]:["/usr/share/fonts","/usr/local/share/fonts",join(homedir(),".fonts"),join(homedir(),".local/share/fonts")];
    const warnings:string[]=[];let registered:string[]=[];
    try{registered=catalogPaths(platform,await command(platform),system,local);}catch{warnings.push("OS 글꼴 목록 조회에 실패하여 표준 글꼴 폴더를 확인했습니다.");}
    // macOS profiler reflects active fonts. Directory fallback is only used when unavailable.
    const paths=[...new Set([...registered,...(platform==="darwin"&&registered.length?[]:await fontDirectories(roots))].map(p=>resolve(p)))].slice(0,MAX_FILES);
    const fonts:SystemFont[]=[];
    for(let start=0;start<paths.length;start+=8)await Promise.all(paths.slice(start,start+8).map(async path=>{
      try{
        const info=await stat(path);if(!info.isFile()||info.size>MAX_FONT)return;
        const stamp=info.size+":"+info.mtimeMs;let metadata=cached.get(path);
        if(metadata?.stamp!==stamp){metadata={...await inspect(path),stamp};cached.set(path,metadata);}
        for(const family of metadata.families)fonts.push({id:path+"#"+family,path,name:basename(path),family,style:metadata.style,size:info.size,modified:info.mtimeMs});
      }catch{/* Invalid, private, unavailable and unsupported font files are not selectable. */}
    }));
    fonts.sort((a,b)=>a.family.localeCompare(b.family)||a.style.localeCompare(b.style)||a.path.localeCompare(b.path));
    allowed.clear();for(const font of fonts)allowed.set(font.id,font);
    for(const path of cached.keys())if(!paths.includes(path))cached.delete(path);
    result={fonts,warnings};return result;
  })().finally(()=>{pending=undefined;});return pending;
}
export async function readSystemFont(id:string):Promise<{name:string;bytes:Uint8Array}>{
  const font=allowed.get(id);if(!font||!extension.test(font.path))throw new Error("설치 글꼴 목록을 새로고침하세요.");
  const file=await open(font.path,"r");
  try{
    const info=await file.stat();if(!info.isFile()||info.size!==font.size||info.mtimeMs!==font.modified||info.size>MAX_FONT)throw new Error("글꼴 파일이 바뀌었습니다. 목록을 새로고침하세요.");
    const bytes=new Uint8Array(info.size);let offset=0;while(offset<bytes.length){const r=await file.read(bytes,offset,bytes.length-offset,offset);if(!r.bytesRead)throw new Error("글꼴 읽기 실패");offset+=r.bytesRead;}
    if(!fontFamilies(bytes).includes(font.family))throw new Error("글꼴 이름이 달라졌습니다.");
    return {name:basename(font.path).replace(extname(font.path),extname(font.path).toLowerCase()),bytes};
  }finally{await file.close();}
}
