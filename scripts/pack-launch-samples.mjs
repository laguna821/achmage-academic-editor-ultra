import fs from 'node:fs/promises';import path from 'node:path';import JSZip from 'jszip';import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const {BRANDED_TEMPLATES,exportTemplate}=createRequire(import.meta.url)('../src/journal/templates.ts');
const out=path.resolve('release/0.1.1');await fs.mkdir(out,{recursive:true});
const plugin=new JSZip();for(const file of ['main.js','manifest.json','styles.css']){const bytes=await fs.readFile(file);await fs.writeFile(path.join(out,file),bytes);plugin.file(file,bytes);}
await fs.writeFile(path.join(out,'achmage-academic-editor-ultra-0.1.1.zip'),await plugin.generateAsync({type:'uint8array',compression:'DEFLATE'}));
const samples=new JSZip();
for(const language of ['en','ko']){
  samples.file(`${language}/Start here.md`,await fs.readFile(`examples/welcome/${language}.md`));
  for(const name of await fs.readdir('examples/welcome/assets'))samples.file(`${language}/assets/${name}`,await fs.readFile(`examples/welcome/assets/${name}`));
  for(const brand of ['achmage','command-space'])for(const ext of ['pdf','af.zip']){
    const name=`${brand}-${language}.${ext}`,bytes=await fs.readFile(`test-artifacts/launch-presets/${name}`);samples.file(`outputs/${name}`,bytes);await fs.writeFile(path.join(out,name),bytes);
  }
}
const emptyStore={async get(){return null;},async put(){}};
for(const template of BRANDED_TEMPLATES){const name=template.id.slice(8)+'-template.zip',bytes=await exportTemplate(template,emptyStore);samples.file(`templates/${name}`,bytes);await fs.writeFile(path.join(out,name),bytes);}
for(const name of ['journal-of-achmage.pdf','journal-of-command-space.pdf','README.md'])samples.file(`logos/${name}`,await fs.readFile('assets/brands/'+name));
samples.file('LICENSE',await fs.readFile('LICENSE'));
samples.file('START-HERE.txt',`ACADEMIC EDITOR ULTRA 0.1.1 — WORKING SAMPLES\n\n1. Copy en/ or ko/ into your Obsidian vault, keeping its assets/ folder.\n2. Open Start here.md. Run Academic Editor Ultra: Start a journal from the current Markdown source.\n3. Compose. Change the title in the source, then compose again.\n4. Journal template > Saved templates > Journal of Command & Space > Preview > Save and apply.\n5. Compare outputs/, or open an AF package's document.af in Affinity.\n\nThe installed plugin also has Open sample manuscript. Existing samples are never overwritten.\n\nThese are illustrative product guides, not research papers. Bibliographic candidates require human confirmation. Fonts are not distributed; install the requested fonts or choose substitutes. Affinity may reflow text, so inspect the final linked frame after editing. Changes made in Affinity do not sync back to Markdown.\n\nSource: https://github.com/laguna821/achmage-academic-editor-ultra\n`);
await fs.writeFile(path.join(out,'aaeu-working-samples-0.1.1.zip'),await samples.generateAsync({type:'uint8array',compression:'DEFLATE'}));
const media=new JSZip();
for(const name of await fs.readdir(out))if(/\.(mp4|srt|vtt)$/.test(name)||name==='MEDIA-CREDITS.txt')media.file(name,await fs.readFile(path.join(out,name)));
for(const name of await fs.readdir('docs/media'))if(name.endsWith('.png'))media.file('images/'+name,await fs.readFile('docs/media/'+name));
media.file('README.md',await fs.readFile('docs/launch/README.md'));
await fs.writeFile(path.join(out,'aaeu-launch-media-0.1.1.zip'),await media.generateAsync({type:'uint8array',compression:'DEFLATE'}));
const checksums=[];for(const name of await fs.readdir(out)){const p=path.join(out,name);if((await fs.stat(p)).isFile()&&name!=='SHA256SUMS.txt')checksums.push(crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex')+'  '+name);}
await fs.writeFile(path.join(out,'SHA256SUMS.txt'),checksums.join('\n')+'\n');console.log('Packaged plugin and bilingual samples:',out);
