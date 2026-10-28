import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../web/src/engine.js';
import {ttPositionKey,moveKey,scoreToTT,scoreFromTT,newTranspositionSearch,
  probeTransposition,storeTransposition} from '../engine/transposition.ts';
import {build} from 'esbuild';
const gold=JSON.parse(fs.readFileSync(new URL('./golden.json',import.meta.url)));
const sq=s=>(8-Number(s[1]))*8+'abcdefgh'.indexOf(s[0]);
const map=(o,black=false)=>new Map(Object.entries(o).map(([k,v])=>[black?E.mirrorSq(sq(k)):sq(k),v]));
function fixture(c){
 let s=E.buildState(map(c.def.w),map(c.def.b,true));
 for(const [a,b]of c.def.moves){
  const ms=E.legalMoves(s),m=ms.find(m=>m.from===sq(a)&&m.to===sq(b)&&!m.drop&&!m.promo)??ms.find(m=>m.from===sq(a)&&m.to===sq(b));
  assert(m,c.name);s=E.vanishPass(E.applyMove(s,m));
 }return s;
}
const search=(s,d,{hist=[],enabled=true,ply=0,alpha=-Infinity,beta=Infinity}={})=>{
 E.setSearchState({rep:new Set(hist)});E.clearOrderTables();
 return E.withSearchCache(()=>E.negamax(s,d,alpha,beta,ply),{hist,enabled});
};
E.PRUNE.inner=0;
let tested=0;
for(const c of gold.cases){
 if(c.error)continue;
 const s=fixture(c),hist=[E.posKey(s)];E.clearTranspositionTable();
 const expected=search(s,3,{hist,enabled:false});
 const cold=search(s,3,{hist}),warm=search(s,3,{hist});
 assert.equal(cold,expected,c.name+' cold');assert.equal(warm,expected,c.name+' warm');
 tested++;
}
const s=fixture(gold.cases.find(c=>c.name==='爱丽丝可打入'));
const original=ttPositionKey(s);
for(const change of [s=>s.ammo.w+=.5,s=>s.ammo.b+=.5,s=>s.turn='b',s=>s.cas.w0=!s.cas.w0,
 s=>s.ep=20,s=>s.half++,s=>s.b.find(Boolean).mark=1,s=>s.b.find(Boolean).t='reimu']){
 const altered=structuredClone(s);change(altered);assert.notEqual(ttPositionKey(altered),original);
}
assert.notEqual(moveKey({from:1,to:2,promo:'q'}),moveKey({from:1,to:2,promo:'n'}));
assert.notEqual(moveKey({from:1,to:2}),moveKey({from:1,to:2,drop:'doll',cost:.5}));
for(const value of [E.MATE-9,-E.MATE+9,123,-50]){
 assert.equal(scoreFromTT(scoreToTT(value,4),4),value);
}
assert.equal(scoreFromTT(scoreToTT(E.MATE-9,4),2),E.MATE-7);
assert.equal(scoreFromTT(scoreToTT(-E.MATE+9,4),2),-E.MATE+7);
// Exact/lower/upper entries and depth mismatch.
E.clearTranspositionTable();newTranspositionSearch('test');
for(const bound of ['exact','lower','upper']){
 storeTransposition(bound,3,42,bound,{from:1,to:2},0);
 assert.equal(probeTransposition(bound).bound,bound);
}
const sparse=E.buildState(map({e1:'k',a1:'r'}),map({e8:'k'}));
// Deeper reuse remains independent of removed search experiments and defaults off.
assert.equal(E.PRUNE.ttDeep,0);
E.PRUNE.ttDeep=1;E.clearTranspositionTable();
const deepValue=search(sparse,3),deepCutoffs=E.transpositionStats().cutoffs;
assert.equal(search(sparse,2),deepValue);
assert.equal(E.transpositionStats().cutoffs,deepCutoffs+1);
E.PRUNE.ttDeep=0;
assert.equal(search(sparse,2),search(sparse,2,{enabled:false}));
E.clearTranspositionTable();const exact=search(sparse,3);
assert.equal(search(sparse,3,{alpha:exact-1,beta:exact}),exact);
E.clearTranspositionTable();search(sparse,3,{alpha:exact-1,beta:exact});
assert.equal(search(sparse,3),exact,'lower bound cannot masquerade as exact');
E.clearTranspositionTable();search(sparse,3,{alpha:exact,beta:exact+1});
assert.equal(search(sparse,3),exact,'upper bound cannot masquerade as exact');
assert.equal(search(sparse,2),search(sparse,2,{enabled:false}),'depth horizon');
// Successive real moves retain deep entries without confusing actual history.
let next=sparse,history=[E.posKey(sparse)];E.clearTranspositionTable();
for(let i=0;i<8;i++){
 const expected=search(next,3,{hist:history,enabled:false});
 assert.equal(search(next,3,{hist:history}),expected,'played sequence '+i);
 const legal=E.legalMoves(next);if(!legal.length)break;
 next=E.vanishPass(E.applyMove(next,legal[(i*7)%legal.length]));history.push(E.posKey(next));
}
// This engine checks played-history repetitions only at root-relative ply 1/2.
E.clearTranspositionTable();search(sparse,3,{ply:1});
assert.equal(search(sparse,3,{ply:1,hist:[E.posKey(sparse)]}),0);
assert.equal(search(sparse,3,{ply:3,hist:[E.posKey(sparse)]}),search(sparse,3,{ply:3,enabled:false}));
// Descendant entries independent of root history survive across root searches.
E.clearTranspositionTable();search(sparse,3,{ply:5});const before=E.transpositionStats();
assert.equal(search(sparse,3,{ply:3,hist:['different-game-history']}),search(sparse,3,{ply:3,enabled:false}));
assert(E.transpositionStats().cutoffs>before.cutoffs,'reuse across root-relative ply and history');
// A switched evaluator or mutated weights must invalidate old scores.
E.clearTranspositionTable();search(s,2);const oldOpen=E.OPT.open;E.OPT.open=1-oldOpen;
assert.equal(search(s,2),search(s,2,{enabled:false}));E.OPT.open=oldOpen;
const weights=structuredClone(E.WEIGHTS);E.WEIGHTS.mobility+=7;
assert.equal(search(s,2),search(s,2,{enabled:false}));E.loadWeights(weights);
E.PRUNE.inner=1;assert(Number.isFinite(search(sparse,3)));E.PRUNE.inner=0;
assert.equal(search(sparse,3),search(sparse,3,{enabled:false}));
// Capacity/collision safety, even when every key maps to the same slot.
const slots=E.TT.slots;E.TT.slots=1;E.clearTranspositionTable();newTranspositionSearch('collision');
storeTransposition('a',2,1,'exact',null,0);storeTransposition('b',2,9,'exact',null,0);
assert.equal(probeTransposition('a'),null);assert.equal(probeTransposition('b').value,9);
assert.equal(E.transpositionStats().entries,1);E.TT.slots=slots;E.clearTranspositionTable();
// Deadline abort must unwind the scope and not store an incomplete root result.
E.setSearchState({end:performance.now()-1,nodes:255});
assert.throws(()=>E.withSearchCache(()=>E.negamax(sparse,6,-Infinity,Infinity,0)),e=>e===E.EVABORT);
assert.equal(E.transpositionStats().stores,0);E.clearSearchDeadline();
// Browser transport retains a completed worker; cancels only in-flight work.
const fake=[];
globalThis.TTFakeWorker=class{constructor(){fake.push(this);}postMessage(data){this.data=data;}terminate(){this.dead=true;}};
const bundle=await build({entryPoints:['web/src/bot.js'],bundle:true,write:false,format:'esm',plugins:[{
 name:'fake-worker',setup(b){b.onResolve({filter:/bot\.worker\.js/},()=>({path:'fake',namespace:'fake'}));
 b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:'export default globalThis.TTFakeWorker;'}));}
}]});
const {createBotRunner}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const runner=createBotRunner();let delivered=0;
const cancel=runner.startBot(sparse,[],'lunatic',()=>delivered++,assert.fail);
fake[0].onmessage({data:{move:{from:1,to:2}}});cancel();assert(!fake[0].dead);
const cancel2=runner.startBot(sparse,[],'lunatic',()=>delivered++,assert.fail);
assert.equal(fake.length,1);const late=fake[0].onmessage;cancel2();assert(fake[0].dead);
late({data:{move:{from:1,to:2}}});assert.equal(delivered,1);
runner.startBot(sparse,[],'lunatic',()=>{},assert.fail);assert.equal(fake.length,2);
runner.dispose();assert(fake[1].dead);delete globalThis.TTFakeWorker;
console.log(`TT: ${tested} golden positions cached/uncached, variants, bounds, history, mate distance, invalidation, capacity, abort and Worker lifecycle passed.`);
