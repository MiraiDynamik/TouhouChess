/** Research adapter only: all move generation, evaluation and search live in engine/. */
import fs from 'node:fs';
import * as E from '../engine/index.ts';
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const base=JSON.parse(fs.readFileSync(new URL('../engine/weights.json',import.meta.url),'utf8'));
const sq=s=>(8-Number(s[1]))*8+'abcdefgh'.indexOf(s[0]);
const signature=m=>JSON.stringify([m.from,m.to,m.promo??null,m.drop??null,m.castle??null]);
const print=x=>process.stdout.write(JSON.stringify(x)+'\n');
const wait=new Int32Array(new SharedArrayBuffer(4));
function save(path,data){
 const tmp=path+'.'+process.pid+'.tmp';
 for(let attempt=0;;attempt++){
  try{fs.writeFileSync(tmp,JSON.stringify(data));fs.renameSync(tmp,path);return;}
  catch(e){if(!['EPERM','EACCES','EBUSY'].includes(e.code)||attempt===7)throw e;
   Atomics.wait(wait,0,0,Math.min(50*2**attempt,500));}
 }
}
function initial(spec){
 const dep={w:new Map(),b:new Map()};
 for(const c of ['w','b']){
  const army=c===spec.onSide?spec.armyA:spec.armyB;
  for(const [name,type] of Object.entries(army)){
   if(!/^[a-h][12]$/.test(name))throw Error('Bad deployment square');
   const i=c==='w'?sq(name):E.mirrorSq(sq(name));
   if(!E.canDeploy(dep,c,type,i))throw Error(`Illegal deployment ${c} ${name} ${type}`);
   dep[c].set(i,type);
  }
  if(!E.readySide(dep[c]))throw Error('Invalid army budget or royal count');
 }
 const s=E.buildState(dep.w,dep.b);
 // Pawn-odds experiment: spending differences must not become extra ammunition.
 // These armies have no droppers; record the fixed stock explicitly anyway.
 s.ammo={w:2,b:2};
 return s;
}
function writePGN(checkpoint,data){
 const result=!data.result||data.result.code==='unresolved'?'*':data.result.winner===null?'1/2-1/2':data.result.winner==='w'?'1-0':'0-1';
 const pgn=E.exportPGN({initial:initial(data.spec),moves:data.moves,result,
  headers:{Event:'Fairy value calibration',Site:'Local',Round:data.spec.id,White:'Eirin',Black:'Eirin',
   TFCExperiment:data.spec.id,Termination:data.result?.code||'unterminated'}});
 const path=checkpoint.replace(/\.json$/,'.pgn');
 fs.writeFileSync(path+'.tmp',pgn);fs.renameSync(path+'.tmp',path);
}
if(input.mode==='validate'){
 for(const spec of input.specs)initial(spec);
 print({validated:input.specs.length});
}else if(input.mode==='export'){
 const data=JSON.parse(fs.readFileSync(input.checkpoint,'utf8'));
 writePGN(input.checkpoint,data);print({exported:input.checkpoint});
}else if(input.mode==='game'){
 const {spec,checkpoint}=input;
 if(!(spec.timeMs>0)||!Number.isInteger(spec.maxPly)||spec.maxPly<1)throw Error('Bad search limits');
 E.loadWeights({...base,value:{...base.value,p:1,[spec.piece]:spec.piece==='p'?1:spec.prior}});
 let data;
 if(fs.existsSync(checkpoint)){
  data=JSON.parse(fs.readFileSync(checkpoint,'utf8'));
  if(JSON.stringify(data.spec)!==JSON.stringify(spec))throw Error('Checkpoint/spec mismatch');
 }else{
  const state=initial(spec);
  data={spec,state,hist:[E.posKey(state)],moves:[],result:null};save(checkpoint,data);
 }
 // A resumed worker starts with a cold TT; completed plies are never replayed.
 while(!data.result){
  E.setPosHist(data.hist);
  const legal=E.legalMoves(data.state),end=E.outcome(data.state,legal);
  if(end.over)data.result={code:end.code,winner:end.winner??null,
   score:end.winner===null?.5:end.winner===spec.onSide?1:0};
  else if(data.moves.length>=spec.maxPly)data.result={code:'unresolved',winner:null,score:null};
  if(data.result){save(checkpoint,data);break;}
  let seed=(spec.seed+Math.imul(data.moves.length+1,2654435761))>>>0;
  Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const found=E.timedMove(data.state,'lunatic',{hist:data.hist,timeMs:spec.timeMs});
  const move=found.move&&legal.find(m=>signature(m)===signature(found.move));
  if(!move)throw Error('No legal move returned');
  const next=E.vanishPass(E.applyMove(data.state,move));
  data.moves.push({ply:data.moves.length+1,side:data.state.turn,from:move.from,to:move.to,
   promo:move.promo,drop:move.drop,castle:move.castle,
   notation:E.notate(data.state,move,next,E.legalMoves(next)),depth:found.depth,ms:found.ms,score:found.score});
  data.state=next;data.hist.push(E.posKey(next));save(checkpoint,data);
  print({kind:'progress',id:spec.id,ply:data.moves.length,depth:found.depth,ms:found.ms});
 }
 writePGN(checkpoint,data);
 print({kind:'result',id:spec.id,...data.result,plies:data.moves.length});
}else throw Error('Unknown mode');
