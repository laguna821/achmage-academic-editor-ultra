import {brotliDecompressSync,gunzipSync} from 'node:zlib';
/** Test-only adapter. Production uses asynchronous node:zlib in Obsidian. */
export const browserResourceCodec={name:'journal-test-resource-codec',setup(build){
  build.onLoad({filter:/[\\/]journal[\\/]resourceCodec\.ts$/},()=>({loader:'js',contents:`export async function decodePacked(codec,data){
    const response=await fetch('/__hanmark_resource',{method:'POST',body:JSON.stringify({codec,data})});
    if(!response.ok)throw Error('Test resource decoding failed');return new Uint8Array(await response.arrayBuffer());
  }`}));
}};
export async function installResourceCodec(page){
  await page.route('**/__hanmark_resource',async route=>{
    try{const {codec,data}=JSON.parse(route.request().postData());const packed=Buffer.from(data,'base64');
      await route.fulfill({status:200,contentType:'application/octet-stream',body:codec==='br'?brotliDecompressSync(packed):gunzipSync(packed)});
    }catch(error){await route.fulfill({status:500,body:String(error)});}
  });
}
