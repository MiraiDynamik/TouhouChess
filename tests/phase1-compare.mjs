// Read-only search benchmark. Run: node --import tsx tests/phase1-compare.mjs
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
let E=await import(process.env.ENGINE_BUNDLE?pathToFileURL(process.env.ENGINE_BUNDLE).href:'../web/src/engine.js');
E.loadWeights(JSON.parse(readFileSync(new URL('../engine/weights.json',import.meta.url))));
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

const kia=fixture('香草开局');kia.name='Nf3 d5 g3';
for(const text of ['g1f3','d7d5','g2g3']){const m=E.legalMoves(kia.s).find(m=>m.from===sq(text.slice(0,2))&&m.to===sq(text.slice(2)));kia.s=E.nextPosition(kia.s,m);kia.hist.push(E.posKey(kia.s));}cases.splice(1,0,kia);
function seed(n){let x=n;Math.random=()=>((x=(Math.imul(x,1664525)+1013904223)>>>0)/4294967296);}

if(!process.env.BASELINE_BUNDLE)throw Error('Set BASELINE_BUNDLE to the saved pre-change engine bundle');
const after=E,before=await import(pathToFileURL(process.env.BASELINE_BUNDLE).href);
before.loadWeights(JSON.parse(readFileSync(new URL('../engine/weights.json',import.meta.url))));
for(const engine of [before,after])engine.timedMove(cases[0].s,'lunatic',{timeMs:1000,hist:cases[0].hist});
const rows=[];
for(let repeat=0;repeat<2;repeat++)for(const [i,c] of cases.entries())for(const phase of repeat%2?['after','before']:['before','after']){
 E=phase==='before'?before:after;seed(42);E.clearTranspositionTable();E.clearOrderTables();E.OPT.open=0;
 E.setSearchState({end:performance.now()+60000,rep:new Set(c.hist)});
 const start=performance.now();const r=E.withSearchCache(()=>E.idSearch(c.s,i>=5?8:5),{hist:c.hist});
 const row={phase,name:c.name,repeat,ms:performance.now()-start,nodes:E.srchNodes,depth:r.depth,score:r.score,move:E.nm(r.move.from)+E.nm(r.move.to)};
 E.clearSearchDeadline();rows.push(row);console.log(JSON.stringify(row));
}
writeFileSync('lab/out/phase1/interleaved-fixed.json',JSON.stringify(rows,null,2));
