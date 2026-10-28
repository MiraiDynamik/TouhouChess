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
assert.equal(E.PRUNE.inner,1,'LMR is enabled by default');
// Flat probabilities: enumerate 100 equally spaced draws, not a statistical test.
const selectionRandom=Math.random;
try {
 const expected={easy:[10,60,20,10],normal:[2,8,40,50],hard:[0,1,20,79],lunatic:[0,0,0,100]};
 for(const [level,counts] of Object.entries(expected)){
  const actual={random:0,lossBand:0,suboptimal:0,best:0};
  for(let i=0;i<100;i++){Math.random=()=>(i+.5)/100;actual[E.drawMoveStrategy(E.LEVELS[level].selection)]++;}
  assert.deepEqual(Object.values(actual),counts);
 }
 const ranked=[{v:500,m:'best'},{v:450,m:'second'},{v:400,m:'loss1'},{v:200,m:'loss3'},{v:199,m:'outside'}];
 Math.random=()=>0;
 assert.equal(E.chooseRankedMove(ranked,'lossBand').m,'loss1');
 Math.random=()=>.999;
 assert.equal(E.chooseRankedMove(ranked,'lossBand').m,'loss3');
 assert.equal(E.chooseRankedMove(ranked,'suboptimal').m,'loss1');
 assert.equal(E.chooseRankedMove(ranked,'best').m,'best');
 assert.equal(E.chooseRankedMove([{v:50,m:'a'},{v:0,m:'b'}],'lossBand').m,'b');
 assert.equal(E.chooseRankedMove([{v:50,m:'a'},{v:-950,m:'b'}],'lossBand').m,'a');
 assert.equal(E.chooseRankedMove([{v:50,m:'only'}],'lossBand').m,'only');
 assert.equal(E.chooseRankedMove([],'lossBand'),null);
 assert.throws(()=>E.drawMoveStrategy({random:1,lossBand:1,suboptimal:0,best:0}));
} finally {Math.random=selectionRandom;}
// Cirno prefers checks only inside the strategy's existing candidate pool.
assert.equal(E.LEVELS.easy.preferCheck,true);
for(const level of ['normal','hard','lunatic'])assert(!E.LEVELS[level].preferCheck);
const checkPosition=E.buildState(new Map([[60,'k'],[56,'r'],[63,'r']]),new Map([[4,'k']]));
const checkPositionBefore=JSON.stringify(checkPosition);
const checkMoves=E.legalMoves(checkPosition);
const givesCheck=m=>{const ns=E.kid(m);return E.inCheck(ns,ns.turn);};
const checking=checkMoves.filter(givesCheck),quiet=checkMoves.filter(m=>!givesCheck(m));
assert(checking.length>=2&&quiet.length>=2);
try{
 Math.random=()=>0;
 const ranked=[{m:quiet[0],v:500},{m:quiet[1],v:350},{m:checking[0],v:300},{m:checking[1],v:100}];
 assert.equal(E.chooseRankedMove(ranked,'lossBand',true).m,checking[0]);
 assert.equal(E.chooseRankedMove(ranked,'suboptimal',true).m,checking[0]);
 assert.equal(E.chooseRankedMove(ranked,'best',true).m,quiet[0],'must not leave the best-score pool');
 assert.equal(E.chooseRankedMove(ranked,'lossBand',false).m,quiet[1],'other levels keep existing selection');
 const noCheckBand=[ranked[0],ranked[1],ranked[3]];
 assert.equal(E.chooseRankedMove(noCheckBand,'lossBand',true).m,quiet[1],'outside checks must not enter the pool');
 const tied=[{m:quiet[0],v:500},{m:checking[0],v:500}];
 assert.equal(E.chooseRankedMove(tied,'best',true).m,checking[0]);
 assert.equal(E.chooseFromMovePool(quiet.map(m=>({m})),true).m,quiet[0]);
 const pool=[{m:quiet[0]},{m:checking[0]},{m:checking[1]}];
 assert.equal(E.chooseFromMovePool(pool,true).m,checking[0]);
 Math.random=()=>.999;
 assert.equal(E.chooseFromMovePool(pool,true).m,checking[1]);
 // Real timed and offline entrances both apply the preference on the random branch.
 Math.random=()=>.05;
 assert(givesCheck(E.timedMove(checkPosition,'easy',{timeMs:500}).move));
 assert(givesCheck(E.pickMove(checkPosition,1,E.LEVELS.easy.selection,E.LEVELS.easy.preferCheck)));
 // Ranked best branch must also use the preference, and respect completed-layer timeout.
 Math.random=()=>.95;
 const rankedResult=E.timedMove(checkPosition,'easy',{timeMs:10000,onDepth:()=>E.setSearchState({end:performance.now()-1})});
 assert.equal(rankedResult.depth,1);
 assert(checkMoves.some(m=>signature(m)===signature(rankedResult.move)));
 assert.equal(JSON.stringify(checkPosition),checkPositionBefore);
}finally{Math.random=selectionRandom;E.clearSearchDeadline();}
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
// Count includes kings: Hard becomes time-only at 18 pieces, all ranked strategies included.
for(const count of [32,19,18,7,2]){
 const s={b:Array.from({length:64},(_,i)=>i<count?{t:'king'}:null)};
 assert.equal(E.timedDepthFor(E.LEVELS.hard,s),count<=18?Infinity:5);
 assert.equal(E.timedDepthFor(E.LEVELS.easy,s),3);
 assert.equal(E.timedDepthFor(E.LEVELS.normal,s),4);
 assert.equal(E.timedDepthFor(E.LEVELS.lunatic,s),Infinity);
 assert(Number.isFinite(E.depthFor(E.LEVELS.hard,s)),'offline search must remain bounded');
}
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
});
assert(!answer.error,answer.error);assert(legal.has(signature(answer.move)));
assert.equal(answer.tt.capacity,1048576,'real browser Worker uses the 1M default');
assert.equal(answer.depth,depths.at(-1));assert(answer.depth>0);assert(answer.ms<5000);
// A second request on the same real Worker must retain the table.
worker.removeAllListeners('message');
const again=await new Promise((resolve,reject)=>{
 const timeout=setTimeout(()=>reject(Error('Retained bot worker timed out')),10000);
 worker.once('error',e=>{clearTimeout(timeout);reject(e);});
 worker.on('message',m=>{if(!m.progress){clearTimeout(timeout);resolve(m);}});
 worker.postMessage({state:position,hist,level:'lunatic'});
}).finally(()=>worker.terminate());
assert(!again.error,again.error);assert(legal.has(signature(again.move)));
assert.equal(again.tt.capacity,1048576,'retained Worker preserves the 1M table');
assert(again.tt.generation>answer.tt.generation);assert(again.tt.hits>answer.tt.hits);
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
