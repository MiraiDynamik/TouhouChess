// Read-only engine experiment. Run: node --import tsx tests/timed-prune-bench.mjs
import {readFileSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import * as E from '../web/src/engine.js';
const sq=s=>(8-Number(s[1]))*8+'abcdefgh'.indexOf(s[0]);
const gold=JSON.parse(readFileSync(new URL('./golden.json',import.meta.url),'utf8'));
const map=(o,black=false)=>new Map(Object.entries(o).map(([k,v])=>[black?E.mirrorSq(sq(k)):sq(k),v]));
function fixture(name){
 const c=gold.cases.find(c=>c.name===name);assert(c);
 let s=E.buildState(map(c.def.w),map(c.def.b,true)),hist=[E.posKey(s)];
 for(const [a,b]of c.def.moves){
  const m=E.legalMoves(s).find(m=>m.from===sq(a)&&m.to===sq(b));assert(m,`${name}: ${a}${b}`);
  s=E.vanishPass(E.applyMove(s,m));hist.push(E.posKey(s));
 }
 return {name,s,hist};
}
const middle=fixture('香草开局');middle.name='香草展开后';
for(const text of ['e2e4','e7e5','g1f3','b8c6','f1b5','a7a6','b5a4','g8f6','e1g1','f8e7','f1e1','b7b5','a4b3','d7d6','c2c3','e8g8']){
 const m=E.legalMoves(middle.s).find(m=>m.from===sq(text.slice(0,2))&&m.to===sq(text.slice(2)));assert(m,text);
 middle.s=E.vanishPass(E.applyMove(middle.s,m));middle.hist.push(E.posKey(middle.s));
}
function sparse(name,w,b){const s=E.buildState(map(w),map(b));return {name,s,hist:[E.posKey(s)]};}
const cases=[fixture('香草开局'),middle,fixture('灵梦透明穿透'),fixture('爱丽丝可打入'),
 sparse('王车对王',{e1:'k',a1:'r'},{e8:'k'}),
 sparse('兵残局',{c3:'k',a4:'p',d4:'p',g3:'p'},{f6:'k',a6:'p',d5:'p',g6:'p'})];
const originalRandom=Math.random,originalInner=E.PRUNE.inner,rows=[];
const metadata={date:new Date().toISOString(),node:process.version,cpu:os.cpus()[0]?.model,timeMs:3000,repeats:3,defaultInner:originalInner,rootPrune:E.PRUNE.on,level:'eirin',cases:cases.map(c=>({name:c.name,state:c.s,hist:c.hist}))};
function seedRandom(seed){let x=seed>>>0;Math.random=()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};}
function run(c,enabled,seed,timeMs){
 seedRandom(seed);E.PRUNE.inner=enabled;E.setPosHist(c.hist);
 const layers=[];
 const r=E.timedMove(c.s,'eirin',{hist:c.hist,timeMs,onDepth:r=>layers.push({depth:r.depth,ms:r.ms})});
 const legal=E.legalMoves(c.s);
 assert(r.move&&legal.some(m=>m.from===r.move.from&&m.to===r.move.to&&m.promo===r.move.promo&&m.drop===r.move.drop&&m.castle===r.move.castle));
 return {depth:r.depth,ms:Math.round(r.ms),score:r.score,move:E.notate(c.s,r.move,E.vanishPass(r.move._n),E.legalMoves(E.vanishPass(r.move._n))),layers};
}
try{
 // Warm both code paths before measured sequential runs; alternate pair order.
 for(const enabled of [0,1])run(cases[0],enabled,42,500);
 for(let repeat=0;repeat<3;repeat++)for(const [index,c]of cases.entries()){
  const seed=20261025+repeat*100+index;
  const pair={name:c.name,repeat:repeat+1,seed};
  for(const enabled of (repeat+index)%2?[1,0]:[0,1])pair[enabled?'on':'off']=run(c,enabled,seed,3000);
  pair.gain=pair.on.depth-pair.off.depth;rows.push(pair);
  console.log(JSON.stringify(pair));
  writeFileSync('lab/out/timed-prune-3s.json',JSON.stringify({metadata,rows},null,2)+'\n');
 }
}finally{Math.random=originalRandom;E.PRUNE.inner=originalInner;E.clearSearchDeadline();}
console.log('Restored PRUNE.inner='+E.PRUNE.inner);
