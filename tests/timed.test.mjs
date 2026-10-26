import assert from 'node:assert/strict';
import {get} from 'svelte/store';
import {createGame} from '../web/src/game.js';
import * as E from '../web/src/engine.js';
import {build} from 'esbuild';
import {Worker} from 'node:worker_threads';
const game=createGame();game.preset();game.selectSide('b');game.preset();game.start();
const position=get(game).position,hist=get(game).posHist;
const signature=m=>JSON.stringify([m.from,m.to,m.promo||null,m.drop||null,m.castle??null]);
const legal=new Set(get(game).legal.map(signature));
// Eirin, developer and legacy sage share config and deterministic search results.
assert.deepEqual(Object.keys(E.LEVELS),['easy','normal','hard','lunatic']);
for(const name of ['eirin','dev','sage'])assert.equal(E.resolveLevel(name),'lunatic');
const originalRandom=Math.random,merged=[];
try{
 for(const name of ['lunatic','dev','sage']){
  let seed=123;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  merged.push(E.timedMove(position,name,{hist,timeMs:10000,onDepth:r=>{
   assert.equal(E.OPT.open,0);
   if(r.depth===2)E.setSearchState({end:performance.now()-1});
  }}));
 }
}finally{Math.random=originalRandom;}
for(const r of merged){assert.equal(r.depth,2);assert.equal(r.score,merged[0].score);assert.equal(signature(r.move),signature(merged[0].move));}
assert.equal(E.LEVELS.easy.d,3);assert.equal(E.LEVELS.normal.d,4);assert.equal(E.LEVELS.hard.d,5);
// A timeout during the next layer must retain exactly the last completed result.
let completed;
const result=E.timedMove(position,'lunatic',{hist,timeMs:10000,onDepth:r=>{
 completed=r;E.setSearchState({end:performance.now()-1});
}});
assert.equal(result.depth,1);assert.equal(signature(result.move),signature(completed.move));
assert.equal(result.score,completed.score);assert.equal(E.srchEnd,0);
const immediate=E.timedMove(position,'lunatic',{hist,timeMs:0});
assert.equal(immediate.depth,0);assert(legal.has(signature(immediate.move)));
// Deadline enforcement includes quiescence, not just regular negamax nodes.
E.setSearchState({end:performance.now()-1,nodes:255});
assert.throws(()=>E.qsearch(position,-Infinity,Infinity,0),e=>e===E.EVABORT);E.clearSearchDeadline();
const saved=E.OPT.open;E.timedMove(position,'lunatic',{hist,timeMs:10});assert.equal(E.OPT.open,saved);
for(const level of ['easy','normal','hard','lunatic']){
 const r=E.timedMove(position,level,{hist,timeMs:100});
 assert(legal.has(signature(r.move)));assert(r.ms<1500,`${level} exceeded time tolerance`);
}
// The actual browser bot worker must finish and return a legal move from engine/.
const compiled=await build({entryPoints:['web/src/bot.worker.js'],bundle:true,write:false,format:'cjs',platform:'node'});
const worker=new Worker(`const {parentPort}=require('node:worker_threads');
 global.self={postMessage:m=>parentPort.postMessage(m)};
 ${compiled.outputFiles[0].text}
 parentPort.on('message',data=>self.onmessage({data}));`,{eval:true});
const depths=[];
const answer=await new Promise((resolve,reject)=>{
 const timeout=setTimeout(()=>reject(Error('Bot worker timed out')),10000);
 worker.on('error',e=>{clearTimeout(timeout);reject(e);});
 worker.on('message',m=>{if(m.progress)depths.push(m.depth);else{clearTimeout(timeout);resolve(m);}});
 worker.postMessage({state:position,hist,level:'lunatic'});
}).finally(()=>worker.terminate());
assert(!answer.error,answer.error);assert(legal.has(signature(answer.move)));
assert.equal(answer.depth,depths.at(-1));assert(answer.depth>0);assert(answer.ms<5000);
// Session must discard results even if a cancelled transport delivers them late.
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const jobs=[];
const session=createGame({loadBot:async()=>({startBot:(s,h,l,done,fail)=>{
 const job={s,done,fail,cancelled:false};jobs.push(job);return ()=>{job.cancelled=true;};
}})});
session.preset();session.selectSide('b');session.preset();session.start();session.setBotSide('w');
await sleep(100);assert.equal(jobs.length,1);assert(get(session).thinking);
session.setBotLevel('lunatic');assert(jobs[0].cancelled);
jobs[0].done({move:E.legalMoves(jobs[0].s)[0]});assert.equal(get(session).log.length,0);
await sleep(100);assert.equal(jobs.length,2);
session.undo();assert(jobs[1].cancelled);jobs[1].done({move:E.legalMoves(jobs[1].s)[0]});assert.equal(get(session).log.length,0);
session.setBotSide('w');await sleep(100);session.redeploy();jobs[2].done({move:E.legalMoves(jobs[2].s)[0]});assert.equal(get(session).phase,'deploy');assert.equal(get(session).log.length,0);
session.start();await sleep(100);session.dispose();assert(jobs[3].cancelled);jobs[3].done({move:E.legalMoves(jobs[3].s)[0]});assert.equal(get(session).log.length,0);
game.dispose();
console.log(`Timed search: deadlines, completed-depth fallback, legal moves, cancellation and real Worker passed (Eirin depth ${answer.depth}, ${Math.round(answer.ms)}ms).`);
