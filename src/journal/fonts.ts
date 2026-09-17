import { digestBytes } from "./storage";
import { newId, type BinaryStore, type JournalProject } from "./types";

/** Read family names from the font itself; a filename is not a reliable family. */
export function fontFamilies(bytes: Uint8Array): string[] {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),families=new Set<string>();
  const u16=(n:number):number=>view.getUint16(n),u32=(n:number):number=>view.getUint32(n);
  if(bytes.length<12)throw new Error("글꼴 파일이 너무 짧습니다.");
  const offsets=u32(0)===0x74746366?Array.from({length:Math.min(u32(8),100)},(_,i)=>u32(12+i*4)):[0];
  for(const offset of offsets){
    if(offset+12>bytes.length)continue;
    for(let i=0;i<Math.min(u16(offset+4),256);i++){
      const entry=offset+12+i*16;
      if(entry+16>bytes.length||u32(entry)!==0x6e616d65)continue;
      const start=u32(entry+8),length=u32(entry+12);
      if(start+length>bytes.length||length<6)continue;
      const count=u16(start+2),strings=start+u16(start+4),names:{id:number;lang:number;text:string}[]=[];
      for(let j=0;j<count;j++){
        const record=start+6+j*12;if(record+12>start+length)break;
        const platform=u16(record),id=u16(record+6),len=u16(record+8),pos=strings+u16(record+10);
        if(![1,16].includes(id)||pos+len>start+length)continue;
        const text=(platform===0||platform===3?new TextDecoder("utf-16be"):new TextDecoder("macintosh")).decode(bytes.subarray(pos,pos+len)).replace(/\0/g,"").trim();
        if(text)names.push({id,lang:u16(record+4),text});
      }
      names.sort((a,b)=>(b.id-a.id)||Number(b.lang===0x409)-Number(a.lang===0x409));
      if(names[0])families.add(names[0].text);
    }
  }
  if(!families.size)throw new Error("TTF·OTF·TTC 글꼴의 패밀리 이름을 읽을 수 없습니다.");
  return [...families];
}
export async function registerFont(project:JournalProject,store:BinaryStore,name:string,bytes:Uint8Array):Promise<void>{
  const families=fontFamilies(bytes),sha256=await digestBytes(bytes),path=`fonts/${sha256}.${name.split(".").pop()?.toLowerCase()||"ttf"}`;
  await store.put(path,bytes);
  for(const family of families)if(!project.fonts.some(f=>f.sha256===sha256&&f.family===family))project.fonts.push({id:newId("font"),name,family,path,sha256});
}
