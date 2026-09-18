import { SAMPLE_FILES } from './sample.generated';

export type SampleLanguage='en'|'ko';
export interface SampleFiles {
  exists(path:string):Promise<boolean>;
  mkdir(path:string):Promise<void>;
  read(path:string):Promise<string>;
  write(path:string,text:string):Promise<void>;
}
/** Serialize creation per vault; writing the source last makes interrupted copies retryable. */
const queues=new WeakMap<SampleFiles,Promise<unknown>>();
export function openSampleFiles(files:SampleFiles,language:SampleLanguage,newCopy=false):Promise<{path:string;existing:boolean}>{
  const task=(queues.get(files)??Promise.resolve()).then(async()=>{
    const parent='Academic Editor Ultra Samples',name=language==='ko'?'한국어':'English';
    let root=parent+'/'+name;
    if(newCopy)for(let n=2;await files.exists(root);n++)root=parent+'/'+name+' '+n;
    const path=root+'/Start here.md';
    if(await files.exists(path))return {path,existing:true};
    for(const directory of [parent,root,root+'/assets'])if(!await files.exists(directory))await files.mkdir(directory);
    for(const [name,text]of Object.entries(SAMPLE_FILES.assets)){
      const target=root+'/assets/'+name;
      if(!await files.exists(target))await files.write(target,text);
    }
    await files.write(path,SAMPLE_FILES[language]);
    return {path,existing:false};
  });
  queues.set(files,task.catch(()=>undefined));return task;
}
