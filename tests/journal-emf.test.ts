import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {extractEmfBitmap} from '../src/journal/emfBitmap';
import {imageInfo} from '../src/journal/imageInfo';

function fixture():Uint8Array{
  const bytes=new Uint8Array(244),v=new DataView(bytes.buffer),u=(p:number,n:number)=>v.setUint32(p,n,true);
  u(0,1);u(4,88);u(16,1);u(20,1);u(40,0x464d4520);u(48,bytes.length);u(52,3);
  const p=88;u(p,81);u(p+4,136);u(p+40,2);u(p+44,2);u(p+48,80);u(p+52,40);u(p+56,120);u(p+60,16);u(p+68,0x00cc0020);u(p+72,2);u(p+76,2);
  u(p+80,40);u(p+84,2);u(p+88,2);v.setUint16(p+92,1,true);v.setUint16(p+94,24,true);
  // Bottom-up BGR: blue / white on bottom, red / green on top, padded rows.
  bytes.set([255,0,0,255,255,255,0,0,0,0,255,0,255,0,0,0],p+120);u(224,14);u(228,20);u(240,20);return bytes;
}
test('EMF bitmap extraction preserves every RGB pixel and bottom-up orientation',async()=>{
  const png=await extractEmfBitmap(fixture());assert.ok(png);const b=Buffer.from(png);assert.equal(b.readUInt32BE(16),2);assert.equal(b.readUInt32BE(20),2);
  let at=8;const chunks:Buffer[]=[];while(at<b.length){const n=b.readUInt32BE(at);if(b.toString('ascii',at+4,at+8)==='IDAT')chunks.push(b.subarray(at+8,at+8+n));at+=n+12;}
  assert.deepEqual([...inflateSync(Buffer.concat(chunks))],[0,255,0,0,0,255,0,0,0,0,255,255,255,255]);
});
test('EMF extraction rejects cropping, non-copy operations, extra drawing and truncated records',async()=>{
  for(const [offset,value]of [[88+32,1],[88+68,0],[224,42],[88+4,10000],[88+84,30000000]]){const bytes=fixture();new DataView(bytes.buffer).setUint32(offset,value,true);assert.equal(await extractEmfBitmap(bytes),null);}
  for(const n of [0,40,89,243])assert.equal(await extractEmfBitmap(fixture().slice(0,n)),null);
});
test('vector EMF reserves its real frame ratio without inventing raster DPI',()=>{
  const bytes=fixture(),v=new DataView(bytes.buffer);v.setInt32(32,30000,true);v.setInt32(36,5000,true);
  const info=imageInfo(bytes,'diagram.emf','image/x-emf');assert.equal(info.aspectRatio,6);assert.equal(info.widthPx,undefined);assert.equal(info.mime,'image/x-emf');
});
