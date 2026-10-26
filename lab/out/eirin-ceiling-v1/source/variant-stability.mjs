/** Thin experiment boundary: fixture replay and calls into the single shared engine. */
import fs from 'node:fs';
import readline from 'node:readline';
import * as E from '../engine/index.ts';
E.loadWeights(JSON.parse(fs.readFileSync(new URL('../engine/weights.json',import.meta.url))));
const sq=s=>(8-Number(s[1]))*8+'abcdefgh'.indexOf(s[0]);
const map=(o,black=false)=>new Map(Object.entries(o).map(([k,v])=>[black?E.mirrorSq(sq(k)):sq(k),v]));
const key=m=>m?JSON.stringify([m.from,m.to,m.promo??null,m.drop??null,m.castle??null]):null;
for await(const line of readline.createInterface({input:process.stdin})){
 try{
  const q=JSON.parse(line);let s=E.buildState(map(q.def.w),map(q.def.b,true)),hist=[E.posKey(s)];
  for(const [a,b]of q.def.moves){
   const moves=E.legalMoves(s),m=moves.find(m=>m.from===sq(a)&&m.to===sq(b)&&!m.drop&&!m.promo)??moves.find(m=>m.from===sq(a)&&m.to===sq(b));
   if(!m)throw Error('Invalid fixture move '+a+b);
   s=E.vanishPass(E.applyMove(s,m));hist.push(E.posKey(s));
  }
  E.setPosHist(hist);E.clearTranspositionTable();
  let seed=q.seed??123;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const start=performance.now();let result={depth:0,score:null,move:null};
  if(q.mode==='analysis'){
   E.setSearchState({end:start+q.timeMs,rep:new Set(hist)});
   const iterator=E.analysisSteps(s,{hist,plain:true});
   try{for(const row of iterator){if(!row.progress)result=row;if(performance.now()-start>=q.timeMs)break;}}
   catch(error){if(error!==E.EVABORT)throw error;}
   finally{iterator.return();E.clearSearchDeadline();}
  }else result=E.timedMove(s,'lunatic',{hist,timeMs:q.timeMs});
  const move=E.legalMoves(s).find(m=>key(m)===key(result.move));
  const next=move?E.kid(move):null;
  console.log(JSON.stringify({name:q.name,mode:q.mode,budget:q.timeMs,depth:result.depth,score:result.score,
   ms:Math.round(performance.now()-start),move:move?key(move):null,
   notation:move?E.notate(s,move,next,E.legalMoves(next)):null,position:s,hist}));
 }catch(error){console.log(JSON.stringify({error:String(error)}));}
}
