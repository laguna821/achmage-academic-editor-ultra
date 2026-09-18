import fs from 'node:fs/promises';
import path from 'node:path';
import {PUBLIC_TEMPLATES,exportTemplate} from '../src/journal/templates';
async function main(){
const manifest=JSON.parse(await fs.readFile('manifest.json','utf8'));
const root=path.resolve('release',manifest.version,'templates');await fs.mkdir(root,{recursive:true});
for(const template of PUBLIC_TEMPLATES){
  const bytes=await exportTemplate(template,{get:async()=>null,put:async()=>{throw Error('Packaging must not mutate assets');}});
  const name=template.id==='builtin:aaeu-demo'?'academic-editor-ultra':template.id==='builtin:achmage'?'journal-of-achmage':'journal-of-command-space';
  await fs.writeFile(path.join(root,name+'.journal-template.zip'),bytes);
  console.log(name,bytes.length);
}

}
void main().catch(error=>{console.error(error);process.exitCode=1;});
