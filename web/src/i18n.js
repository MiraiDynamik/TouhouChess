import {P} from './engine.js';
export const EN={k:'King',q:'Queen',r:'Rook',b:'Bishop',n:'Knight',p:'Pawn',
  keda:'Kedama',onmyo:'Yin-Yang Orb',ghost:'Ghost',
  doll:'Doll',shanghai:'Shanghai',rabbit:'Rabbit',tewi:'Tewi',
  fairy:'Fairy',daiyousei:'Daiyousei',sunny:'Sunny',cirno:'Cirno',
  reimu:'Reimu',sanae:'Sanae',
  lumia:'Rumia',koishi:'Koishi',iku:'Iku',ryuu:'Dragon King',
  alice:'Alice',yukari:'Yukari'};
export const TXT={
  easy:['琪露诺','Cirno'], normal:['河城荷取','Nitori'],
  hard:['犬走椛','Momiji'], lunatic:['八意永琳','Eirin'],
  title:['東方西洋棋','Touhou Fairy Chess'],
  hintDeploy:['部署阶段 · 每方45点 · 先点棋子再点棋盘落子，点已放的子可移除',
    'Deployment · 45 points each · pick a piece, then a square; click a placed piece to remove it'],
  hintPlay:['对局中 · 点选己方棋子再点目标格','Playing · click your piece, then the target square'],
  white:['白方','White'], black:['黑方','Black'],
  preset:['香草阵型','Vanilla setup'], clearSide:['清空本方','Clear side'],
  start:['开始对局','Start game'],
  undo:['悔棋','Undo'], flip:['翻转','Flip'], redeploy:['重新部署','Redeploy'],
  botOff:['电脑：关','CPU: off'], botB:['电脑执黑','CPU plays Black'],
  botW:['电脑执白','CPU plays White'], botWB:['电脑自对弈','CPU self-play'],
  thinking:['电脑思考中…','Thinking…'],
  noMoves:['还没有走子。','No moves yet.'],
  matUnknown:['子力不明','Material unknown'],
  undecided:['未定','none yet'],
  dropA:['打入','Drop '], promoTo:['升变为','Promote to '], moveA:['移动','Move '],
  notePlay:['蓝色斜纹＝被琪露诺冻结；黑格＝露米娅的黑暗（可盲点）；子力后的弹为剩余弹药。',
    'Blue hatching = frozen by Cirno; black squares = Rumia\u0027s darkness (you may click blind); the ammo figure after the material count is points left for drops.'],
  noteDeploy:['本方已用 %1 点，剩余 %2 点作为弹药。将军对象：%3 个（需要恰好1个）。',
    'Used %1 pts, %2 pts left as ammo. Royal pieces: %3 (need exactly 1).'],
  royalW:['　白方王：','　White royal: '], royalB:['　黑方王：','　Black royal: '],
  selected:['　当前选中：','　Selected: '],
  fileLimit:['（只能放 d 列或 h 列）',' (d- or h-file only)'],
  mates:['%1将杀','%1 mates'], stalemate:['逼和','Stalemate'],
  rep3:['三次重复和棋','Draw by threefold repetition'],
  fifty:['50回合和棋','Draw by 50-move rule'],
  toMove:['%1走棋','%1 to move'], chk:['（将军）',' (check)'],
  tierVanilla:['香草级','Vanilla'], tierKedama:['毛玉级','Kedama'],
  tierFairy:['妖精级','Fairy'], tierHuman:['人类级','Human'],
  tierYoukai:['妖怪级','Youkai'], tierMagician:['魔法使级','Magician'],
  tierSage:['贤者级','Sage'],
  langBtn:['English','中文'],
  evSageL:['引擎评估','Engine evaluation'],
  evHead:['分差为正 = 白优；独立线程持续加深，不设深度上限',
          'Positive = White ahead; a separate thread keeps deepening, no depth cap'],
  evDepth:['深度%1','d%1'], evProg:['第%1层 %2/%3','d%1 %2/%3'],
  evMainThread:['主线程','main thread'], evStop:['已停','stopped'], evBest:['优选 %1','best %1'],
  evThinking:['计算中…','thinking…'], evOver:['对局已结束','game over']};

export function translate(lang,key,...args){
 let value=TXT[key]?.[lang==='en'?1:0]??key;
 args.forEach((arg,i)=>{value=value.replace('%'+(i+1),arg);});
 return value;
}
export const pieceName=(lang,type)=>lang==='en'?(EN[type]||P[type].n):P[type].n;
