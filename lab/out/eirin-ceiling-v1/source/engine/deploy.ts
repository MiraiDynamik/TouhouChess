/* 部署与点数预算。从 rules.ts 拆出来 —— 它只在部署阶段用，
   而且 buildState 原来读的是界面的全局 deploy 表，现在改成接参数。

   cost 来自 rules/pieces.toml（规则，玩家可见）；
   引擎估价 value 是另一回事，见 eval.ts 的权重注入。 */
import {P} from './pieces.js';
import {B,W,at,file,rank} from './board.js';







export const BUDGET=45, BODIES=16;

/* 白方视角的格号 → 黑方的对应格号（上下翻转，列不变） */
export const mirrorSq=i=>(7-(i>>3))*8+(i&7);

export function slotOf(i,c){const r=rank(i),f=file(i);
  const back=c===W?7:0,pawn=c===W?6:1;
  if(r===pawn)return 'p';
  if(r===back)return f===4?'k':f===3?'q':(f===0||f===7)?'r':'n';
  return null;}
/* dep 是 Map<格号, 棋子键>，由调用方给 —— 不再读全局表 */
export function pointsOf(dep){let v=0;for(const t of dep.values())v+=P[t].cost;return v;}
export function readySide(dep){const rc=[...dep.values()].filter(t=>P[t].royal).length;
  return pointsOf(dep)<=BUDGET&&rc===1;}
export const fmt=x=>(Math.round(x*10)/10).toString();

/** Existing UI deployment constraints, now shared by all engine consumers. */
export function canDeploy(deploy,c,t,i){
  const d=P[t],slot=slotOf(i,c);
  if(!d||!slot||!d.slots.includes(slot)||deploy.w.has(i)||deploy.b.has(i))return false;
  if(d.files&&!d.files.includes(file(i)))return false;
  let same=0,total=0;
  const color=(rank(i)+file(i))&1;
  for(const[j,type]of deploy[c])if(type===t){
    total++;if(((rank(j)+file(j))&1)===color)same++;
  }
  if(d.max&&total>=d.max)return false;
  return d.limit!=='sqcolor'||(same===0&&total<2);
}

/* wDep / bDep 是 Map<绝对格号, 棋子键>。
   **约定：两边都是绝对格号，不做任何镜像。** 单文件版里两个调用点约定不同
   （界面用绝对格号，play.js 接格名并镜像黑方），这种双约定正是歧义的来源，
   所以模块版只留一个：要用白方视角的格名摆黑方，调用方自己 mirrorSq。
   引擎不该知道界面状态，所以也不再读全局 deploy 表。
   弹药 = 预算 − 场上点数，但没有打入手时它花不出去（见 eval.ts 的说明）。 */
export function buildState(wDep,bDep){
  const b=new Array(64).fill(null);
  for(const[i,t]of wDep)b[i]={t,c:W};
  for(const[i,t]of bDep)b[i]={t,c:B};
  const cas={};
  for(const c of[W,B]){const back=c===W?7:0;
    for(const f of[0,7]){const q=b[at(back,f)],k=b[at(back,4)];
      cas[c+f]=!!(q&&q.c===c&&k&&k.c===c);}}
  return {b,turn:W,cas,ep:null,half:0,full:1,
    ammo:{w:+(BUDGET-pointsOf(wDep)).toFixed(1),
          b:+(BUDGET-pointsOf(bDep)).toFixed(1)}};}

