/** Object-facing API for the UI, Workers, PGN and CLI.
 * Conversion happens once on entry to a search, never at recursive nodes.
 * Public positions remain editable ordinary objects. Do not cache their encoding
 * between calls; a synchronous cache scope treats its inputs as read-only.
 */
import * as B from './board.js';
import * as G from './geometry.js';
import * as R from './rules.js';
import * as D from './deploy.js';
import * as V from './eval.js';
import * as S from './search.js';
import * as T from './transposition.js';
import * as C from './representation.js';

export * from './board.js';
export * from './geometry.js';
export * from './rules.js';
export * from './deploy.js';
export * from './eval.js';
export * from './search.js';
export {RULES, WEIGHTS, applyWeights} from './pieces.js';

const pieceIn=p=>p?C.compactPiece(p.t,p.c,p.mark):0;
const pieceOut=p=>p?{t:C.compactType(p),c:C.compactColor(p),...(C.compactMark(p)?{mark:1}:{})}:null;
let encodings: WeakMap<object, any> | null=null;
function encodingScope(run){
  const saved=encodings;encodings=new WeakMap();
  try{return run();}finally{encodings=saved;}
}
function stateIn(s){
  if(!s)return s;
  const cached=encodings?.get(s);if(cached)return cached;
  const result={...s,b:s.b.map(pieceIn),...(Object.hasOwn(s,'_cap')?{_cap:pieceIn(s._cap)}:{})};
  encodings?.set(s,result);return result;
}
function stateOut(s){
  return {...s,b:s.b.map(pieceOut),...(Object.hasOwn(s,'_cap')?{_cap:pieceOut(s._cap)}:{})};
}
function moveIn(m){
  if(m==null)return null;
  for(const square of [m.from,m.to])if(!Number.isInteger(square)||square<0||square>63)throw Error('Invalid move square');
  for(const t of [m.promo,m.drop])if(t!=null&&!C.compactTypeId(t))throw Error('Unknown move piece');
  if(m.castle!=null&&m.castle!==0&&m.castle!==7)throw Error('Invalid castling side');
  for(const flag of [m.epc,m.dbl])if(flag!=null&&flag!==0&&flag!==1&&flag!==false&&flag!==true)throw Error('Invalid move flag');
  return C.compactMove(m.from,m.to,m.promo,m.drop,m.cost,m.castle,m.epc,m.dbl);
}
function moveOut(m,s?){
  if(m==null)return null;
  const result:any={from:C.compactFrom(m),to:C.compactTo(m)};
  for(const [key,fn] of moveFields){const value=fn(m);if(value!==undefined)result[key]=value;}
  const child=s&&C.compactChildren.get(s)?.get(m);
  if(child)result._n=stateOut(child);
  return result;
}
const moveFields=[['promo',C.compactPromo],['drop',C.compactDrop],['cost',C.compactCost],
  ['castle',C.compactCastle],['epc',C.compactEpc],['dbl',C.compactDbl]] as const;
const movesOut=ms=>ms.map(m=>moveOut(m));
const resultOut=(r,s)=>({...r,move:moveOut(r.move,s)});

// Metadata and weights remain a single shared table. Only geometry functions
// are adapted; setting P[t].value still changes the actual search evaluator.
export const P=Object.fromEntries(Object.entries(B.P).map(([t,kind]:[string,any])=>{
  const methods={};
  return [t,new Proxy(kind,{get(target,key){
    if(!['gen','captures','atk','hits'].includes(String(key)))return target[key];
    if(!target[key])return target[key];
    return methods[key]??=(s,...args)=>{
      const result=target[key](stateIn(s),...args);
      return key==='gen'||key==='captures'?movesOut(result):result;
    };
  }})];
}));

export const transparent=p=>B.transparent(pieceIn(p));
export function pushm(s,i,to,out){const ms=[];B.pushm(stateIn(s),i,to,ms);out.push(...movesOut(ms));}
export const leapAtk=(s,...a)=>B.leapAtk(stateIn(s),...a);
export const slideAtk=(s,...a)=>B.slideAtk(stateIn(s),...a);
export const leapGen=(s,...a)=>movesOut(B.leapGen(stateIn(s),...a));
export const slideGen=(s,...a)=>movesOut(B.slideGen(stateIn(s),...a));
export const leapHits=(s,...a)=>B.leapHits(stateIn(s),...a);
export const slideHits=(s,...a)=>B.slideHits(stateIn(s),...a);
export const pawnAtk=(s,...a)=>G.pawnAtk(stateIn(s),...a);
export const pawnGen=(s,...a)=>movesOut(G.pawnGen(stateIn(s),...a));
export const dollDropOK=(s,...a)=>G.dollDropOK(stateIn(s),...a);
export const buildState=(...a)=>stateOut(D.buildState(...a));

