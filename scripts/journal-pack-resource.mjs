import {gzipSync,brotliCompressSync,constants} from 'node:zlib';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
// Content-addressed build cache: no compression work during plugin startup.
export async function packResource(raw){
  const sha256=createHash('sha256').update(raw).digest('hex');
  const folder='node_modules/.cache/hanmark-resources',file=`${folder}/${sha256}-br11-gzip9.json`;
  try{const cached=JSON.parse(await fs.readFile(file,'utf8'));if(cached.sha256===sha256&&cached.bytes===raw.length)return cached;}catch{/* Rebuild missing cache. */}
  const gzip=gzipSync(raw,{level:9}),br=brotliCompressSync(raw,{params:{[constants.BROTLI_PARAM_QUALITY]:11}});
  const codec=br.length<gzip.length?'br':'gzip',packed=codec==='br'?br:gzip;
  const resource={codec,data:packed.toString('base64'),bytes:raw.length,sha256};
  await fs.mkdir(folder,{recursive:true});await fs.writeFile(file,JSON.stringify(resource));
  console.log(`Resource ${sha256.slice(0,12)}: ${raw.length} raw, ${gzip.length} gzip, ${br.length} Brotli; ${codec}`);
  return resource;
}
