// Fault injection for the Windows retry path; no engine or filesystem mutation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../cli/value-match.mjs',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('function saveText('),source.indexOf('function initial('));
let writes=0,renames=0,delays=[];
const context=vm.createContext({process:{pid:123},wait:{},JSON,
 Atomics:{wait:(_a,_b,_c,ms)=>delays.push(ms)},fs:{
  writeFileSync(path,content){writes++;assert.equal(path,'game.pgn.123.tmp');assert.equal(content,'PGN');},
  renameSync(from,to){assert.equal(from,'game.pgn.123.tmp');assert.equal(to,'game.pgn');
   if(++renames<3)throw Object.assign(Error('Windows sharing violation'),{code:'EPERM'});}
 }});
vm.runInContext(helper+"saveText('game.pgn','PGN')",context);
assert.equal(writes,1);assert.equal(renames,3);assert.deepEqual(delays,[50,100]);
context.fs.renameSync=()=>{throw Object.assign(Error('disk error'),{code:'EIO'});};
assert.throws(()=>vm.runInContext("saveText('game.pgn','PGN')",context),/disk error/);
console.log('Value writes: PID temporary file, separate replace retry and fatal-error propagation passed.');
