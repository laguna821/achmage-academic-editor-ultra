import {PUBLIC_TEMPLATES,templateBytes} from './templates';
import type {BinaryStore,JournalProject} from './types';

/** Only public preset assets are bundled. Private logos are supplied by their template ZIP. */
export async function prepareBrandAssets(p:JournalProject,store:BinaryStore):Promise<void>{
  for(const template of PUBLIC_TEMPLATES)for(const asset of template.assets){
    if(!p.assets.some(a=>a.id===asset.id)||await store.get(asset.path))continue;
    const bytes=await templateBytes(store,asset.path);if(bytes)await store.put(asset.path,bytes);
  }
}
