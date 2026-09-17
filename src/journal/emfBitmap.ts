/** Lossless recovery of a single, uncropped RGB bitmap inside an EMF container.
 * This is deliberately not a vector EMF renderer. Unsupported drawing records,
 * clipping, raster operations or transforms return null rather than lose art.
 * Record fields: Microsoft MS-EMF 2.3.1.7; BITMAPINFOHEADER (wingdi.h).
 */
export async function extractEmfBitmap(bytes:Uint8Array):Promise<Uint8Array|null>{
  if(bytes.length<88)return null;
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u=(p:number)=>v.getUint32(p,true),i=(p:number)=>v.getInt32(p,true);
  if(u(0)!==1||u(40)!==0x464d4520)return null;
  let at=0,bitmap=-1,recordSize=0,windowX=1,windowY=1,viewportX=1,viewportY=1,mapMode=1;
  const origin={wx:0,wy:0,vx:0,vy:0};
  while(at+8<=bytes.length){
    const kind=u(at),size=u(at+4);if(size<8||size%4||at+size>bytes.length)return null;
    if(kind===81){if(bitmap>=0||size<80)return null;bitmap=at;recordSize=size;}
    else if(kind===9||kind===11){if(size!==16||bitmap>=0)return null;if(kind===9){windowX=i(at+8);windowY=i(at+12);}else{viewportX=i(at+8);viewportY=i(at+12);}}
    else if(kind===10||kind===12){if(size!==16||bitmap>=0)return null;if(kind===10){origin.wx=i(at+8);origin.wy=i(at+12);}else{origin.vx=i(at+8);origin.vy=i(at+12);}}
    else if(kind===17){if(size!==12||bitmap>=0)return null;mapMode=i(at+8);}
    else if(kind===75){if(size!==16||u(at+8)!==0||u(at+12)!==5)return null;}
    else if(![1,14,21,37,48,70].includes(kind))return null;
    at+=size;if(kind===14)break;
  }
  if(bitmap<0||at!==bytes.length||![1,8].includes(mapMode)||!windowX||!windowY)return null;
  const p=bitmap,bmi=u(p+48),bmiSize=u(p+52),bits=u(p+56),bitsSize=u(p+60);
  if(bmi<80||bmiSize<40||bmi+bmiSize>recordSize||bits<bmi+bmiSize||bits+bitsSize>recordSize)return null;
  const h=p+bmi,w=i(h+4),signedHeight=i(h+8),height=Math.abs(signedHeight);
  if(u(h)!==40||w<1||height<1||w*height>20000000||v.getUint16(h+12,true)!==1||v.getUint16(h+14,true)!==24||u(h+16)!==0)return null;
  if(i(p+32)!==0||i(p+36)!==0||i(p+40)!==w||Math.abs(i(p+44))!==height||u(p+64)!==0||u(p+68)!==0x00cc0020)return null;
  const sx=mapMode===8?viewportX/windowX:1,sy=mapMode===8?viewportY/windowY:1;
  const x=(i(p+24)-origin.wx)*sx+origin.vx,y=(i(p+28)-origin.wy)*sy+origin.vy,dx=i(p+72)*sx,dy=i(p+76)*sy;
  // The image must occupy the whole EMF canvas, otherwise extracting it would
  // silently discard margins or crop positioning.
  if(Math.abs(Math.min(x,x+dx)-i(8))>1||Math.abs(Math.min(y,y+dy)-i(12))>1||Math.abs(Math.abs(dx)-(i(16)-i(8)+1))>1||Math.abs(Math.abs(dy)-(i(20)-i(12)+1))>1)return null;
  const stride=Math.ceil(w*3/4)*4;if(stride*height>bitsSize)return null;
  const raw=new Uint8Array((w*3+1)*height);
  for(let row=0;row<height;row++){
    const oriented=dy<0?height-1-row:row,sourceRow=signedHeight>0?height-1-oriented:oriented;
    for(let col=0;col<w;col++){
      const q=p+bits+sourceRow*stride+(dx<0?w-1-col:col)*3,d=row*(w*3+1)+1+col*3;
      raw[d]=bytes[q+2];raw[d+1]=bytes[q+1];raw[d+2]=bytes[q];
    }
  }
  const compressed=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const ihdr=new Uint8Array(13),header=new DataView(ihdr.buffer);header.setUint32(0,w);header.setUint32(4,height);ihdr[8]=8;ihdr[9]=2;
  const chunks=[new Uint8Array([137,80,78,71,13,10,26,10]),pngChunk("IHDR",ihdr),pngChunk("IDAT",compressed),pngChunk("IEND",new Uint8Array())];
  const out=new Uint8Array(chunks.reduce((sum,b)=>sum+b.length,0));let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.length;}return out;
}
function pngChunk(type:string,data:Uint8Array):Uint8Array{
  const out=new Uint8Array(data.length+12),v=new DataView(out.buffer);v.setUint32(0,data.length);out.set(new TextEncoder().encode(type),4);out.set(data,8);
  let crc=0xffffffff;for(const byte of out.subarray(4,out.length-4)){crc^=byte;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}v.setUint32(out.length-4,(crc^0xffffffff)>>>0);return out;
}
