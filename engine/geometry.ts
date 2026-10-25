
/* 本文件由 engine/extract.py 从单文件版机械抽取，之后手工改模块边界。
   抽取时不改任何逻辑 —— 行为必须和 tests/golden.json 完全一致，
   先搬后改：倒过来做的话出了差异分不清是搬错还是改错。 */
import {ALFIL,ALL8,B,DIAG,GOLD,KNIGHT,ORTHO,REIMU_ATK,SILVER,W,at,def,file,fw,leapAtk,leapGen,lf,ok,promoOpts,rank,rt,slideAtk,slideGen} from './board.js';







def('k',{n:'王',g:'\u265A',v:4,slots:['k'],royal:1,atk:(s,i)=>leapAtk(s,i,ALL8),gen:(s,i)=>leapGen(s,i,ALL8)});
def('q',{n:'后',g:'\u265B',v:9,slots:['q'],slider:1,atk:(s,i)=>slideAtk(s,i,ALL8),gen:(s,i)=>slideGen(s,i,ALL8)});
def('r',{n:'车',g:'\u265C',v:5,slots:['r'],slider:1,atk:(s,i)=>slideAtk(s,i,ORTHO),gen:(s,i)=>slideGen(s,i,ORTHO)});
def('b',{n:'象',g:'\u265D',v:3,slots:['n'],dev:1,atk:(s,i)=>slideAtk(s,i,DIAG),gen:(s,i)=>slideGen(s,i,DIAG)});
def('n',{n:'马',g:'\u265E',v:3,slots:['n'],dev:1,atk:(s,i)=>leapAtk(s,i,KNIGHT),gen:(s,i)=>leapGen(s,i,KNIGHT)});

export function pawnAtk(s,i,dirs){const p=s.b[i],r=rank(i),f=file(i),d=fw(p.c),o=[];
  for(const df of dirs)if(ok(r+d,f+df))o.push(at(r+d,f+df));return o;}
export function pawnGen(s,i,dirs,dbl){
  const p=s.b[i],me=p.c,opp=me===W?B:W,r=rank(i),f=file(i),d=fw(me),o=[];
  const last=me===W?0:7,home=me===W?6:1;
  if(ok(r+d,f)){const one=at(r+d,f);
    if(!s.b[one]){
      if(r+d===last)promoOpts().forEach(t=>o.push({from:i,to:one,promo:t}));
      else o.push({from:i,to:one});
      if(dbl&&r===home&&ok(r+2*d,f)&&!s.b[at(r+2*d,f)])o.push({from:i,to:at(r+2*d,f),dbl:1});
    }}
  for(const df of dirs){const nr=r+d,nf=f+df;if(!ok(nr,nf))continue;
    const t=at(nr,nf),q=s.b[t];
    if(q&&q.c===opp){
      if(nr===last)promoOpts().forEach(pt=>o.push({from:i,to:t,promo:pt}));
      else o.push({from:i,to:t});
    }else if(!q&&t===s.ep)o.push({from:i,to:t,epc:1});}
  return o;}
def('p',{n:'兵',g:'\u265F',v:1,slots:['p'],pawnish:1,
  atk:(s,i)=>pawnAtk(s,i,[-1,1]),gen:(s,i)=>pawnGen(s,i,[-1,1],true)});

def('keda',{n:'毛玉',g:'●',v:.5,slots:['p'],vanish:1,pawnish:1,
  atk:(s,i)=>pawnAtk(s,i,[lf(s.b[i].c)]),gen:(s,i)=>pawnGen(s,i,[lf(s.b[i].c)],true)});
def('onmyo',{n:'\u9634\u9633\u7389',g:'☯︎',v:.5,slots:['p'],vanish:1,pawnish:1,
  atk:(s,i)=>pawnAtk(s,i,[rt(s.b[i].c)]),gen:(s,i)=>pawnGen(s,i,[rt(s.b[i].c)],true)});
def('ghost',{n:'\u5E7D\u7075',g:'☻',v:.5,slots:['p'],vanish:1,pawnish:1,
  atk:(s,i)=>pawnAtk(s,i,[0]),
  gen:(s,i)=>{const p=s.b[i],me=p.c,opp=me===W?B:W,r=rank(i),f=file(i),d=fw(me),o=[];
    const home=me===W?6:1;
    for(const df of[-1,1]){
      if(ok(r+d,f+df)&&!s.b[at(r+d,f+df)]){
        o.push({from:i,to:at(r+d,f+df)});
        if(r===home&&ok(r+2*d,f+2*df)&&!s.b[at(r+2*d,f+2*df)])o.push({from:i,to:at(r+2*d,f+2*df)});}}
    if(ok(r+d,f)){const t=at(r+d,f),q=s.b[t];if(q&&q.c===opp)o.push({from:i,to:t});}
    return o;}});

/* 兔子：跳到旁前方2格的空格，对旁前方1格吃子。
   到底线或次底线强制升变为因幡帝——次底线那一条是几何上的必需品：
   两个坐标每步都变 2，所以行的奇偶不变，部署在轻子位（底行）的兔子
   永远摸不到对方底线，没有这条就会死在次底线。*/
