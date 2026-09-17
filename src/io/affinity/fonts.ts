import type {AfFont} from './types';

/** SFNT/TTC names and style flags from the same bytes used to compose the PDF. */
export function afFontFaces(bytes:Uint8Array):AfFont[]{
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),faces:AfFont[]=[];
  const inside=(offset:number,length:number):boolean=>Number.isSafeInteger(offset)&&offset>=0&&offset+length<=bytes.length;
  if(!inside(0,12))throw Error('글꼴 헤더가 올바르지 않습니다.');
  const collection=v.getUint32(0)===0x74746366,count=collection?v.getUint32(8):1;
  if(count<1||count>100||collection&&!inside(12,count*4))throw Error('글꼴 모음이 올바르지 않습니다.');
  for(let i=0;i<count;i++){
    const offset=collection?v.getUint32(12+i*4):0;if(!inside(offset,12))throw Error('글꼴 위치가 올바르지 않습니다.');
    const n=v.getUint16(offset+4);if(n>256||!inside(offset+12,n*16))throw Error('글꼴 테이블이 올바르지 않습니다.');
    const tables=new Map<number,{at:number;length:number}>();
    for(let j=0;j<n;j++){const p=offset+12+j*16,at=v.getUint32(p+8),length=v.getUint32(p+12);if(!inside(at,length))throw Error('글꼴 데이터가 잘렸습니다.');tables.set(v.getUint32(p),{at,length});}
    const name=tables.get(0x6e616d65);if(!name||name.length<6)continue;
    const names:{id:number;rank:number;text:string}[]=[],total=v.getUint16(name.at+2),strings=name.at+v.getUint16(name.at+4);
    for(let j=0;j<total;j++){
      const p=name.at+6+j*12;if(p+12>name.at+name.length)throw Error('글꼴 이름 테이블이 잘렸습니다.');
      const platform=v.getUint16(p),lang=v.getUint16(p+4),id=v.getUint16(p+6),length=v.getUint16(p+8),at=strings+v.getUint16(p+10);
      if(![1,2,6,16,17].includes(id)||at<name.at||at+length>name.at+name.length)continue;
      const text=new TextDecoder(platform===0||platform===3?'utf-16be':'macintosh').decode(bytes.subarray(at,at+length)).replace(/\0/g,'').trim();
      if(text)names.push({id,rank:(lang===0x409?4:0)+(platform===3?2:platform===0?1:0),text});
    }
    const get=(id:number):string=>names.filter(n=>n.id===id).sort((a,b)=>b.rank-a.rank)[0]?.text??'';
    const post=get(6),family=get(16)||get(1),style=get(17)||get(2),os=tables.get(0x4f532f32),head=tables.get(0x68656164);
    const flags=os&&os.length>=64?v.getUint16(os.at+62):0,mac=head&&head.length>=46?v.getUint16(head.at+44):0;
    if(post&&family)faces.push({family,post,bold:!!(flags&32)||!!(mac&1)||/bold/i.test(style),italic:!!(flags&1)||!!(mac&2)||/italic|oblique/i.test(style)});
  }
  if(!faces.length)throw Error('글꼴의 PostScript 이름을 읽을 수 없습니다. TTF·OTF·TTC 파일을 등록하세요.');
  return faces;
}
