/** Independently authored AF field stream and container. No native file/parser input. */
import {Buffer} from "node:buffer";
import {deflateSync,deflate} from "node:zlib";
import {promisify} from "node:util";
import {setTimeout as yieldArchive} from "node:timers/promises";
const compressAsync=promisify(deflate);
const cat = (...parts) => Buffer.concat(parts.flat());
const byte = n => Buffer.from([n]);
const u16 = n => { const b=Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = n => { const b=Buffer.alloc(4); b.writeUInt32LE(n>>>0); return b; };
const u64 = n => { const b=Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const tag = name => { if(name.length!==4) throw Error('Expected four-byte tag'); return Buffer.from([...name].reverse().join(''),'latin1'); };
const field = (name,type,value,array=false) => ({name,type,value,array});
const text = (name,value) => field(name,43,value);
const int = (name,value) => field(name,7,value);
const real = (name,value) => field(name,10,value);
const bool = (name,value) => field(name,41,!!value);
const ref = (name,value) => field(name,49,value);
const refs = (name,value) => field(name,49,value,true);
const dbls = (name,value) => field(name,10,value,true);
const rect = (name,value) => field(name,38,value);
const matrix = (x=0,y=0) => field('Xfrm',40,[1,0,x,0,1,y]);
const local = (name,kind,fields,version=1) => field(name,50,{kind,version,fields});
const localArray = (name,kind,value,version=1) => ({...field(name,50,value,true),kind,version});
// Research writer primitives. No native document is read by the constructors.
export const nativeFields={field,text,int,real,bool,ref,refs,dbls,rect,matrix,local,localArray};
const kinds = {DocN:1,LogN:0,Node:0,Sprd:1,Scop:1,TxtF:2,Stry:3,StBl:2,GAtt:2,PAtt:3,CoFr:1,TxFl:1,ShpN:2,VNod:0,ShNR:3,Shpe:0,FilS:1,Fill:0,FDsc:1,RGBA:1,SpMd:1,PgIn:1,UVCn:1,ApVs:1,DocS:1,TxtT:2,TbFr:1,Tabl:1,BrGl:1,Glyp:0,LDsc:2,LSty:1,Grup:1,Rstr:1,DyBm:1,Blck:1};
Object.assign(kinds,{EmbN:2,EmbR:1,EmbC:1,EDCI:1,EmPL:1,EmSC:2,PBxR:1,HlkD:1,ImgN:1,FlDS:1,DSrc:0});
Object.assign(kinds,{FilN:1,OtAt:1,OpAA:1,HlkA:1,PgNG:1,MPIN:1,ILSN:1,ILGI:1,ILTI:1,ILCP:1});

export class NativeRegistry {
  objects=[];
  object(types,fields=[]) {
    if(!types.length || new Set(types).size!==types.length) throw Error('Expected a nonempty, unique class chain');
    const object={id:this.objects.length,types,fields}; this.objects.push(object); return object;
  }
  document(fields, documentKind='Pers') {
    const emitted=new Set(),classes=new Set(),owned=new Set(this.objects);
    function shared(obj) {
      if(!obj) return byte(0);
      if(!owned.has(obj)) throw Error('Object reference belongs to another registry');
      if(emitted.has(obj.id)) return cat(byte(2),u32(obj.id));
      emitted.add(obj.id);
      const prefix=[byte(1),u32(obj.id)];
      for(const kind of obj.types) {
        if(classes.has(kind)) { prefix.push(byte(1),tag(kind)); return cat(prefix,group(obj.fields)); }
        if(!(kind in kinds)) throw Error('Unspecified class version: '+kind);
        classes.add(kind); prefix.push(byte(0),tag(kind),u16(kinds[kind]),byte(0));
      }
      return cat(prefix,byte(2),group(obj.fields));
    }
    function number(type,value) {
      if(type===1) return byte(value);
      if(type===41) return byte(value?1:0);
      if([3,7,42].includes(type)) return u32(value);
      if(type===21 || type===23) return cat(value.map(u32));
      if(type===4 || type===8) return u64(value);
      if(type===45 && Buffer.isBuffer(value)) return cat(u32(value.length),value);
      if(type===51) return cat(tag(value.kind),u32(Buffer.byteLength(value.name)),Buffer.from(value.name));
      if(type===44 && Buffer.isBuffer(value)) return value;
      if(type===9) { const b=Buffer.alloc(4);b.writeFloatLE(value);return b; }
      if([10,36,38,40].includes(type)) {
        const values=Array.isArray(value)?value:[value],b=Buffer.alloc(values.length*8);
        for(const [i,v] of values.entries()) { if(!Number.isFinite(v)) throw Error('Non-finite coordinate'); b.writeDoubleLE(v,i*8); } return b;
      }
      if(type===43) { const b=Buffer.from(value,'utf8');return cat(u32(b.length),b); }
      if(type===68 && Buffer.isBuffer(value) && value.length===16) return value;
      throw Error('Unimplemented primitive '+type);
    }
    function value(f,v) {
      if(f.type===49) return shared(v);
      if(f.type===50) return v?cat(byte(1),f.array?[]:[tag(v.kind),u16(v.version)],group(v.fields)):byte(0);
      return number(f.type,v);
    }
    function group(fields) {
      const output=[],names=new Set();
      for(const f of fields) {
        if(names.has(f.name)) throw Error('Duplicate object field: '+f.name);
        names.add(f.name);
        const values=f.array?f.value:[f.value],payload=cat(values.map(v=>value(f,v)));
        output.push(byte(f.type+(f.array?128:0)),tag(f.name));
        if(f.array) {
          if(f.type===43) output.push(u32(payload.length));
          output.push(u32(values.length));
          if(f.type===50) output.push(tag(f.kind),u16(f.version));
        }
        if(f.type===44) output.push(u16(f.value.length));
        output.push(payload);
      }
      return cat(output,byte(0));
    }
    // Document v2 / Pers class / revision 1 / property schema 32.
    return cat(u32(0x534bff00),u16(2),tag(documentKind),u16(1),u32(32),group(fields));
  }
}

const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
export function crc32(bytes) { let crc=0xffffffff;for(const b of bytes)crc=(crc>>>8)^crcTable[(crc^b)&255];return (crc^0xffffffff)>>>0; }
export function freshArchive(document,compress=true,assets=[]) {return assembleArchive(document,compress,assets);}
/**
 * @param {Buffer} document
 * @param {{name:string,bytes:Buffer}[]} assets
 * @param {import('./types').AfProgress} options
 */
export async function freshArchiveAsync(document,assets=[],options={}){
  const prepared=[];
  const yieldWork=()=>yieldArchive(0,undefined,{signal:options.signal});
  const checksum=async bytes=>{
    let crc=0xffffffff;
    for(let offset=0;offset<bytes.length;offset+=262144){
      await yieldWork();
      for(let i=offset,end=Math.min(bytes.length,offset+262144);i<end;i++)crc=(crc>>>8)^crcTable[(crc^bytes[i])&255];
    }
    return (crc^0xffffffff)>>>0;
  };
  for(const member of [{name:'doc.dat',bytes:document},...assets]){
    await yieldWork();
    const payload=await compressAsync(member.bytes);
    prepared.push({payload,checksum:await checksum(member.bytes),packedChecksum:await checksum(payload)});
  }
  await yieldWork();return assembleArchive(document,true,assets,prepared);
}
function assembleArchive(document,compress=true,assets=[],prepared){
  const members=[{name:'doc.dat',bytes:document},...assets],names=new Set(),chunks=[],entries=[],directories=new Map();
  let offset=72,totalPacked=0;
  for(const [i,member] of members.entries()) {
    if(!Buffer.isBuffer(member.bytes) || !/^[a-z0-9./-]+$/i.test(member.name) || member.name.split('/').some(p=>!p||p==='.'||p==='..') || names.has(member.name)) throw Error('Invalid or duplicate archive member');
    names.add(member.name);
    const payload=prepared?.[i]?.payload??(compress?deflateSync(member.bytes):member.bytes),name=Buffer.from(member.name),entry=Buffer.alloc(44+name.length);
    entry.writeUInt32LE(i+1);entry.writeBigUInt64LE(BigInt(offset),5);entry.writeBigUInt64LE(BigInt(member.bytes.length),13);entry.writeBigUInt64LE(BigInt(payload.length),21);
    entry.writeUInt32LE(prepared?.[i]?.checksum??crc32(member.bytes),29);entry[33]=compress?1:0;entry.writeUInt32LE(32,34);entry.writeUInt32LE(prepared?.[i]?.packedChecksum??crc32(payload),38);entry.writeUInt16LE(name.length,42);name.copy(entry,44);
    entries.push(entry);chunks.push(cat(Buffer.from('#Fil'),payload,Buffer.alloc(4,255)));offset+=payload.length+8;totalPacked+=payload.length;
    if(member.name.includes('/')) {const dir=member.name.slice(0,member.name.lastIndexOf('/')+1);directories.set(dir,(directories.get(dir)??0)+1);}
  }
  const dirEntries=[...directories].map(([name,count])=>cat(u16(name.length),u16(0),u32(count),u32(0),Buffer.from(name)));
  const header=Buffer.alloc(72),fat=Buffer.alloc(59);
  header.writeUInt32LE(0x414bff00);header.writeUInt16LE(12,4);header.writeUInt16LE(0x400,6);tag('Prsn').copy(header,8);Buffer.from('#Inf').copy(header,12);
  header.writeBigUInt64LE(BigInt(offset),16);header.writeBigUInt64LE(BigInt(totalPacked),32);header.writeBigUInt64LE(BigInt(1789516800),48);
  header.writeUInt32LE(1,56);header.writeUInt32LE(members.length+1,60);Buffer.from('Prot').copy(header,64);header.writeUInt32LE(48,68);
  Buffer.from('#FT4').copy(fat);fat.writeBigUInt64LE(BigInt(1789516800),12);fat.writeBigUInt64LE(BigInt(totalPacked),28);fat.writeUInt32LE(members.length,44);fat.writeUInt32LE([...entries,...dirEntries].reduce((n,b)=>n+b.length,0),52);fat.writeUInt16LE(dirEntries.length,56);
  // Keep both tail boundaries valid even without a thumbnail payload. Affinity
  // begins its first in-place save at header[24]; zero overwrites the header
  // with #Fil and subsequently triggers a misleading ownership error.
  const tail=BigInt(offset+fat.length+fat.readUInt32LE(52));
  header.writeBigUInt64LE(tail,24);fat.writeBigUInt64LE(tail,20);
  return cat(header,chunks,fat,entries,dirEntries);
}

