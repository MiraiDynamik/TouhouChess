// Small fixed-depth and 3-second experiments; no strength claims.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as E from '../web/src/engine.js';
const sq=s=>(8-Number(s[1]))*8+'abcdefgh'.indexOf(s[0]);
const gold=JSON.parse(fs.readFileSync(new URL('./golden.json',import.meta.url)));
const map=(o,b=false)=>new Map(Object.entries(o).map(([k,v])=>[b?E.mirrorSq(sq(k)):sq(k),v]));
const cases=['香草开局','灵梦透明穿透','爱丽丝可打入'].map(name=>{
 const c=gold.cases.find(c=>c.name===name);let s=E.buildState(map(c.def.w),map(c.def.b,true));
 for(const [a,b]of c.def.moves){const m=E.legalMoves(s).find(m=>m.from===sq(a)&&m.to===sq(b));s=E.vanishPass(E.applyMove(s,m));}
 return {name,s};
});
const random=Math.random,open=E.OPT.open,inner=E.PRUNE.inner;E.OPT.open=0;E.PRUNE.inner=0;
const seed=()=>{let x=123;Math.random=()=>((x=(Math.imul(x,1664525)+1013904223)>>>0)/4294967296);};
const rows=[];
try{
 // Warm up the JS runtime before recording, using an unrelated position.
 const warm=E.buildState(new Map([[60,'k'],[56,'r']]),new Map([[4,'k']]));
 for(let i=0;i<3;i++){E.setSearchState();E.negamax(warm,3,-Infinity,Infinity,0);}
 for(const {name,s}of cases){
  const hist=[E.posKey(s)],fixed=[];E.clearTranspositionTable();
  for(const mode of ['off','cold','warm']){
   E.setSearchState({end:performance.now()+120000,rep:new Set(hist)});E.clearOrderTables();
   const before=E.transpositionStats(),start=performance.now();
   const score=E.withSearchCache(()=>E.negamax(s,4,-Infinity,Infinity,0),{hist,enabled:mode!=='off'});
   const ms=performance.now()-start,stats=E.transpositionStats();
   fixed.push({mode,score,ms:Math.round(ms),nodes:E.srchNodes,hits:stats.hits-before.hits,cutoffs:stats.cutoffs-before.cutoffs});
   E.clearSearchDeadline();
  }
  assert(fixed.every(r=>r.score===fixed[0].score),name);
  const timed=[];
  for(const mode of ['off','cold','warm']){
   if(mode!=='warm')E.clearTranspositionTable();seed();
   const before=E.transpositionStats();
   const r=E.timedMove(s,'lunatic',{hist,timeMs:3000,tt:mode!=='off'});
   const after=E.transpositionStats();
   timed.push({mode,depth:r.depth,ms:Math.round(r.ms),hits:after.hits-before.hits,cutoffs:after.cutoffs-before.cutoffs});
  }
  rows.push({name,fixed,timed});console.log(JSON.stringify(rows.at(-1)));
 }
 fs.mkdirSync('lab/out',{recursive:true});
 fs.writeFileSync('lab/out/transposition-bench.json',JSON.stringify({date:new Date().toISOString(),node:process.version,slots:E.TT.slots,inner:0,rootPrune:E.PRUNE.on,rows},null,2));
}finally{Math.random=random;E.OPT.open=open;E.PRUNE.inner=inner;E.clearSearchDeadline();E.clearTranspositionTable();}
