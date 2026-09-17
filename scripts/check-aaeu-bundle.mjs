import fs from 'node:fs/promises';
const code=await fs.readFile('main.js','utf8');
const meta=JSON.parse(await fs.readFile('test-artifacts/bundle-metafile.json','utf8').catch(()=>'{"inputs":{}}'));
if(Buffer.byteLength(code)>20_000_000)throw Error('Offline plugin exceeds 20 MB');
for(const name of ['kordoc','docx-preview','src/legacy-port/','src/ui/ToolbarController'])if(Object.keys(meta.inputs).some(k=>k.includes(name)))throw Error('General conversion dependency included: '+name);
console.log('Independent offline journal bundle:',Buffer.byteLength(code),'bytes');
