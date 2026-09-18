import {Buffer} from 'node:buffer';
import {nativeFields as F} from './native.mjs';
const {field,text,int,bool,ref,refs}=F;

/** Real native master instances, with shared property/geometry links.
 * Body frames are untouched; no story is duplicated into a master. */
export function nativeMasters({object,node,pageMeta,pageItems,report,hash,facing=false}){
  const pages=[],instances=new Map(),sets=new Map();report.masters=[];
  for(const [i,items]of pageItems.entries())for(const item of items.filter(i=>i.master)){
    const m=item.master,id=facing?'hanmark:facing':m.id,key=facing?`${i%2}:${m.id}:${m.item}`:m.item;
    if(!sets.has(id))sets.set(id,{name:facing?'Academic Editor Ultra · Facing pages':m.name,items:new Map(),pages:new Set()});
    const set=sets.get(id);set.pages.add(i+1);
    if(!set.items.has(key))set.items.set(key,[]);
    set.items.get(key).push({obj:item.obj,page:i+1});
  }
  const link=(nodes,name,kind)=>{const group=object([kind],[refs('ILOb',nodes)]);for(const n of nodes)n.fields.push(ref(name,group));};
  const inherit=(prototype,clones)=>{
    link([prototype,...clones],'SLnk','ILSN');link([prototype,...clones],'GLnk','ILGI');link([prototype,...clones],'TLnk','ILTI');
    if(prototype.types[0]==='TxtF')link([prototype,...clones],'CLnk','ILCP');
    for(const clone of clones){
      const textFrame=clone.types[0]==='TxtF';
      clone.fields=clone.fields.filter(f=>!['StSt','TxtH','Opac','FOpc','Visi','IgTW'].includes(f.name));
      for(const name of ['BlMM','DsMa','VisM','FiEM','EdMa','HKMs','TMas','TWMa','BGMs','VBFM','VLSM','VTrM',...(textFrame?['StMa','TxFM']:[])])clone.fields.push(ref(name,prototype));
    }
  };
  for(const [id,set]of sets){
    const prototypes=[],byPage=new Map([...set.pages].map(p=>[p,[]]));
    for(const [key,entries]of set.items){
      const first=entries[0].obj,prototype=object(first.types,[...first.fields.filter(f=>f.name!=='Flow'&&f.name!=='Desc'),text('Desc',key)]);
      if(first.types[0]==='TxtF')prototype.fields.push(ref('Flow',object(['TxFl'],[refs('Nods',[prototype]),bool('HOvr',true)])));
      inherit(prototype,entries.map(e=>e.obj));prototypes.push(prototype);
      for(const e of entries)byPage.get(e.page).push(e.obj);
    }
    const scope=object(['Scop','Node'],[...node(set.name),refs('Chld',prototypes)]);
    const guid=hash(Buffer.from('HanMark master '+id)).slice(0,32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5').toUpperCase();
    const master=object(['Sprd','Node'],[...node(set.name),text('GooI',guid),refs('Chld',[scope]),ref('SpMd',pageMeta()),int('fspo',0),int('npct',facing?2:1),bool('SprT',false)]);
    const clones=[],scopes=[];
    const bySpread=new Map();
    for(const [page,children]of byPage){const index=facing?Math.floor((page-1)/2)+1:page;if(!bySpread.has(index))bySpread.set(index,[]);bySpread.get(index).push({page,children});}
    for(const [index,entries]of bySpread){
      const children=entries.flatMap(e=>e.children),offset=facing?(entries[0].page-1)%2:0;
      const sc=object(['Scop','Node'],[...node(set.name),refs('Chld',children)]);scopes.push(sc);
      const instance=object(['MPIN','Node'],[...node(set.name),text('GooI',guid),refs('Chld',[sc]),field('PgOf',3,offset),field('MPOf',3,offset),field('PgCt',3,entries.length),field('Anch',42,5),field('ScMd',42,3),bool('ScAt',true),field('AuDe',42,2)]);
      if(!instances.has(index))instances.set(index,[]);instances.get(index).push(instance);clones.push(instance);
    }
    inherit(scope,scopes);link([master,...clones],'SLnk','ILSN');link([master,...clones],'GLnk','ILGI');
    pages.push(master);report.masters.push({id,name:set.name,nativeId:master.id,pages:[...set.pages],items:prototypes.map(o=>o.id)});
  }
  for(const items of pageItems)for(let i=items.length-1;i>=0;i--)if(items[i].master)items.splice(i,1);
  return {pages,instances};
}
