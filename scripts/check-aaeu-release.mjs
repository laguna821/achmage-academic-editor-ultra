import fs from 'node:fs/promises';
const p=JSON.parse(await fs.readFile('package.json','utf8')),m=JSON.parse(await fs.readFile('manifest.json','utf8')),l=JSON.parse(await fs.readFile('package-lock.json','utf8')),v=JSON.parse(await fs.readFile('versions.json','utf8'));
if(p.name!==m.id||p.version!==m.version||l.version!==m.version||v[m.version]!==m.minAppVersion)throw Error('Version/identity mismatch');
if(m.id!=='achmage-academic-editor-ultra')throw Error('Plugin identity is not isolated');
console.log('Package identity and release metadata are consistent.');
