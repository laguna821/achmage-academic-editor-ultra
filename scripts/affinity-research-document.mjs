/** Research-only lossless field walker. Unknown primitive bytes are preserved.
 * No renderer, application automation or release dependency. This does NOT
 * establish the semantics required to create arbitrary native documents.
 */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export function readDocument(data){
  let at=0;const fields=[];
  const take=n=>{if(!Number.isSafeInteger(n)||n<0||at+n>data.length)throw Error('Invalid field extent at '+at);const b=data.subarray(at,at+n);at+=n;return b;};
  const u8=()=>take(1)[0],u16=()=>take(2).readUInt16LE(),u32=()=>take(4).readUInt32LE();
  const tag=()=>take(4).toString('latin1').split('').reverse().join('');
  const node=(parts,meta={})=>({parts,...meta});
  const primitiveSizes={1:1,2:2,3:4,4:8,5:1,6:2,7:4,8:8,9:4,10:8,21:8,22:12,23:16,24:20,25:24,31:8,32:12,33:16,34:20,35:24,36:16,37:24,38:32,39:40,40:48,47:4,52:4};
  function group(tagged=true,depth=0){
    if(depth>150)throw Error('Object depth exceeded');const out=[];
    while(true){const start=at,b=u8();if(b===0){out.push(data.subarray(start,at));return node(out);}
      const name=tagged?tag():null,type=b&127,array=!!(b&128);let count=1;
      if(array){if(type===43||type===46)take(4);count=u32();if(count>1000000)throw Error('Array limit');}
      let sharedHeader=false,span=0;
      if(type===42&&array)take(2);
      if(type===44)span=u16();
      if(type===50&&array){take(6);sharedHeader=true;}
      const field=node([data.subarray(start,at)],{name,type,array,count,start});fields.push(field);
      if(type===41){field.parts.push(take(Math.ceil(count/8)));out.push(field);continue;}
      for(let i=0;i<count;i++){
        const valueStart=at;
        if(primitiveSizes[type])field.parts.push(take(primitiveSizes[type]));
        else if(type===43||type===46){const n=u32();take(n);field.parts.push(data.subarray(valueStart,at));}
        else if(type===45){take(u32());field.parts.push(data.subarray(valueStart,at));}
        else if(type===42)field.parts.push(take(array?2:4));
        else if(type===44)field.parts.push(take(span));
        else if(type>=53&&type<=116)field.parts.push(take(type-52));
        else if(type===117){take(2);take(u8());field.parts.push(data.subarray(valueStart,at));}
        else if(type===51){take(4);take(u32());field.parts.push(data.subarray(valueStart,at));}
        else if(type===48)field.parts.push(group(false,depth+1));
        else if(type===50){const flag=u8();if(flag&&!sharedHeader)take(6);const obj=node([data.subarray(valueStart,at)],{status:flag?3:0});if(flag)obj.parts.push(group(true,depth+1));field.parts.push(obj);}
        else if(type===49){
          const status=u8(),obj=node([],{status});if(status===1||status===2)obj.id=u32();
          obj.parts.push(data.subarray(valueStart,at));
          if(status===1){
            obj.types=[];
            while(true){const pos=at,flag=u8();if(flag===2){obj.parts.push(data.subarray(pos,at));break;}
              if(flag!==0&&flag!==1)throw Error('Unknown object metadata flag at '+pos);
              const name=tag();obj.types.push(name);if(flag===0)take(2);obj.parts.push(data.subarray(pos,at));
              if(flag===1)break;obj.parts.push(group(true,depth+1));
            }
            obj.parts.push(group(true,depth+1));
          }else if(status!==0&&status!==2)throw Error('Unknown shared object status');
          field.parts.push(obj);
        }else throw Error('Unsupported field '+type.toString(16)+' at '+at);
      }
      field.end=at;out.push(field);
    }
  }
  assert.equal(u32(),0x534bff00);const version=u16();assert.ok(version<=2);take(6);if(version===2)take(4);
  const header=data.subarray(0,at),root=node([header,group()]);root.parts.push(take(data.length-at));
  return {root,fields};
}
export function writeDocument(node){return Buffer.concat(node.parts.map(p=>Buffer.isBuffer(p)?p:writeDocument(p)));}
export function fieldText(field){if(![43,46].includes(field.type)||field.array)return null;return field.parts[1].subarray(4).toString('utf8');}
export function setFieldText(field,text){assert.ok([43,46].includes(field.type)&&!field.array);const value=Buffer.from(text,'utf8'),length=Buffer.alloc(4);length.writeUInt32LE(value.length);field.parts[1]=Buffer.concat([length,value]);}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: <doc.dat> <roundtrip.dat>');
  const original=await fs.readFile(input),parsed=readDocument(original),written=writeDocument(parsed.root);assert.deepEqual(written,original);
  await fs.writeFile(output,written);console.log(JSON.stringify({bytes:written.length,fields:parsed.fields.length,sha256:createHash('sha256').update(written).digest('hex'),roundtripExact:true}));
}
