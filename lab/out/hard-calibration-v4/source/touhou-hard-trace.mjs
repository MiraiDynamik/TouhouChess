import fs from 'node:fs';
import * as E from '/Users/xkong/PycharmProjects/TouhouChess/engine/index.ts';
E.loadWeights(JSON.parse(fs.readFileSync('engine/weights.json')));
const root='lab/out/hard-calibration-v4',rows=[];
for(const batch of ['batch1','batch2']){
 const dir=`${root}/${batch}/hard`;
 for(const file of fs.readdirSync(dir).filter(x=>/^game-.*\.json$/.test(x))){
  const g=JSON.parse(fs.readFileSync(`${dir}/${file}`)),pair=Number(file.split('-')[2]);
  const w=new Map(),b=new Map();
  for(let f=0;f<8;f++){w.set(56+f,'rnbqkbnr'[f]);w.set(48+f,'p');b.set(f,'rnbqkbnr'[f]);b.set(8+f,'p');}
  let s=E.buildState(w,b);
  for(const record of g.records){
   if(record.side===g.dev_side){
    let seed=(pair*100000+record.ply-1)>>>0;
    seed=Math.imul(seed^(seed>>>16),0x7feb352d);seed=Math.imul(seed^(seed>>>15),0x846ca68b);seed=(seed^(seed>>>16))>>>0;
    Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    rows.push({batch,game:file.slice(0,-5),...record,strategy:E.drawMoveStrategy(E.LEVELS.hard.selection),pieces:s.b.filter(Boolean).length});
   }
   const move=E.legalMoves(s).find(m=>E.nm(m.from)+E.nm(m.to)+(m.promo||'')===record.move);
   if(!move)throw Error(`Replay failed ${file} ${record.ply}`);
   s=E.vanishPass(E.applyMove(s,move));
  }
 }
}
fs.writeFileSync(`${root}/selection-trace.json`,JSON.stringify({note:'Strategy reconstructed from recorded pair/ply seed and unchanged engine configuration.',rows},null,2));
console.log(JSON.stringify({moves:rows.length,counts:Object.fromEntries(['random','lossBand','suboptimal','best'].map(k=>[k,rows.filter(r=>r.strategy===k).length]))}));
