import test from 'node:test';
import assert from 'node:assert/strict';
import {patchSourceProperties,sourceParts,sourceProperties,mergeSourceEdits,SourceEditConflict} from '../src/journal/sourceEditing';
test('guided changes preserve other YAML, comments, CRLF and the entire Markdown body',()=>{
  const input='---\r\n# Private annotation\r\ntags: [one, two] # keep\r\naaeu-title: Old # title comment\r\naaeu-abstract: |\r\n  First.\r\n  Second.\r\ncustom: {x: 3}\r\n---\r\n\r\n## Body\r\n![[a.png|200]]\r\n';
  const output=patchSourceProperties(input,{'aaeu-title':'New: title','aaeu-abstract':'한글\n\nSecond.','aaeu-corresponding-name':'Editor'});
  assert.equal(sourceParts(output).body,sourceParts(input).body);
  assert.ok(output.includes('tags: [one, two] # keep'));assert.ok(output.includes('# Private annotation'));assert.ok(output.includes('# title comment'));
  assert.ok(output.includes('custom: {x: 3}'));assert.equal(sourceProperties(output)['aaeu-abstract'],'한글\n\nSecond.');
  assert.equal(sourceProperties(output)['aaeu-title'],'New: title');assert.equal(sourceProperties(output)['aaeu-corresponding-name'],'Editor');
});
test('missing, empty, indexed, boolean, list and deleted properties round trip',()=>{
  let s=patchSourceProperties('## Original\n\nBody',{'aaeu-title':'Paper','aaeu-author-2-corresponding':true,'aaeu-author-2-affiliations':['1','3']});
  s=patchSourceProperties(s,{'aaeu-title':'','aaeu-author-2-corresponding':undefined});
  assert.equal(sourceProperties(s)['aaeu-title'],'');assert.equal(sourceProperties(s)['aaeu-author-2-corresponding'],undefined);
  assert.deepEqual(sourceProperties(s)['aaeu-author-2-affiliations'],['1','3']);assert.equal(sourceParts(s).body,'## Original\n\nBody');
  assert.equal(sourceProperties(patchSourceProperties('---\naaeu-title:\n---\nBody',{'aaeu-title':'New'}))['aaeu-title'],'New');
});
test('invalid or duplicate YAML is rejected without guessing',()=>{
  assert.throws(()=>patchSourceProperties('---\nx: [\n---\nBody',{'aaeu-title':'N'}),/YAML/);
  assert.throws(()=>sourceProperties('---\nx: 1\nx: 2\n---\n'),/YAML/);
});
test('external body changes merge with metadata edits; competing edits retain both versions',()=>{
  const base='---\naaeu-title: Original\n---\n\nBody';
  const local=patchSourceProperties(base,{'aaeu-title':'New'}),remote=base.replace('Body','External body');
  assert.equal(sourceParts(mergeSourceEdits(base,local,remote)).body,'\nExternal body');
  assert.equal(sourceProperties(mergeSourceEdits(base,local,remote))['aaeu-title'],'New');
  assert.throws(()=>mergeSourceEdits(base,local,base.replace('Original','External')),SourceEditConflict);
});
