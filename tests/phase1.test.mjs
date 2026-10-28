import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../web/src/engine.js';
const gold=JSON.parse(fs.readFileSync(new URL('./golden.json',import.meta.url)));
const sq=s=>(8-Number(s[1]))*8+'abcdefgh'.indexOf(s[0]);
const map=(o,b=false)=>new Map(Object.entries(o).map(([s,t])=>[b?E.mirrorSq(sq(s)):sq(s),t]));
const sig=m=>JSON.stringify([m.from,m.to,m.promo,m.drop,m.cost,m.castle,m.epc,m.dbl]);
let checked=0;
for(const c of gold.cases){
 if(c.error)continue;
 let s=E.buildState(map(c.def.w),map(c.def.b,true));
 for(const [a,b]of c.def.moves){const ms=E.legalMoves(s);const m=ms.find(m=>m.from===sq(a)&&m.to===sq(b)&&!m.drop&&!m.promo)??ms.find(m=>m.from===sq(a)&&m.to===sq(b));assert(m);s=E.nextPosition(s,m);}
 for(let ply=0;ply<12;ply++){
  E.withRuleCache(()=>{
   const before=JSON.stringify(s),fz=E.frozenSet(s);
   assert.equal(E.frozenSet(s),fz);
   for(let i=0;i<64;i++)if(s.b[i])for(let target=0;target<64;target++){
    const kind=E.P[s.b[i].t];if(kind.hits)assert.equal(kind.hits(s,i,target),kind.atk(s,i).includes(target),`${c.name} ${s.b[i].t} ${i} -> ${target}`);
   }
   assert.deepEqual(E.pseudoCaptures(s).map(sig),E.pseudoAll(s).filter(m=>s.b[m.to]||m.epc).map(sig),c.name);
   assert.equal(JSON.stringify(s),before);
  });
  const ms=E.legalMoves(s);checked++;if(!ms.length)break;
  s=E.nextPosition(s,ms[(ply*17+3)%ms.length]);
 }
}
// Public mutable states must not retain a stale frozen-set cache across searches.
const s=E.buildState(new Map([[60,'k'],[44,'cirno']]),new Map([[4,'k']]));
assert(E.withRuleCache(()=>E.frozenSet(s)).size>0);s.b[44]=null;
assert.equal(E.withRuleCache(()=>E.frozenSet(s)).size,0);
const bare=E.fromFEN('7k/8/8/8/8/8/8/K7 w - - 0 1');
assert.equal(E.vanishPass(bare),bare);
console.log(`Phase 1: attack/capture equivalence and state checks passed on ${checked} positions`);
// Quiescence must handle check, quiet evasions and mates reached by captures.
const mate=E.fromFEN('7k/6Q1/5K2/8/8/8/8/8 b - - 0 1');
assert.equal(E.qsearch(mate,-Infinity,Infinity,0),-E.MATE);
assert.equal(E.qsearch(mate,-Infinity,Infinity,3,7),-E.MATE+10);
const evasion=E.fromFEN('4k3/8/8/8/8/8/8/K3R3 b - - 0 1');
assert(E.inCheck(evasion,'b'));assert.equal(E.pseudoCaptures(evasion).length,0);
const expected=Math.max(...E.legalMoves(evasion).map(m=>-E.evalPos(E.nextPosition(evasion,m))));
assert.equal(E.qsearch(evasion,-Infinity,Infinity,0),expected);
const captureMate=E.fromFEN('7k/6r1/5KQ1/8/8/8/8/8 w - - 0 1');
assert.equal(E.qsearch(captureMate,-Infinity,Infinity,0),E.MATE-1);
console.log('Quiescence: checkmate, quiet evasions and capture mate passed');
assert.deepEqual(Object.fromEntries(Object.entries(E.LEVELS).map(([k,v])=>[k,v.timeMs])),{easy:475,normal:950,hard:1900,lunatic:2850});
// Explicit research budgets bypass the game defaults (tested via the deadline).
const prior=E.LEVELS.lunatic.timeMs;E.LEVELS.lunatic.timeMs=0;
try {
 const result=E.timedMove(evasion,'lunatic',{timeMs:100,onDepth:()=>E.setSearchState({end:performance.now()-1})});
 assert(result.depth>=1);
} finally {E.LEVELS.lunatic.timeMs=prior;E.clearSearchDeadline();}
