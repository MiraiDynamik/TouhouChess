/* 本文件由 engine/extract.py 从单文件版机械抽取，之后手工改模块边界。
   抽取时不改逻辑 —— 行为必须和 tests/golden.json 完全一致。

   相对单文件版的三处模块化改动（都不改棋理）：
   1. 删掉界面状态（S/history/phase/deploy 这些）—— 它们属于 web/，不属于引擎
   2. buildState 改成接参数，不再读全局 deploy 表
   3. outcome 不再调 tr()，返回结构化 code，由界面负责翻译
      —— 引擎不该知道界面用什么语言 */
import {P} from './pieces.js';
import {ALL8,B,DIAG,W,at,file,nm,ok,rank} from './board.js';








/* 冻结格。搜索里每个结点会调好几次（pseudoAll 一次、每验证一个走法的
   inCheck 一次），而绝大多数对局盘上没有琪露诺 —— 原版无论如何都要
   new Set() 再扫 64 格。改成：先找冻结源，没有就返回共享的空集合，
   省掉每个结点好几次 Set 分配。行为不变（空集合是冻结的，不会被写）。 */
const NO_FROZEN=new Set();
export function frozenSet(s){
  let z=null;
  for(let i=0;i<64;i++){const p=s.b[i];if(!p||!P[p.t].freezer)continue;
    const r=rank(i),f=file(i);
    for(const[dr,df]of DIAG){if(!ok(r+dr,f+df))continue;
      const t=at(r+dr,f+df),q=s.b[t];
      if(q&&P[q.t].royal)continue;      // 将军对象不受冻结
      if(z===null)z=new Set();
      z.add(t);}}
  return z===null?NO_FROZEN:z;}
export function darkSet(s){const d=new Set();
  for(let i=0;i<64;i++){const p=s.b[i];if(!p||!P[p.t].fogger)continue;
    const r=rank(i),f=file(i);
    for(const[dr,df]of ALL8)if(ok(r+dr,f+df))d.add(at(r+dr,f+df));}
  // 桑尼米尔克：驱散她移动/攻击范围（斜4格）内的黑暗，双方同等生效
  for(let i=0;i<64;i++){const p=s.b[i];if(!p||!P[p.t].lightbringer)continue;
    const r=rank(i),f=file(i);
    for(const[dr,df]of DIAG)if(ok(r+dr,f+df))d.delete(at(r+dr,f+df));}
  return d;}

export function attacksFrom(s,i,fz){const p=s.b[i];if(!p)return[];
  if(fz&&fz.has(i))return[];
  return P[p.t].atk(s,i);}
export function isAttacked(s,sq,by,fz){
  for(let i=0;i<64;i++){const p=s.b[i];
    if(p&&p.c===by&&attacksFrom(s,i,fz).indexOf(sq)>=0)return true;}
  return false;}
export function royals(s,c){const o=[];
  for(let i=0;i<64;i++){const p=s.b[i];if(p&&p.c===c&&P[p.t].royal)o.push(i);}
  return o;}
export function inCheck(s,c,fz){fz=fz||frozenSet(s);const opp=c===W?B:W;
  return royals(s,c).some(k=>isAttacked(s,k,opp,fz));}

export function pseudo(s,i,fz){const p=s.b[i];
  if(!p||p.c!==s.turn)return[];
  if(fz.has(i))return[];
  const o=P[p.t].gen(s,i);
  const back=p.c===W?7:0;
  // 易位：只有将军对象（王或贤者）在王位时才能发起；车位那一侧可以是任何棋子
  if(i===at(back,4)&&P[p.t].royal&&!inCheck(s,p.c,fz)){
    const opp=p.c===W?B:W;
    for(const rf of[7,0]){
      if(!s.cas[p.c+rf])continue;
      const dir=rf===7?1:-1;
      let clear=true;
      for(let f=4+dir;f!==rf;f+=dir)if(s.b[at(back,f)]){clear=false;break;}
      if(!clear)continue;
      if(isAttacked(s,at(back,4+dir),opp,fz)||isAttacked(s,at(back,4+2*dir),opp,fz))continue;
      o.push({from:i,to:at(back,4+2*dir),castle:rf});}}
  return o;}

export function applyMove(s,m){
  const b=s.b.slice(),p=b[m.from],me=p.c,cas={...s.cas},am={...s.ammo};
  let cap=null;
  if(m.drop){cap=b[m.to];b[m.to]={t:m.drop,c:me};am[me]-=m.cost;
    return {b,turn:me===W?B:W,cas,ep:null,half:0,full:me===B?s.full+1:s.full,ammo:am,_cap:cap};}
  cap=b[m.to];
  b[m.to]=m.promo?{t:m.promo,c:me}:p;
  b[m.from]=null;
  if(m.epc){const cs=me===W?m.to+8:m.to-8;cap=b[cs];b[cs]=null;}
  if(m.castle!==undefined){const back=me===W?7:0,rf=m.castle,dir=rf===7?1:-1;
    b[at(back,4+dir)]=b[at(back,rf)];b[at(back,rf)]=null;}
  for(const col of[W,B]){const back=col===W?7:0;
    for(const f of[0,7])
      if(m.from===at(back,f)||m.to===at(back,f)||m.from===at(back,4))cas[col+f]=false;}
  return {b,turn:me===W?B:W,cas,ep:m.dbl?(m.from+m.to)/2:null,
    half:(P[p.t].pawnish||cap)?0:s.half+1,
    full:me===B?s.full+1:s.full,ammo:am,_cap:cap};}