export const withRuleCache=run=>encodingScope(()=>R.withRuleCache(run));
export const frozenSet=s=>R.frozenSet(stateIn(s));
export const darkSet=s=>R.darkSet(stateIn(s));
export const attacksFrom=(s,...a)=>R.attacksFrom(stateIn(s),...a);
export const isAttacked=(s,...a)=>R.isAttacked(stateIn(s),...a);
export const royals=(s,...a)=>R.royals(stateIn(s),...a);
export const inCheck=(s,...a)=>R.inCheck(stateIn(s),...a);
export const pseudo=(s,...a)=>movesOut(R.pseudo(stateIn(s),...a));
export const pseudoAll=s=>movesOut(R.pseudoAll(stateIn(s)));
export const pseudoCaptures=s=>movesOut(R.pseudoCaptures(stateIn(s)));
export const applyMove=(s,m)=>stateOut(R.applyMove(stateIn(s),moveIn(m)));
export function tryMove(s,m){
  const ns=R.tryMove(stateIn(s),moveIn(m));
  if(!ns)return null;
  return m._n=stateOut(ns);
}
export const hasLegal=s=>R.hasLegal(stateIn(s));
export function legalMoves(s){const x=stateIn(s);return R.legalMoves(x).map(m=>moveOut(m,x));}
export function vanishPass(s){const x=stateIn(s),next=R.vanishPass(x);return next===x?s:stateOut(next);}
export const posKey=s=>R.posKey(stateIn(s));
export const standardInsufficientMaterial=s=>R.standardInsufficientMaterial(stateIn(s));
export const outcome=(s,ms)=>R.outcome(stateIn(s),ms);
export const notate=(s,m,ns,nms)=>R.notate(stateIn(s),moveIn(m),stateIn(ns),nms);
export const evalPos=s=>V.evalPos(stateIn(s));

export const withSearchCache=(run,opt?)=>encodingScope(()=>S.withSearchCache(run,opt));
export const mscore=(s,m,ply?)=>S.mscore(stateIn(s),moveIn(m),ply);
export function order(s,ms,ply=0){
  const x=stateIn(s),original=new Map(),packed=ms.map(moveIn);
  for(let i=0;i<ms.length;i++){
    const group=original.get(packed[i]);
    if(group)group.push(ms[i]);else original.set(packed[i],[ms[i]]);
  }
  S.order(x,packed,ply);
  for(let i=0;i<ms.length;i++)ms[i]=original.get(packed[i]).shift();
  return ms;
}
export const kid=m=>vanishPass(m._n);
export const qsearch=(s,...a)=>S.qsearch(stateIn(s),...a);
export const negamax=(s,...a)=>S.negamax(stateIn(s),...a);
// These two functions only count occupied squares, so no conversion is needed.
export const depthFor=S.depthFor;
export const timedDepthFor=S.timedDepthFor;
export function rankMoves(s,d){
  const x=stateIn(s);return S.rankMoves(x,d).map(({m,v})=>({m:moveOut(m,x),v}));
}
// Preserve selection of the caller's original record, including extra fields.
function choose(pool,run){
  // Selection only inspects scores and optional child positions; it accepts
  // arbitrary move payloads (useful for probability tests and callers' metadata).
  const records=pool.map(x=>({...x,n:x.m?._n?stateIn(x.m._n):undefined}));
  const chosen=run(records);return chosen?pool[records.indexOf(chosen)]:null;
}
export const chooseRankedMove=(pool,strategy,preferCheck=false)=>choose(pool,x=>S.chooseRankedMove(x,strategy,preferCheck));
export const chooseFromMovePool=(pool,preferCheck=false)=>choose(pool,x=>S.chooseFromMovePool(x,preferCheck));
export function idSearch(s,d,opt={}){
  const x=stateIn(s);
  return resultOut(S.idSearch(x,d,{...opt,onDepth:opt.onDepth?r=>opt.onDepth(resultOut(r,x)):undefined}),x);
}
export function pickMove(s,...a){const x=stateIn(s);return moveOut(S.pickMove(x,...a),x);}
export function lunaticMoveAt(s,d){const x=stateIn(s);return moveOut(S.lunaticMoveAt(x,d),x);}
export function lunaticMove(s,d?){const x=stateIn(s);return moveOut(S.lunaticMove(x,d),x);}
export function timedMove(s,lv,opt={}){
  const x=stateIn(s);
  return resultOut(S.timedMove(x,lv,{...opt,onDepth:opt.onDepth?r=>opt.onDepth(resultOut(r,x)):undefined}),x);
}
export function* analysisSteps(s,opt?){
  for(const result of S.analysisSteps(stateIn(s),opt)){
    if(!result.move){yield result;continue;}
    const m=moveOut(result.move);
    yield {...result,move:{from:m.from,to:m.to,promo:m.promo||null,drop:m.drop||null,castle:m.castle}};
  }
}

// Diagnostics use the same table as search, with object conversion at the edge.
export const ttPositionKey=s=>T.ttPositionKey(stateIn(s));
export const moveKey=m=>T.moveKey(moveIn(m));
export const storeTransposition=(key,d,v,bound,m,ply,slot?)=>T.storeTransposition(key,d,v,bound,moveIn(m),ply,slot);
export {scoreToTT,scoreFromTT,newTranspositionSearch,probeTransposition} from './transposition.js';
