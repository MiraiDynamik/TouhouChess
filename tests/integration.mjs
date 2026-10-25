import assert from 'node:assert/strict';
import {get} from 'svelte/store';
import {createGame} from '../web/src/game.js';
import * as E from '../web/src/engine.js';
import * as bundle from '../web/engine.mjs';
import weights from '../engine/weights.json' with {type:'json'};
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {build} from 'esbuild';
const sq=s=>(8-Number(s[1]))*8+'abcdefgh'.indexOf(s[0]);
let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const game=createGame();
const state=()=>get(game);
const move=(a,b)=>{game.click(sq(a));game.click(sq(b));};
function put(g,color,type,square){g.selectSide(color);g.selectPiece(type);g.click(sq(square));g.selectPiece(type);}
// Vanilla workflow, immutable history, repetition, undo, language and redeploy.
game.preset();game.selectSide('b');game.preset();game.start();
eq(state().phase,'play');eq(state().legal.length,20);eq(state().position.ammo,{w:2,b:2});
bundle.loadWeights(weights);
eq(E.posKey(state().position),bundle.posKey(state().position));
eq(E.evalPos(state().position),bundle.evalPos(state().position));
const original=state().position;
const initialView=state();
game.toggleLanguage();
eq(initialView.lang,'zh');
game.toggleLanguage();
const beforeMove=state();
move('e2','e4');
eq(beforeMove.position,original);eq(beforeMove.log,[]);eq(beforeMove.lastMove,null);
game.undo();
for(let i=0;i<2;i++){move('g1','f3');move('g8','f6');move('f3','g1');move('f6','g8');}
eq(E.outcome(state().position,state().legal).code,'rep3');eq(state().log.length,8);
eq(E.posHist.length,9);game.undo();eq(E.posHist.length,8);
eq(E.outcome(state().position,state().legal).over,0);
eq(original.b[sq('g1')].t,'n');eq(original.b[sq('f3')],null);
game.flip();eq(state().flipped,true);game.toggleLanguage();eq(state().lang,'en');
game.redeploy();eq(state().phase,'deploy');eq(state().deploy.w.size,16);game.dispose();
// Existing deployment restrictions: budget, royal count, slots and Cirno colour.
const dep=createGame();
put(dep,'w','cirno','b1');eq(get(dep).deploy.w.size,0);
put(dep,'w','cirno','b2');put(dep,'w','cirno','d2');eq(get(dep).deploy.w.size,1);
put(dep,'w','cirno','c2');eq(get(dep).deploy.w.size,2);
put(dep,'w','yukari','a1');eq(get(dep).deploy.w.has(sq('a1')),false);
put(dep,'w','yukari','d1');eq(get(dep).deploy.w.get(sq('d1')),'yukari');
dep.start();eq(get(dep).phase,'deploy');dep.dispose();
// Terminal moves must publish the final position; undo must make play possible again.
for(const terminal of ['mates','stalemate']){
 const end=createGame();
 if(terminal==='mates'){end.preset();end.selectSide('b');end.preset();}
 else {put(end,'w','k','e1');put(end,'w','q','d1');put(end,'b','k','e8');}
 end.start();
 const line=terminal==='mates'?[['f2','f3'],['e7','e5'],['g2','g4'],['d8','h4']]:
  [['e1','d2'],['e8','d8'],['d2','c3'],['d8','c8'],['c3','c4'],['c8','b8'],
   ['c4','c5'],['b8','a8'],['c5','c6'],['a8','b8'],['d1','b3'],['b8','a8'],['b3','b6']];
 let published;const unsubscribe=end.subscribe(s=>{published={turn:s.position?.turn,code:s.position?E.outcome(s.position,s.legal).code:null};});
 for(const [a,b]of line){end.click(sq(a));end.click(sq(b));}
 eq(published,{turn:terminal==='mates'?'w':'b',code:terminal});
 eq(get(end).legal.length,0);eq(get(end).thinking,false);
 end.setBotSide('wb');eq(get(end).thinking,false);
 const finalPosition=get(end).position;
 end.click(sq('e1'));eq(get(end).position,finalPosition);
 end.undo();eq(E.outcome(get(end).position,get(end).legal).over,0);
 unsubscribe();end.dispose();
}
// Fifty-move draw through 100 real reversible plies, without threefold repetition.
const fifty=createGame();put(fifty,'w','k','e1');put(fifty,'b','k','e8');fifty.start();
for(let ply=0;ply<100;ply++){
 const before=get(fifty);
 const visits=m=>before.posHist.filter(k=>k===E.posKey(E.vanishPass(m._n))).length;
 const candidate=[...before.legal].sort((a,b)=>visits(a)-visits(b)).find(m=>{
  const next=E.vanishPass(m._n),key=E.posKey(next);
  return next.half===ply+1&&before.posHist.filter(k=>k===key).length<2;
 });
 assert(candidate,`No reversible move at ply ${ply}`);
 fifty.click(candidate.from);fifty.click(candidate.to);
 eq(before.position.half,ply);
}
eq(E.outcome(get(fifty).position,get(fifty).legal).code,'fifty');
fifty.setBotSide('wb');eq(get(fifty).thinking,false);
fifty.undo();eq(E.outcome(get(fifty).position,get(fifty).legal).over,0);fifty.dispose();
// Promotion: exercise real click-choice-commit path rather than calling engine directly.
const promo=createGame();put(promo,'w','k','e1');put(promo,'w','p','a2');put(promo,'b','k','e8');promo.start();
const pm=(a,b)=>{promo.click(sq(a));promo.click(sq(b));};
for(const [a,b]of [['a2','a4'],['e8','d8'],['a4','a5'],['d8','e8'],['a5','a6'],['e8','d8'],['a6','a7'],['d8','e8']])pm(a,b);
pm('a7','a8');eq(get(promo).choices.map(m=>m.promo),['q','r','b','n']);
promo.choose(get(promo).choices.find(m=>m.promo==='q'));eq(get(promo).position.b[sq('a8')].t,'q');
promo.undo();eq(get(promo).position.b[sq('a7')].t,'p');eq(get(promo).choices,null);promo.dispose();
// Alice overlaps move/drop destinations; choosing drop spends ammo but leaves Alice.
const alice=createGame();put(alice,'w','k','e1');put(alice,'w','alice','b2');put(alice,'b','k','e8');alice.start();
const drop=get(alice).legal.find(m=>m.drop);
assert(drop);const from=drop.from,to=drop.to,before=get(alice).position.ammo.w;
alice.click(from);alice.click(to);
if(get(alice).choices)alice.choose(get(alice).choices.find(m=>m.drop));
eq(get(alice).position.b[from].t,'alice');eq(get(alice).position.b[to].t,'doll');eq(get(alice).position.ammo.w,before-drop.cost);alice.dispose();
// The actual worker entry is bundled for Node only to test its protocol off-thread.
const compiled=await build({entryPoints:['web/src/analysis.worker.js'],bundle:true,write:false,format:'cjs',platform:'node'});
const worker=new Worker(`const {parentPort}=require('node:worker_threads');
 global.self={postMessage:m=>parentPort.postMessage(m)};
 ${compiled.outputFiles[0].text}
 parentPort.on('message',data=>self.onmessage({data}));`,{eval:true});
const received=[];
await new Promise((resolve,reject)=>{
 const timeout=setTimeout(()=>reject(Error('Worker did not reach depth 3')),20000);
 worker.on('error',reject);
 worker.on('message',m=>{received.push(m);if(m.depth===3){clearTimeout(timeout);resolve();}});
 worker.postMessage({state:original,hist:[E.posKey(original)],plain:true});
}).finally(()=>worker.terminate());
eq(received.filter(m=>m.depth).slice(0,3).map(m=>m.depth),[1,2,3]);
assert(received.every(m=>Number.isFinite(m.score)&&m.move));
// Old worker logic and new shared generator must agree at the same fixed depth.
E.setSearchState();const save=E.OPT.open;E.OPT.open=0;
const expected=E.rankMoves(original,3)[0].v;E.OPT.open=save;
eq(received.find(m=>m.depth===3).score,expected);
const html=readFileSync(new URL('../touhou-chess.html',import.meta.url),'utf8');
assert(!html.includes('GENERATED_ENGINE'));assert(!/(?:src|href)="\.\/assets\//.test(html));
console.log(`Svelte integration: ${checks} assertions passed; deployment, repetition/undo, promotion, drops, shared bundle and real Worker.`);
