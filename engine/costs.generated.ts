// 本文件由 lab/gen_costs.py 从 rules/pieces.toml 生成，不要手改。
// 改规则：改 rules/rulebook.md → python lab/rulebook.py → python lab/gen_costs.py
//
// cost = 部署花费（规则，玩家可见）。引擎估价 value 见 engine/weights.json，
// 默认等于 cost，标定时独立变动 —— 把这两件事混成一个数曾经坑过我一整夜。

export type PieceRule = {
  name: string; cost: number; slots: string[];
  max?: number; limit?: string; files?: number[];
};

export const RULES: Record<string, PieceRule> = {
  keda: {name:'毛玉', cost:0.5, slots:['p']},
  onmyo: {name:'阴阳玉', cost:0.5, slots:['p']},
  ghost: {name:'幽灵', cost:0.5, slots:['p']},
  doll: {name:'人偶', cost:0.5, slots:[]},
  p: {name:'兵', cost:1, slots:['p']},
  rabbit: {name:'兔子', cost:1, slots:['n', 'p']},
  koishi: {name:'古明地恋', cost:1, slots:['n', 'p']},
  shanghai: {name:'上海人偶', cost:1.5, slots:[]},
  fairy: {name:'妖精', cost:1.5, slots:['n', 'p']},
  sunny: {name:'桑尼米尔克', cost:1.5, slots:['n', 'p']},
  daiyousei: {name:'大妖精', cost:2, slots:['n', 'p']},
  tewi: {name:'因幡帝', cost:2.5, slots:[]},
  alice: {name:'爱丽丝玛格特罗伊德', cost:2.5, slots:['n', 'p']},
  n: {name:'马', cost:3, slots:['n']},
  b: {name:'主教', cost:3, slots:['n']},
  cirno: {name:'琪露诺', cost:3, slots:['p'],limit:'sqcolor'},
  k: {name:'王', cost:4, slots:['k']},
  lumia: {name:'露米娅', cost:4, slots:['k', 'q', 'r', 'n', 'p'],max:1},
  r: {name:'车', cost:5, slots:['r']},
  iku: {name:'永江衣玖', cost:5.5, slots:['r']},
  sanae: {name:'早苗', cost:6, slots:['k', 'q', 'r']},
  ryuu: {name:'龙王', cost:6, slots:[]},
  yukari: {name:'八云紫', cost:7, slots:['q', 'r'],files:[3,7]},
  reimu: {name:'灵梦', cost:7.5, slots:['k', 'q', 'r', 'n']},
  q: {name:'后', cost:9, slots:['q']},
};

