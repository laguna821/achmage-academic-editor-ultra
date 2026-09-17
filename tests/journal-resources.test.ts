import test from 'node:test';
import assert from 'node:assert/strict';
import {brotliCompressSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {unpackResource,type PackedResource} from '../src/journal/resources';
import {JOURNAL_WORKER_RESOURCE} from '../src/journal/embedded.generated';

test('packed worker is verified local code and retains its static callback boundary',async()=>{
  const code=new TextDecoder().decode(await unpackResource(JOURNAL_WORKER_RESOURCE));
  assert.match(code,/onmessage/);
  assert.doesNotMatch(code,/new Function|\beval\s*\(|node:fs|import\(/);
  await assert.rejects(unpackResource({...JOURNAL_WORKER_RESOURCE,sha256:'0'.repeat(64)}));
});

for(const codec of ['br','gzip'] as const)test(`embedded ${codec} preserves original bytes and rejects damaged resources`,async()=>{
  const original=Buffer.from('HanMark 한글 · deterministic resource\n'.repeat(100));
  const packed:PackedResource={codec,data:(codec==='br'?brotliCompressSync(original):gzipSync(original)).toString('base64'),bytes:original.length,sha256:createHash('sha256').update(original).digest('hex')};
  assert.deepEqual(Buffer.from(await unpackResource(packed)),original);
  await assert.rejects(unpackResource({...packed,sha256:'0'.repeat(64)}));
  await assert.rejects(unpackResource({...packed,bytes:original.length+1}));
  await assert.rejects(unpackResource({...packed,data:packed.data.slice(0,12)}));
});
