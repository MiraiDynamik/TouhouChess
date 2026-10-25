/* 本文件由 engine/extract.py 从单文件版机械抽取，之后手工改模块边界。
   抽取时不改任何逻辑 —— 行为必须和 tests/golden.json 完全一致，
   先搬后改：倒过来做的话出了差异分不清是搬错还是改错。 */
import {P,WEIGHTS} from './pieces.js';
import {ALL8,B,W,at,file,ok,rank} from './board.js';
import {frozenSet} from './rules.js';








/* 评估：子力（按点数表）＋攻击格数（线控制）。弹药不计分 —— 见 evalPos 末尾 */
export const MATE=1e6;
export const HITW=new Uint8Array(64),HITB=new Uint8Array(64);
export const OPT={open:1,ctr:1,home:1,out:1,heavy:1,cast:1}; /* 开局原则项的开关，逐项消融用 */
/* 重子阈值：value>=5 且是滑行子才算「需要开放线的重子」。
   门槛跟着 value 走，所以调 value 会自动改变谁算重子 —— 这是对的。 */
export const HEAVY=5;
export function evalPos(s){
  const Wt=WEIGHTS;
  const me=s.turn,opp=me===W?B:W,fz=frozenSet(s);let v=0;
  HITW.fill(0);HITB.fill(0);
  const roy=[],nonRoy={w:0,b:0};
  for(let i=0;i<64;i++){const p=s.b[i];if(!p)continue;
    const sg=p.c===me?1:-1;
    v+=sg*P[p.t].value*100;
    if(P[p.t].royal)roy.push(i);else nonRoy[p.c]+=P[p.t].value;
    if(fz.has(i))continue;
    const a=P[p.t].atk(s,i);
    /* 机动性奖励不给将军对象：否则评估会主动把王往中心推（中心 8 格、角上 3 格） */
    if(!P[p.t].royal)v+=sg*a.length*Wt.mobility;
    const h=p.c===W?HITW:HITB;
    for(let k=0;k<a.length;k++)h[a[k]]=1;}
  /* 通用的王安全：将军对象周围被对方攻击的格数。不含任何兵形知识，对任何贤者一视同仁 */
  for(const i of roy){const p=s.b[i],sg=p.c===me?1:-1,h=p.c===W?HITB:HITW;
    const r=rank(i),f=file(i);let n=0;
    for(const[dr,df]of ALL8)if(ok(r+dr,f+df)&&h[at(r+dr,f+df)])n++;
    v-=sg*n*Wt.kingSafety;}
  /* 残局杀王驱动：一方只剩将军对象、另一方有足够子力时，
     把光将军对象往边角赶，并把自己的将军对象贴上去。
     两项上限合计 91，小于一个兵，所以永远不会压过子力。*/
  if(roy.length===2){
    const bare=nonRoy.w<=.5?W:(nonRoy.b<=.5?B:null);
    if(bare&&nonRoy[bare===W?B:W]>=4){
      const ri=roy[0],rj=roy[1];
      const bi=s.b[ri].c===bare?ri:rj, si=bi===ri?rj:ri;   /* 光的那个 / 强的那个 */
      const br=rank(bi),bf=file(bi),sr=rank(si),sf=file(si);
      const edge=Math.max(Math.abs(3.5-br),Math.abs(3.5-bf));      /* 0.5…3.5 离中心 */
      const near=Math.max(Math.abs(sr-br),Math.abs(sf-bf));        /* 1…7 两王距离 */
      const corner=Math.min(Math.max(br,bf),Math.max(br,7-bf),
                            Math.max(7-br,bf),Math.max(7-br,7-bf)); /* 0…3 离最近的角 */
      const sg=s.b[si].c===me?1:-1;
      v+=sg*(edge*Wt.endgame.edge-near*Wt.endgame.near-corner*Wt.endgame.corner);}}
  /* 开局原则：只在子力还多的时候生效，四项合计远小于一个兵，压不过子力。
     占中心 / 易位 / 快出轻子 / 晚出大子 —— 把人类的开局习惯写进评估 */
  if(OPT.open&&nonRoy.w+nonRoy.b>=Wt.openMinMaterial){
    for(const c of[W,B]){
      const sg=c===me?1:-1, back=c===W?7:0, h=c===W?HITW:HITB;
      /* 1. 占中心：攻击到 d4 e4 d5 e5 的格数 */
      let ctr=0;
      for(const[r,f]of[[3,3],[3,4],[4,3],[4,4]])if(h[at(r,f)])ctr++;
      if(OPT.ctr)v+=sg*ctr*Wt.open.center;
      /* 2. 该早出的轻子还堵在家里：b/c/f/g 底线格上每有一个扣分。
         只认带 dev 标记的子——爱丽丝要坐着守角、恋走出去就是白送，都不该被推出门 */
      let home=0,dev=0,early=0,castled=0;
      for(const f of[1,2,5,6]){const q=s.b[at(back,f)];
        if(q&&q.c===c&&P[q.t].dev)home++;}
      if(OPT.home)v-=sg*home*Wt.open.homeBlock;
      for(let i=0;i<64;i++){const q=s.b[i];if(!q||q.c!==c||P[q.t].royal)continue;
        /* 3. 该早出的轻子出了底线给奖励 */
        if(P[q.t].dev&&rank(i)!==back)dev++;
        /* 4. 滑行重子（≥5分且需要开放线：车 后 早苗 衣玖 龙王）过早离开底线扣分。
           沿底线平移不算离开，所以「衣玖要早点沿底线挪位」那条实测不受影响。
           灵梦不在内：她穿透、攻击圈在线外、永远有退路，被堵被赶这条代价对她不成立。
           实测 灵梦3枚 在这一项下只有 36.9%(n=80)，关掉回到 56.9%，z=2.59 */
        if(P[q.t].value>=HEAVY&&P[q.t].slider&&rank(i)!==back)early++;}
      if(OPT.out)v+=sg*dev*Wt.open.develop;
      if(OPT.heavy)v-=sg*early*Wt.open.heavyEarly;
      /* 5. 易位过的将军对象（在 g 或 c 列的底线上）给奖励 */
      for(const i of roy)if(s.b[i].c===c&&rank(i)===back&&(file(i)===6||file(i)===2))castled=1;
      if(OPT.cast)v+=sg*castled*Wt.open.castled;}}
  /* 弹药本身没有价值，打入之后才有 —— 所以不给它任何评估分。
     于是「打入人偶」= 花掉零价值的东西换来 0.5 分的子 = 净 +0.5 分，
     搜索自己去和「跳马拿位置分」比较，哪个优势大走哪个。
     给弹药记分会奖励囤着不花，而囤着的弹药什么也不做。 */
  return v;}