/* ---- 惰性合法性 ----
   legalMoves 对每个伪合法走法都 applyMove + inCheck，而 alpha-beta 通常
   试 1~3 个走法就截断 —— 每个结点白验证约 27 个。而且它在 d<=0 之前就
   算完整表，所以地平线结点（结点数的大多数）全额付费。
   所以搜索改用 pseudoAll + tryMove 惰性验证；界面和测试仍用 legalMoves。
   探索的合法走法集合与顺序都不变（排序里混入非法走法不改变合法走法
   之间的相对次序，被跳过而已），所以搜索返回值不变 —— golden 必须照旧。 */

/* 伪合法走法：不 applyMove，只排掉「吃将军对象」这种根本不该生成的 */
export function pseudoAll(s){
  const fz=frozenSet(s),out=[];
  for(let i=0;i<64;i++){const p=s.b[i];if(!p||p.c!==s.turn)continue;
    for(const m of pseudo(s,i,fz)){
      const tgt=s.b[m.to];
      if(tgt&&tgt.c!==p.c&&P[tgt.t].royal)continue;
      out.push(m);}}
  return out;}

/* 验证并返回走完的局面；非法返回 null */
export function tryMove(s,m){
  const ns=applyMove(s,m);
  if(inCheck(ns,s.turn))return null;
  m._n=ns;return ns;}

/* 有没有合法走法。找到第一个就停 —— 判将杀/逼和只需要「有没有」。 */
export function hasLegal(s){
  const fz=frozenSet(s);
  for(let i=0;i<64;i++){const p=s.b[i];if(!p||p.c!==s.turn)continue;
    for(const m of pseudo(s,i,fz)){
      const tgt=s.b[m.to];
      if(tgt&&tgt.c!==p.c&&P[tgt.t].royal)continue;
      if(!inCheck(applyMove(s,m),s.turn))return true;}}
  return false;}

/* 完整合法走法表。界面、CLI、测试用这个；搜索走上面的惰性路径。 */
export function legalMoves(s){
  const out=[];
  for(const m of pseudoAll(s)){
    const ns=tryMove(s,m);
    if(ns)out.push(m);}
  return out;}

export function vanishPass(s){
  const b=s.b.slice();let ch=false;
  for(let i=0;i<64;i++){const p=b[i];if(!p||!P[p.t].vanish)continue;
    const last=p.c===W?0:7;
    if(rank(i)===last){if(p.mark){b[i]=null;}else b[i]={...p,mark:1};ch=true;}}
  return ch?{...s,b}:s;}

/* 局面指纹：盘面（含即将消失的标记）、行棋方、易位权、吃过路兵、双方剩余弹药 */
export function posKey(s){
  let k=s.turn+'|';
  for(let i=0;i<64;i++){const p=s.b[i];k+=p?(p.c+p.t+(p.mark?'!':'')+','):'.';}
  return k+'|'+[s.cas.w0,s.cas.w7,s.cas.b0,s.cas.b7].map(x=>x?1:0).join('')
    +'|'+(s.ep===null?'-':s.ep)+'|'+s.ammo.w+','+s.ammo.b;}
/* 局面历史。ES 模块里导入的绑定不能从外部赋值，所以给访问函数，
   界面和研究脚本都通过它改 —— 不是为了封装，是语言限制。 */
export let posHist=[];
export function setPosHist(a){posHist=a.slice();}
export function pushPos(k){posHist.push(k);}
export function repCount(k){let n=0;for(const x of posHist)if(x===k)n++;return n;}

export function outcome(s,ms){
  /* 只返回结构化结果，文案由界面翻译。engine 不引用任何 i18n。
     code: 'mates' | 'stalemate' | 'rep3' | 'fifty' | 'toMove'
     winner: 将杀时的赢方，其余为 null */
  const fz=frozenSet(s);
  if(!ms.length){
    const c=inCheck(s,s.turn,fz);
    return c?{over:1,code:'mates',winner:s.turn===W?B:W,alert:1}
            :{over:1,code:'stalemate',winner:null,alert:1};}
  if(repCount(posKey(s))>=3)return{over:1,code:'rep3',winner:null,alert:1};
  if(s.half>=100)return{over:1,code:'fifty',winner:null,alert:1};
  const c=inCheck(s,s.turn,fz);
  return{over:0,code:'toMove',winner:null,toMove:s.turn,check:!!c,alert:c};}
export function notate(s,m,ns,nms){
  if(m.castle!==undefined)return m.castle===7?'O-O':'O-O-O';
  if(m.drop)return P[m.drop].g+'*'+nm(m.to);
  const g=P[s.b[m.from].t].g,cap=s.b[m.to]||m.epc;
  return g+nm(m.from)+(cap?'x':'-')+nm(m.to)+(m.promo?'='+P[m.promo].g:'')
    +(inCheck(ns,ns.turn)?(nms.length===0?'#':'+'):'');}
