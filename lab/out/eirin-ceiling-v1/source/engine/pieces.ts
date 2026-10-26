/* 把三样东西合成最终的棋子表：
     geometry.ts      走法与攻击几何（代码，没法声明式表达）
     costs.generated  规则书的 cost 和部署位（由 rules/pieces.toml 生成）
     weights.json     引擎估价 value 和各项系数（可调，lab/tune.py 搜索它）

   并且交叉校验键集合：几何有而规则没有、或规则有而几何没有，都直接抛错。
   单文件版里这两者写在同一个 def() 里，所以不可能发现不一致；
   拆开之后这个校验才有意义 —— 代价是必须显式对账，收益是对不上就报错。

   注意：原来那个 P[x].v 字段被**删掉**了。它同时表示「部署花费」和
   「引擎估价」，这个二义性是昨晚那条返工链的第一环。现在是两个字段：
     cost   规则，玩家可见，等于规则书
     value  引擎估价，默认等于 cost，标定时独立变动
   如果哪里还在用 .v，结果会是 undefined → NaN，金标准立刻抓到。 */
import {P} from './board.js';
import './geometry.js';                 // 副作用：把 25 个棋子注册进 P
import {RULES} from './costs.generated.js';

export type Weights = {
  value: Record<string, number>;
  mobility: number;
  kingSafety: number;
  endgame: {edge:number; near:number; corner:number};
  open: {center:number; homeBlock:number; develop:number;
         heavyEarly:number; castled:number};
  openMinMaterial: number;
};

function crossCheck(){
  const geo=Object.keys(P).sort(), rule=Object.keys(RULES).sort();
  const onlyGeo=geo.filter(k=>!(k in RULES));
  const onlyRule=rule.filter(k=>!(k in P));
  if(onlyGeo.length||onlyRule.length){
    const msg=[];
    if(onlyGeo.length)msg.push(`几何里有但规则书没有：${onlyGeo.join(', ')}`);
    if(onlyRule.length)msg.push(`规则书有但几何没写：${onlyRule.join(', ')}`);
    throw new Error('棋子表对不上 —— '+msg.join('；'));}
}

/* 把 cost / 部署位 / 数量限制从规则表盖到 P 上 */
function applyRules(){
  for(const k in RULES){
    const r=RULES[k], p=P[k];
    p.name=r.name; p.cost=r.cost; p.slots=r.slots;
    if(r.max!==undefined)p.max=r.max; else delete p.max;
    if(r.limit!==undefined)p.limit=r.limit; else delete p.limit;
    if(r.files!==undefined)p.files=r.files; else delete p.files;
    delete p.v;                         // 二义字段，故意删掉
  }
}

export let WEIGHTS: Weights;

/* 注入权重。value 缺省等于 cost。lab/tune.py 每轮换一组权重就调这个。 */
export function applyWeights(w: Weights){
  WEIGHTS=w;
  for(const k in RULES){
    const over=w.value && w.value[k];
    P[k].value = (over===undefined||over===null) ? P[k].cost : over;
  }
}

crossCheck();
applyRules();
export {P, RULES};
