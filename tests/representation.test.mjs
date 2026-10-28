import assert from 'node:assert/strict';
import * as E from '../web/src/engine.js';
import * as C from '../engine/representation.ts';
import * as R from '../engine/rules.ts';
import * as D from '../engine/deploy.ts';
// All registered types, colors and disappearance marks fit without aliasing.
const pieces=new Set();
for(const t of Object.keys(E.P))for(const c of ['w','b'])for(const mark of [0,1]){
 const p=C.compactPiece(t,c,mark);assert(p>0&&p<128);pieces.add(p);
 assert.equal(C.compactType(p),t);assert.equal(C.compactColor(p),c);assert.equal(C.compactMark(p),mark);
 assert.equal(C.compactKind(p).cost,E.P[t].cost);
}
assert.equal(pieces.size,Object.keys(E.P).length*4);
// Zero-valued from/to and the unsigned top bit must survive; every move is truthy.
const plain=new Set();
for(let from=0;from<64;from++)for(let to=0;to<64;to++){
 const m=C.compactMove(from,to);assert(m);plain.add(m);
 assert.equal(C.compactFrom(m),from);assert.equal(C.compactTo(m),to);
}
assert.equal(plain.size,4096);
for(const promo of [undefined,...Object.keys(E.P)])for(const drop of [undefined,'doll'])
for(const cost of [undefined,0,.5,15.5,31])for(const castle of [undefined,0,7]){
 const m=C.compactMove(63,0,promo,drop,cost,castle,1,1);
 assert.equal(C.compactFrom(m),63);assert.equal(C.compactTo(m),0);
 assert.equal(C.compactPromo(m),promo);assert.equal(C.compactDrop(m),drop);
 assert.equal(C.compactCost(m),cost);assert.equal(C.compactCastle(m),castle);
 assert.equal(C.compactEpc(m),1);assert.equal(C.compactDbl(m),1);
}
// Search's ordinary arrays contain numbers; the public facade retains editable
// objects, precomputed children, and the same serialized position keys.
const w=new Map([[60,'k'],[56,'r'],[44,'alice'],[52,'p']]),b=new Map([[4,'k']]);
const core=D.buildState(w,b),s=E.buildState(w,b),before=structuredClone(s);
assert(core.b.every(p=>Number.isInteger(p)));
const packed=R.legalMoves(core),moves=E.legalMoves(s);assert(packed.every(Number.isInteger));
assert.equal(moves.length,packed.length);assert.equal(E.posKey(s),R.posKey(core));
for(const m of moves){assert(m._n);assert.deepEqual(E.kid(m),E.nextPosition(s,m));}
assert.deepEqual(s,before);
// Public mutations between calls must be observed, not hidden by stale encodings.
const value=E.evalPos(s);s.b[56]=null;assert.notEqual(E.evalPos(s),value);s.b[56]=before.b[56];
const old=E.P.r.value;E.P.r.value=old+3;assert.equal(C.compactKind(core.b[56]).value,old+3);E.P.r.value=old;
for(const bad of [{from:-1,to:0},{from:1.5,to:2},{from:1,to:2,promo:'unknown'},
 {from:1,to:2,drop:'unknown'},{from:1,to:2,castle:3},{from:1,to:2,cost:.25}])assert.throws(()=>E.applyMove(s,bad));
const key=E.posKey(s);E.clearTranspositionTable();E.clearOrderTables();
const seen=[];
const result=E.withSearchCache(()=>E.idSearch(s,2,{onDepth:r=>seen.push(r)}),{hist:[key]});
assert(seen.length);for(const r of [...seen,result]){assert(r.move._n);assert.deepEqual(E.kid(r.move),E.nextPosition(s,r.move));}
assert.deepEqual(s,before);
console.log('Numeric pieces, packed moves, shared metadata, public mutation and retained root children passed');
