import type {DataAdapter} from 'obsidian';
import {JournalStore,digestBytes,jsonBytes} from './storage';
import {cloneJournal,newId,type JournalProject} from './types';
import {JournalTemplateLibrary} from './templates';

/** Copy, never modify, the source. A recorded source identity makes repeated migration idempotent. */
export async function copyLegacyProject(adapter:DataAdapter,root:string,destination:string):Promise<{project:JournalProject;store:JournalStore;existing:boolean}>{
  const source=new JournalStore(adapter,root),p=await source.load(),sha256=await digestBytes(jsonBytes(p));
  if(await adapter.exists(destination))for(const path of (await adapter.list(destination)).folders){try{const store=new JournalStore(adapter,path),existing=await store.load();if(existing.migratedFrom?.root===root&&existing.migratedFrom.sha256===sha256)return {project:existing,store,existing:true};}catch{/* Other folders are untouched. */}}
  const next=cloneJournal(p);next.id=newId('journal');next.revision=0;next.migratedFrom={root,projectId:p.id,sha256};
  // Legacy projects keep their existing editor. Switching source mode is an explicit separate copy.
  delete next.markdown;
  const store=new JournalStore(adapter,destination+'/'+next.id);
  for(const item of [...p.sources,...p.assets,...p.fonts]){const bytes=await source.get(item.path);if(!bytes||await digestBytes(bytes)!==item.sha256)throw new Error('기존 프로젝트 파일 검증 실패: '+item.path);await store.put(item.path,bytes);}
  await store.save(next);return {project:next,store,existing:false};
}
export async function copyLegacyTemplates(adapter:DataAdapter,configDir:string):Promise<number>{
  const from=new JournalTemplateLibrary(new JournalStore(adapter,configDir+'/plugins/hanmark/journal-templates'));
  const to=new JournalTemplateLibrary(new JournalStore(adapter,configDir+'/plugins/achmage-academic-editor-ultra/journal-templates'));
  const existing=await to.list();let count=0;
  for(const t of (await from.list()).filter(t=>!t.id.startsWith('builtin:'))){if(existing.some(e=>e.id===t.id))continue;await to.save(t,from.store);count++;}return count;
}
