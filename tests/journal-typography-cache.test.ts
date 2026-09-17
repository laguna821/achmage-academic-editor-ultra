import test from 'node:test';
import assert from 'node:assert/strict';
import {TypographyMemo,typographyKey} from '../src/journal/typography';
import {createJournalProject} from '../src/journal/project';
import {preamble} from '../src/journal/typst';
import type {Paragraph} from '../src/journal/types';

const result=()=>({values:new Map([['p',{trackingEm:.005,scaleX:1,leadingPt:0}]]),adjustments:[]});
test('typography reuse is bounded, mutation isolated, and failures are not stored',async()=>{
  const memo=new TypographyMemo();let calls=0;const compute=async()=>{calls++;return result();};
  const first=await memo.get('a',compute,()=>{});first.values.get('p')!.scaleX=2;
  const again=await memo.get('a',compute,()=>{});assert.equal(calls,1);assert.equal(again.values.get('p')!.scaleX,1);
  await assert.rejects(memo.get('b',async()=>{throw Error('failed');},()=>{}));
  await memo.get('a',compute,()=>{});assert.equal(calls,2);
  let cancelled=false;
  await assert.rejects(memo.get('c',async()=>{cancelled=true;return result();},()=>{if(cancelled)throw Error('cancelled');}));
  await memo.get('c',compute,()=>{});assert.equal(calls,3);
});
test('a late result cannot replace the newer typography cache entry',async()=>{
  const memo=new TypographyMemo();let finish!:(r:ReturnType<typeof result>)=>void;
  const old=memo.get('old',()=>new Promise(resolve=>{finish=resolve;}),()=>{});
  await memo.get('new',async()=>result(),()=>{});finish(result());await old;
  await memo.get('new',async()=>{throw Error('new result was lost');},()=>{});
  assert.equal(memo.stats.hits,1);
});
test('typography key follows effective inputs including tracked changes and actual asset bytes',async()=>{
  const project=createJournalProject();const node:Paragraph={id:'p',kind:'paragraph',content:[{text:'A paragraph with a stable identifier.'}]};
  project.document.blocks=[node];const files=[{path:'/image.png',bytes:new Uint8Array([1])}];
  const key=()=>typographyKey(preamble(project),180,'real-font-bytes',files,project,[node]);
  const initial=await key();
  project.document.received='2026-09-16';assert.equal(await key(),initial,'date-only metadata can reuse body typography');
  node.content[0].text+=' More text.';assert.notEqual(await key(),initial);node.content[0].text='A paragraph with a stable identifier.';
  node.content[0].italic=true;assert.notEqual(await key(),initial);delete node.content[0].italic;
  project.preset.compositionQuality!.trackingLimitEm=.005;assert.notEqual(await key(),initial);project.preset.compositionQuality!.trackingLimitEm=.01;
  files[0].bytes[0]=2;assert.notEqual(await key(),initial);files[0].bytes[0]=1;
  assert.notEqual(await typographyKey(preamble(project),180,'different-font-bytes',files,project,[node]),initial);
  assert.notEqual(await typographyKey(preamble(project),181,'real-font-bytes',files,project,[node]),initial);
  assert.equal(await key(),initial,'undo restores the exact original key');
  node.content.push({text:'Tracked insertion.',changeIds:['change']});
  project.changes.push({id:'change',kind:'insert',author:'Fixture',date:'2026-09-16',decision:'accepted',sourceId:'fixture'});
  const accepted=await key();project.changes[0].decision='rejected';assert.notEqual(await key(),accepted,'same runs with a different review decision must invalidate');
});
