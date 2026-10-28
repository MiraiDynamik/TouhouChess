/** Bounded full-key transposition table. No probabilistic hash collisions.
 * A fixed slot array caps both entry count and replacement work. Full position
 * strings are verified after indexing; collisions only reduce hit rate.
 */
import {posKey} from './rules.js';
import {MATE} from './eval.js';
export const TT={enabled:true,slots:32768};
export const moveKey=m=>m?JSON.stringify([m.from,m.to,m.promo??null,m.drop??null,
  m.cost??null,m.castle??null,m.epc??null,m.dbl??null]):null;
export const ttPositionKey=s=>posKey(s)+'|half:'+s.half;
export const scoreToTT=(v,ply)=>v>MATE/2?v+ply:v<-MATE/2?v-ply:v;
export const scoreFromTT=(v,ply)=>v>MATE/2?v-ply:v<-MATE/2?v+ply:v;
let table=[],configuration='',generation=0,used=0;
let counters={probes:0,hits:0,cutoffs:0,stores:0};
export function clearTranspositionTable(){
  table=[];configuration='';generation=0;used=0;
  counters={probes:0,hits:0,cutoffs:0,stores:0};
}
export const transpositionStats=()=>({...counters,entries:used,capacity:TT.slots,generation});
export function newTranspositionSearch(config){
  if(!Number.isInteger(TT.slots)||TT.slots<1||TT.slots>1048576)throw Error('Invalid TT slot count');
  const identity=config+'|slots:'+TT.slots;
  if(identity!==configuration){clearTranspositionTable();configuration=identity;}
  generation++;
}
export function transpositionIndex(key){
  let h=2166136261;
  for(let i=0;i<key.length;i++)h=Math.imul(h^key.charCodeAt(i),16777619);
  return (h>>>0)%TT.slots;
}
export function probeTransposition(key,slot=transpositionIndex(key)){
  counters.probes++;
  const e=table[slot];
  if(e?.key!==key)return null;
  counters.hits++;return e;
}
export function countTTCutoff(){counters.cutoffs++;}
export function storeTransposition(key,depth,value,bound,move,ply,slot=transpositionIndex(key)){
  if(!Number.isFinite(value))return;
  const i=slot,old=table[i];
  // Prefer deep entries of this generation; older entries may be replaced.
  if(old&&old.generation===generation&&old.depth>depth&&bound!=='exact')return;
  if(!old)used++;
  table[i]={key,depth,value:scoreToTT(value,ply),bound,move:moveKey(move),generation};
  counters.stores++;
}

export function matchesMove(m,key){
  return m.from===key[0]&&m.to===key[1]&&(m.promo??null)===key[2]&&(m.drop??null)===key[3]
    &&(m.cost??null)===key[4]&&(m.castle??null)===key[5]&&(m.epc??null)===key[6]&&(m.dbl??null)===key[7];
}
