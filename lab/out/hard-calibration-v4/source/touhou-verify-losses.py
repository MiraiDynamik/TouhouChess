import sys,json
from pathlib import Path
sys.path.insert(0,str(Path.cwd()/'lab'))
from stockfish_match import Process,save
from stockfish_review import evaluate
root=Path('lab/out/hard-calibration-v4'); rows=[]
previous=json.loads((root/'verified-losses.json').read_text())['rows'] if (root/'verified-losses.json').exists() else []
sf=Process(['/opt/homebrew/bin/stockfish'])
try:
 sf.send('uci');sf.until('uciok')
 for x in ['setoption name Threads value 1','setoption name Hash value 64','setoption name UCI_LimitStrength value false']:sf.send(x)
 for review in sorted(root.glob('batch*/review.json')):
  for r in json.loads(review.read_text())['rows']:
   if not r['competitive'] or not ((r['cp_loss'] or 0)>=200 or r['newly_allows_mate']):continue
   existing=next((x for x in previous if x['batch']==review.parent.name and x['game']==r['game'] and x['ply']==r['ply']),None)
   if existing:
    rows.append(existing);continue
   g=json.loads((review.parent/'hard'/f'{r["game"]}.json').read_text())
   sf.send('ucinewgame');sf.send('isready');sf.until('readyok')
   before=evaluate(sf,g['moves'][:r['ply']-1],1000000)
   after=evaluate(sf,g['moves'][:r['ply']],1000000)
   loss=max(0,before['value']+after['value']) if before['kind']==after['kind']=='cp' else None
   rows.append(dict(batch=review.parent.name,game=r['game'],ply=r['ply'],move=r['move'],initial_cp_loss=r['cp_loss'],before=before,after=after,cp_loss=loss))
   print(rows[-1],flush=True)
finally:sf.close()
save(root/'verified-losses.json',dict(nodes=1000000,rows=rows))
