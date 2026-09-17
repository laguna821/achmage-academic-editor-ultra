import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {packResource} from './journal-pack-resource.mjs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const manifest=JSON.parse(await fs.readFile('assets/journal/ocr/manifest.json','utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const resources={};
for(const name of ['eng','kor']){
  const packed=await fs.readFile(`assets/journal/ocr/${name}.traineddata.gz`),raw=gunzipSync(packed);
  if(hash(raw)!==manifest.files[`${name}.traineddata.gz`].sha256)throw new Error('OCR language hash mismatch: '+name);
  resources[name]=await packResource(raw);
}
const wasm=await fs.readFile('node_modules/tesseract.js-core/tesseract-core-lstm.wasm');
const packages=await Promise.all(['tesseract.js','tesseract.js-core'].map(async name=>JSON.parse(await fs.readFile(`node_modules/${name}/package.json`,'utf8')).version));
if(packages.some(v=>v!=='7.0.0'))throw new Error('OCR runtime versions must match the reviewed 7.0.0 pins');
const result=await build({entryPoints:['src/journal/ocr.worker.ts'],bundle:true,write:false,platform:'browser',format:'iife',target:'es2022',minify:true,define:{global:'globalThis','process':'undefined'},plugins:[{name:'local-ocr-only',setup(b){
  b.onResolve({filter:/^(fs|crypto|regenerator-runtime\/runtime)$/},a=>({path:a.path,namespace:'ocr-static'}));
  b.onLoad({filter:/.*/,namespace:'ocr-static'},a=>({contents:a.path==='fs'?'module.exports={readFileSync(){throw new Error("Native OCR files disabled")}};':a.path==='crypto'?'module.exports={randomFillSync(bytes){return globalThis.crypto.getRandomValues(bytes)}};':'module.exports={};',loader:'js'}));
}}]});
const worker=result.outputFiles[0].text.replaceAll('console.log','(()=>{})');
if(/new Function|\beval\s*\(|\bimport\(|importScripts\(/.test(worker))throw new Error('Unreviewed executable loading in OCR worker');
resources.wasm=await packResource(wasm);
const version=`tesseract-${packages.join('-')}/${manifest.revision}/scalar-lstm-eng-kor`;
await fs.writeFile('src/journal/ocr.generated.ts',`// Generated from pinned, local OCR resources.\nexport const OCR_WORKER=${JSON.stringify(worker)};\nexport const OCR_RESOURCES=${JSON.stringify(resources)} as const;\nexport const OCR_VERSION=${JSON.stringify(version)};\n`);
const bytes=Buffer.byteLength(worker)+Buffer.byteLength(JSON.stringify(resources));
if(bytes>16_000_000)throw new Error('OCR resources exceed the separate 16 MB budget');
console.log(`OCR: ${bytes} embedded bytes; ${version}`);
