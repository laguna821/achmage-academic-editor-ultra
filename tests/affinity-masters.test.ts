import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
// The standalone inspector is ESM and has an async CLI entry point.
test('native master structure regression',()=>{
  execFileSync(process.execPath,['--import','tsx','--test','scripts/test-affinity-masters.mjs'],{stdio:'pipe'});
});