def('rabbit',{n:'\u5154\u5B50',g:'⋀',v:1,slots:['n','p'],dev:1,pawnish:1,
  atk:(s,i)=>pawnAtk(s,i,[-1,1]),
  gen:(s,i)=>{const p=s.b[i],me=p.c,opp=me===W?B:W,r=rank(i),f=file(i),d=fw(me),o=[];
    const last=me===W?0:7,pen=me===W?1:6;
    const push=(nr,t)=>o.push((nr===last||nr===pen)?{from:i,to:t,promo:'tewi'}:{from:i,to:t});
    for(const df of[-2,2]){const nr=r+2*d,nf=f+df;if(!ok(nr,nf))continue;
      const t=at(nr,nf);if(s.b[t])continue;push(nr,t);}
    for(const df of[-1,1]){const nr=r+d,nf=f+df;if(!ok(nr,nf))continue;
      const t=at(nr,nf),q=s.b[t];
      if(q&&q.c===opp){push(nr,t);continue;}
      /* 吃过路兵：兔子的攻击范围就是兵的攻击范围，同一条理由适用 */
      if(!q&&t===s.ep)o.push({from:i,to:t,epc:1});}
    return o;}});
/* 因幡帝：ferz∥alfil。两个部件都保色，所以锁色；
   alfil 单独用时连通分量只有 8 格，ferz 把它接成完整的 32 格。*/
export const TEWI=DIAG.concat(ALFIL);
def('tewi',{n:'\u56E0\u5E61\u5E1D',g:'❖',v:2.5,slots:[],
  atk:(s,i)=>leapAtk(s,i,TEWI),gen:(s,i)=>leapGen(s,i,TEWI)});
// 人偶＝将棋的步：移动与吃子都只有正前一格，到底线强制升变为上海
def('doll',{n:'\u4EBA\u5076',g:'☗',v:.5,slots:[],pawnish:1,
  atk:(s,i)=>pawnAtk(s,i,[0]),
  gen:(s,i)=>{const me=s.b[i].c,opp=me===W?B:W,r=rank(i),f=file(i),d=fw(me),o=[];
    const last=me===W?0:7;
    if(!ok(r+d,f))return o;
    const t=at(r+d,f),q=s.b[t];
    if(!q||q.c===opp){
      if(r+d===last)o.push({from:i,to:t,promo:'shanghai'});
      else o.push({from:i,to:t});}
    return o;}});
// 上海人偶：站在对方底线，沿本列朝自己这一侧滑行，不可回头（反向的香）
def('shanghai',{n:'\u4E0A\u6D77\u4EBA\u5076',g:'☖',v:1.5,slots:[],
  atk:(s,i)=>slideAtk(s,i,[[-fw(s.b[i].c),0]]),
  gen:(s,i)=>slideGen(s,i,[[-fw(s.b[i].c),0]])});
// 打入人偶：只落空格、不落底线（落下即无走法）、二歩禁手
export function dollDropOK(s,to,me){
  if(s.b[to])return false;
  if(rank(to)===(me===W?0:7))return false;
  for(let r=0;r<8;r++){const q=s.b[at(r,file(to))];
    if(q&&q.c===me&&q.t==='doll')return false;}
  return true;}

def('fairy',{n:'\u5996\u7CBE',g:'\u22C8',v:1.5,slots:['n','p'],dev:1,atk:(s,i)=>leapAtk(s,i,DIAG),gen:(s,i)=>leapGen(s,i,DIAG)});
// 大妖精＝将棋的银将（正前＋四个斜向，吃走相同，不升变）
def('daiyousei',{n:'\u5927\u5996\u7CBE',g:'\u29D3',v:2,slots:['n','p'],dev:1,
  atk:(s,i)=>leapAtk(s,i,SILVER(s.b[i].c)),
  gen:(s,i)=>leapGen(s,i,SILVER(s.b[i].c))});

def('sunny',{n:'桑尼米尔克',g:'☼',v:1.5,slots:['n','p'],dev:1,lightbringer:1,max:1,
  atk:(s,i)=>leapAtk(s,i,DIAG),gen:(s,i)=>leapGen(s,i,DIAG)});
def('cirno',{n:'琪露诺',g:'⑨',v:3,slots:['p'],freezer:1,limit:'sqcolor',
  atk:(s,i)=>leapAtk(s,i,DIAG),gen:(s,i)=>leapGen(s,i,DIAG)});

def('reimu',{n:'\u7075\u68A6',g:'⛩︎',v:7,slots:['k','q','r','n'],
  atk:(s,i)=>leapAtk(s,i,REIMU_ATK),
  gen:(s,i)=>{const me=s.b[i].c,opp=me===W?B:W,r=rank(i),f=file(i),o=[];
    for(const[dr,df]of ORTHO){let nr=r+dr,nf=f+df;      // 穿透式的车：只落空格，不吃子
      while(ok(nr,nf)){const t=at(nr,nf);if(!s.b[t])o.push({from:i,to:t});nr+=dr;nf+=df;}}
    for(const[dr,df]of REIMU_ATK){if(!ok(r+dr,f+df))continue;
      const t=at(r+dr,f+df),q=s.b[t];if(q&&q.c===opp)o.push({from:i,to:t});}
    return o;}});
