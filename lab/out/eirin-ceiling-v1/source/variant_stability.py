"""Compare bot and analysis recommendations, without claiming an independent oracle."""
import json
from pathlib import Path
import sys
from stockfish_match import Process, save
ROOT=Path(__file__).resolve().parent.parent

def main():
 if Path(sys.prefix).name.lower()!='touhouchess':raise SystemExit('Use the TouhouChess conda environment')
 out=ROOT/'lab/out/eirin-ceiling-v1/variant-stability.json'
 names=['灵梦透明穿透','琪露诺贴敌阵','爱丽丝可打入','恋洪水填充']
 fixtures=json.loads((ROOT/'tests/golden.json').read_text())['cases'];rows=[]
 process=Process(['node','--import','tsx','cli/variant-stability.mjs'])
 try:
  for name in names:
   fixture=next(x for x in fixtures if x['name']==name)
   for mode,time_ms in [('bot',3000),('bot',15000),('analysis',15000)]:
    r=process.rpc(name=name,**{'def':fixture['def']},mode=mode,timeMs=time_ms,seed=123)
    rows.append(r);save(out,dict(note='Same-engine stability, not independent correctness or piece-value validation.',rows=rows))
    print(name,mode,time_ms,r['depth'],r['score'],r['notation'],flush=True)
 finally:process.close()

if __name__=='__main__':main()
