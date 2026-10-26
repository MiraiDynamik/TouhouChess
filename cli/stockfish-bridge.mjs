/** JSONL boundary only: all game rules and developer search remain in engine/. */
import fs from 'node:fs';
import readline from 'node:readline';
import * as E from '../engine/index.ts';
E.loadWeights(JSON.parse(fs.readFileSync(new URL('../engine/weights.json', import.meta.url))));
const uci = m => E.nm(m.from) + E.nm(m.to) + (m.promo || '');
function position(moves) {
 const w = new Map(), b = new Map();
 for (let f=0; f<8; f++) {
  w.set(56+f,'rnbqkbnr'[f]); w.set(48+f,'p');
  b.set(f,'rnbqkbnr'[f]); b.set(8+f,'p');
 }
 let s=E.buildState(w,b), hist=[E.posKey(s)];
 for (const text of moves) {
  const m=E.legalMoves(s).find(m=>uci(m)===text);
  if (!m) throw Error(`Illegal replay move ${text}`);
  s=E.vanishPass(E.applyMove(s,m)); hist.push(E.posKey(s));
 }
 E.setPosHist(hist);
 return {s,hist};
}
for await (const line of readline.createInterface({input:process.stdin})) {
 try {
  const q=JSON.parse(line);
  if(q.reset)E.clearTranspositionTable();
  const {s,hist}=position(q.moves || []);
  const legal=E.legalMoves(s), outcome=E.outcome(s,legal);
  let answer={outcome,turn:s.turn,legal:legal.map(uci)};
  if(q.search && !outcome.over) {
   let seed=q.seed>>>0;
   // Avalanche adjacent per-ply seeds before the PRNG: the first draw controls
   // blunders and must not drift almost monotonically across consecutive turns.
   seed=Math.imul(seed^(seed>>>16),0x7feb352d);
   seed=Math.imul(seed^(seed>>>15),0x846ca68b);
   seed=(seed^(seed>>>16))>>>0;
   Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
   const previous=E.PRUNE.inner;
   try {
    E.PRUNE.inner=1;
    const level=q.level??'lunatic';
    if(!Object.hasOwn(E.LEVELS,level))throw Error('Unknown difficulty '+level);
    const found=E.timedMove(s,level,{hist,timeMs:q.timeMs??undefined});
    const move=found.move && uci(found.move);
    if(!answer.legal.includes(move)) throw Error('Developer returned illegal move');
    answer={...answer,move,depth:found.depth,ms:found.ms,score:found.score};
   } finally {E.PRUNE.inner=previous;}
  }
  console.log(JSON.stringify(answer));
 } catch(error) {console.log(JSON.stringify({error:String(error)}));}
}