export const SANAE=c=>[[fw(c),0],[0,-1],[0,1],[-fw(c),-1],[-fw(c),1]];
def('sanae',{n:'\u65E9\u82D7',g:'★',v:6,slots:['k','q','r'],slider:1,
  atk:(s,i)=>slideAtk(s,i,SANAE(s.b[i].c)),gen:(s,i)=>slideGen(s,i,SANAE(s.b[i].c))});

def('lumia',{n:'\u9732\u7C73\u5A05',g:'\u271D\uFE0E',v:4,slots:['k','q','r','n','p'],dev:1,fogger:1,max:1,
  atk:(s,i)=>leapAtk(s,i,ALL8),gen:(s,i)=>leapGen(s,i,ALL8)});
// 永江衣玖＝将棋飞车（车），落在对方底线可选择升变为龙王（车＋ferz）
def('iku',{n:'\u6C38\u6C5F\u8863\u7396',g:'\u21AF',v:5.5,slots:['r'],slider:1,
  atk:(s,i)=>slideAtk(s,i,ORTHO),
  gen:(s,i)=>{const last=s.b[i].c===W?0:7,o=[];
    for(const m of slideGen(s,i,ORTHO)){o.push(m);
      if(rank(m.to)===last)o.push({from:i,to:m.to,promo:'ryuu'});}
    return o;}});
def('ryuu',{n:'\u9F99\u738B',g:'\u7ADC',v:6,slots:[],slider:1,
  atk:(s,i)=>slideAtk(s,i,ORTHO).concat(leapAtk(s,i,DIAG)),
  gen:(s,i)=>slideGen(s,i,ORTHO).concat(leapGen(s,i,DIAG))});

def('koishi',{n:'\u53E4\u660E\u5730\u604B',g:'☏',v:1,slots:['n','p'],
  atk:(s,i)=>{const c=s.b[i].c,r=rank(i),f=file(i),o=[],d=-fw(c);
    for(const df of[-1,0,1])if(ok(r+d,f+df))o.push(at(r+d,f+df));  // 后方、左后、右后各1格
    return o;},
  gen:(s,i)=>{const me=s.b[i].c,opp=me===W?B:W,o=[],d=-fw(me),r=rank(i),f=file(i);
    const seen=new Set([i]),qq=[i];
    while(qq.length){const cur=qq.shift();
      for(const[dr,df]of ORTHO){const nr=rank(cur)+dr*2,nf=file(cur)+df*2;
        if(!ok(nr,nf))continue;const t=at(nr,nf);
        if(s.b[t]||seen.has(t))continue;seen.add(t);qq.push(t);o.push({from:i,to:t});}}
    for(const df of[-1,0,1]){if(!ok(r+d,f+df))continue;
      const t=at(r+d,f+df),q=s.b[t];if(q&&q.c===opp)o.push({from:i,to:t});}
    return o;}});

// 爱丽丝＝将棋的金（吃走相同），并可在移动范围的空格花0.5费打入人偶
def('alice',{n:'\u7231\u4E3D\u4E1D',g:'\u7CF8',v:2.5,slots:['n','p'],dropper:1,
  atk:(s,i)=>leapAtk(s,i,GOLD(s.b[i].c)),
  gen:(s,i)=>{const me=s.b[i].c,r=rank(i),f=file(i),o=leapGen(s,i,GOLD(me));
    if(s.ammo[me]>=.5)
      for(const[dr,df]of GOLD(me)){if(!ok(r+dr,f+df))continue;
        const t=at(r+dr,f+df);
        if(dollDropOK(s,t,me))o.push({from:i,to:t,drop:'doll',cost:.5});}
    return o;}});

export const rimDirs=i=>{const r=rank(i),f=file(i),d=[];
  if(r===0||r===7)d.push([0,-1],[0,1]);
  if(f===0||f===7)d.push([-1,0],[1,0]);
  return d;};
export const LEAP7=[[7,0],[-7,0],[0,7],[0,-7]];
def('yukari',{n:'\u516B\u4E91\u7D2B',g:'\u9593',v:7,slots:['q','r'],royal:1,files:[3,7],
  atk:(s,i)=>slideAtk(s,i,rimDirs(i)).concat(leapAtk(s,i,LEAP7)),
  gen:(s,i)=>{const o=slideGen(s,i,rimDirs(i)).concat(leapGen(s,i,LEAP7));
    const seen=new Set(),u=[];   // 角格的滑行与7格跳会指向同一格，去重
    for(const m of o){if(seen.has(m.to))continue;seen.add(m.to);u.push(m);}
    return u;}});
