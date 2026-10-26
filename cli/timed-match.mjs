/** Thin experiment boundary: deployment validation, search and rules all use engine/. */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as E from '../engine/index.ts';
E.loadWeights(JSON.parse(fs.readFileSync(new URL('../engine/weights.json',import.meta.url),'utf8')));
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const sq=s=>(8-Number(s[1]))*8+'abcdefgh'.indexOf(s[0]);
const save=(path,value)=>{fs.writeFileSync(path+'.tmp',JSON.stringify(value));fs.renameSync(path+'.tmp',path);};
const print=value=>process.stdout.write(JSON.stringify(value)+'\n');
const signature=m=>JSON.stringify([m.from,m.to,m.promo??null,m.drop??null,m.castle??null]);
function deployment(army){
 const dep={w:new Map(),b:new Map()};
 for(const color of ['w','b'])for(const [square,type]of Object.entries(army)){
  const i=color==='w'?sq(square):E.mirrorSq(sq(square));
  if(!E.canDeploy(dep,color,type,i))throw Error(`Invalid deployment: ${color} ${square} ${type}`);
  dep[color].set(i,type);
 }
 if(!E.readySide(dep.w)||!E.readySide(dep.b))throw Error('Invalid budget/royal count');
 return dep;
}
function randomSeed(seed){let x=seed>>>0;Math.random=()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};}
if(input.mode==='catalog'){
 const dep={w:new Map([[sq('e1'),'k']]),b:new Map()};
 const choices={};
 for(let i=48;i<64;i++)if(i!==sq('e1'))choices[E.nm(i)]=Object.keys(E.P).filter(t=>!E.P[t].royal&&E.canDeploy(dep,'w',t,i));
 print(choices);
}else if(input.mode==='prepare'){
 // Python supplies random ordering; this adapter only accepts engine-legal placements.
 const dep={w:new Map([[sq('e1'),'k']]),b:new Map()};
 for(const [square,types]of input.proposals){
  const i=sq(square);
  for(const t of types)if(E.canDeploy(dep,'w',t,i)){
   const candidate=new Map(dep.w);candidate.set(i,t);
   if(E.readySide(candidate)){dep.w=candidate;break;}
  }
 }
 const army=Object.fromEntries([...dep.w].map(([i,t])=>[E.nm(i),t]));
 deployment(army);print({army,points:E.pointsOf(dep.w)});
}else if(input.mode==='game'){
 const {spec,checkpoint}=input;
 if(!(spec.timeMs>0)||!Number.isInteger(spec.maxPly)||spec.maxPly<1)throw Error('Invalid limits');
 const dep=deployment(spec.army);
 const identity=createHash('sha256').update(JSON.stringify(spec)).digest('hex');
 let data;
 if(fs.existsSync(checkpoint)){
  data=JSON.parse(fs.readFileSync(checkpoint,'utf8'));
  if(data.identity!==identity)throw Error('Checkpoint/spec mismatch');
 }else{
  const state=E.buildState(dep.w,dep.b);
  data={identity,state,hist:[E.posKey(state)],moves:[],result:null};save(checkpoint,data);
 }
 const previous=E.PRUNE.inner;
 try{
  while(!data.result){
   E.setPosHist(data.hist);
   const legal=E.legalMoves(data.state),outcome=E.outcome(data.state,legal);
   if(outcome.over){
    data.result={code:outcome.code,winner:outcome.winner??null,
     score:outcome.winner===null?0.5:outcome.winner===spec.onSide?1:0};
   }else if(data.moves.length>=spec.maxPly){data.result={code:'unresolved',winner:null,score:null};}
   if(data.result){save(checkpoint,data);break;}
   const enabled=data.state.turn===spec.onSide;
   E.PRUNE.inner=enabled?1:0;
   randomSeed((spec.seed+Math.imul(data.moves.length+1,2654435761))>>>0);
   const found=E.timedMove(data.state,'eirin',{hist:data.hist,timeMs:spec.timeMs});
   const move=found.move&&legal.find(m=>signature(m)===signature(found.move));
   if(!move)throw Error('Search returned no legal move in a nonterminal position');
   const next=E.vanishPass(E.applyMove(data.state,move));
   data.moves.push({ply:data.moves.length+1,side:data.state.turn,enabled,
    from:move.from,to:move.to,promo:move.promo,drop:move.drop,castle:move.castle,
    notation:E.notate(data.state,move,next,E.legalMoves(next)),depth:found.depth,ms:found.ms,score:found.score});
   data.state=next;data.hist.push(E.posKey(next));save(checkpoint,data);
   print({kind:'progress',id:spec.id,ply:data.moves.length,depth:found.depth,ms:found.ms});
  }
  print({kind:'result',id:spec.id,...data.result,plies:data.moves.length});
 }finally{E.PRUNE.inner=previous;}
}else throw Error('Unknown mode');
