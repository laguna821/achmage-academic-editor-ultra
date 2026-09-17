import { Buffer } from 'node:buffer';
import { brotliDecompress, gunzip } from 'node:zlib';

/** Desktop host codec. Browser harnesses substitute only this boundary. */
export function decodePacked(codec:'br'|'gzip',data:string):Promise<Uint8Array>{
  return new Promise((resolve,reject)=>{
    const decode=codec==='br'?brotliDecompress:gunzip;
    decode(Buffer.from(data,'base64'),(error,bytes)=>error?reject(error):resolve(new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength)));
  });
}
