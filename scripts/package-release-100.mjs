import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import {createHash} from 'node:crypto';
const version=JSON.parse(await fs.readFile('manifest.json','utf8')).version;
const out=path.resolve('release',version),media=path.resolve('test-artifacts/release-100-media');
await fs.mkdir(out,{recursive:true});
const plugin=new JSZip();
for(const name of ['main.js','manifest.json','styles.css']){const bytes=await fs.readFile(name);plugin.file(name,bytes);await fs.writeFile(path.join(out,name),bytes);}
const pluginName=`achmage-academic-editor-ultra-${version}.zip`;
await fs.writeFile(path.join(out,pluginName),await plugin.generateAsync({type:'uint8array',compression:'DEFLATE'}));
const samples=new JSZip();
for(const lang of ['en','ko']){
  samples.file(`${lang}/Start here.md`,await fs.readFile(`examples/welcome/${lang}.md`));
  for(const name of await fs.readdir('examples/welcome/assets'))samples.file(`${lang}/assets/${name}`,await fs.readFile(`examples/welcome/assets/${name}`));
  for(const brand of ['achmage','command-space']){const name=`${brand}-${lang}.pdf`,bytes=await fs.readFile(path.join(media,name));samples.file(`outputs/${name}`,bytes);await fs.writeFile(path.join(out,name),bytes);}
}
const af=await fs.readFile(path.join(media,'public-sample.af.zip'));samples.file('outputs/command-space-en.af.zip',af);await fs.writeFile(path.join(out,'command-space-en.af.zip'),af);
for(const name of await fs.readdir(path.join(out,'templates'))){const bytes=await fs.readFile(path.join(out,'templates',name));samples.file(`templates/${name}`,bytes);await fs.writeFile(path.join(out,name),bytes);}
samples.file('LICENSE',await fs.readFile('LICENSE'));
samples.file('START-HERE.txt',`Academic Editor Ultra ${version}\n\nCopy en/ or ko/ into your vault. Start a journal from Start here.md. Use the guided manuscript panel, then Refresh preview. Select a template directly in the toolbar, or import one of the included template ZIPs.\n\noutputs/ contains current PDFs and an English Affinity package. Open document.af inside that package; check final text flow. Affinity edits do not sync back to Markdown. Fonts are not bundled. Sample journal identities and declarations are illustrative.\n`);
await fs.writeFile(path.join(out,`aaeu-working-samples-${version}.zip`),await samples.generateAsync({type:'uint8array',compression:'DEFLATE'}));
await fs.copyFile('docs/launch/release-1.0.0.md',path.join(out,'RELEASE-NOTES.md'));
const sums=[];for(const name of await fs.readdir(out)){const p=path.join(out,name);if((await fs.stat(p)).isFile()&&name!=='SHA256SUMS.txt')sums.push(createHash('sha256').update(await fs.readFile(p)).digest('hex')+'  '+name);}
await fs.writeFile(path.join(out,'SHA256SUMS.txt'),sums.join('\n')+'\n');
console.log(JSON.stringify({version,main:(await fs.stat('main.js')).size,zip:(await fs.stat(path.join(out,pluginName))).size,out}));
