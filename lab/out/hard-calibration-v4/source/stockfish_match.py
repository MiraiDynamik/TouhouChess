"""Resumable vanilla developer(+futility/LMR) vs UCI-limited Stockfish. Stdlib only."""
import argparse
import csv
import hashlib
import json
import os
from pathlib import Path
import queue
import re
import subprocess
import sys
import threading
import time

ROOT = Path(__file__).resolve().parent.parent

class Process:
    def __init__(self, command):
        self.p = subprocess.Popen(command, cwd=ROOT, stdin=subprocess.PIPE,
                                  stdout=subprocess.PIPE, stderr=None, text=True, bufsize=1)
        self.lines = queue.Queue()
        def reader():
            for line in self.p.stdout:
                self.lines.put(line.rstrip())
            self.lines.put(None)
        self.reader = threading.Thread(target=reader, daemon=True)
        self.reader.start()
    def send(self, text):
        self.p.stdin.write(text + '\n')
        self.p.stdin.flush()
    def until(self, prefix, timeout=30):
        end = time.monotonic() + timeout
        lines = []
        while True:
            line = self.lines.get(timeout=max(.01, end-time.monotonic()))
            if line is None:
                raise RuntimeError('Engine exited')
            lines.append(line)
            if line.startswith(prefix):
                return lines
    def rpc(self, **request):
        self.send(json.dumps(request))
        answer = json.loads(self.until('{', max(30,(request.get('timeMs') or 0)/1000+15))[-1])
        if 'error' in answer:
            raise RuntimeError(answer['error'])
        return answer
    def close(self):
        if self.p.poll() is None:
            self.p.terminate()
            try:
                self.p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.p.kill()
                self.p.wait()
        self.reader.join(timeout=5)
        self.p.stdin.close()
        self.p.stdout.close()

def save(path, data):
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf8')
    tmp.replace(path)

def report(out, config):
    rows = []
    for path in sorted(out.glob('game-*.json')):
        d = json.loads(path.read_text())
        r = d.get('result') or {}
        depths = [m['depth'] for m in d['records'] if m['side'] == d['dev_side']]
        rows.append(dict(id=path.stem, elo=d['elo'], dev_side=d['dev_side'],
                         result=r.get('code','running'), score=r.get('score'),
                         plies=len(d['moves']), mean_dev_depth=round(sum(depths)/len(depths),2) if depths else ''))
    tmp = out/'games.csv.tmp'
    with tmp.open('w', encoding='utf-8-sig', newline='') as f:
        writer=csv.DictWriter(f,fieldnames=['id','elo','dev_side','result','score','plies','mean_dev_depth'])
        writer.writeheader(); writer.writerows(rows)
    tmp.replace(out/'games.csv')
    text=[f"# {config.get('level','lunatic')} vs Stockfish", '',
          f"Stockfish：{config['stockfish_name']}；Stockfish 每手 {config['time_ms']/1000:g} 秒；双方单线程，本进程内顺序对局。",
          ('本方使用游戏内各档原生思考预算。' if config.get('native_time') else '本方使用相同固定时间预算。')+
          '开启置换表及 futility + LMR。标准香草起始阵容，每组交换颜色。', '',
          '| Stockfish 限强档位 | 胜 | 和 | 负 | 未决/进行中 | 得分率 |',
          '|---|---:|---:|---:|---:|---:|']
    for elo in config['elos']:
        group=[r for r in rows if r['elo']==elo]
        scores=[r['score'] for r in group if r['score'] is not None]
        rate=f'{sum(scores)/len(scores):.1%}' if scores else '—'
        text.append(f"| {elo} | {scores.count(1)} | {scores.count(.5)} | {scores.count(0)} | {len(group)-len(scores)} | {rate} |")
    text += ['', '得分率 =（胜 + 0.5 × 和）/ 已判定局数。达到步数上限记为未决，不算和棋。',
             '采用本项目终局判定：将杀、逼和、三次重复、50 回合；不额外按子力裁定。',
             '小样本仅用于寻找接近五五开的档位；重复同一起始局面不能代替多样化开局。',
             'Stockfish UCI_Elo 是限强参数，不是本引擎的平台等级分；每手固定 3 秒也不同于其标定时限。',
             'Stockfish 限强随机性不保证可重现；续跑会清空其置换表，可能改变后续走法。', '']
    tmp=out/'report.md.tmp'; tmp.write_text('\n'.join(text),encoding='utf8'); tmp.replace(out/'report.md')

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--stockfish',default='/opt/homebrew/bin/stockfish')
    ap.add_argument('--elos',type=int,nargs='+',default=[1320,1500])
    ap.add_argument('--pairs',type=int,default=2)
    ap.add_argument('--start-pair',type=int,default=1,help='First pair ID/seed, for independent batches')
    ap.add_argument('--time-ms',type=int,default=3000)
    ap.add_argument('--level',choices=['easy','normal','hard','lunatic'],default='lunatic')
    ap.add_argument('--native-time',action='store_true',help='Use game difficulty time budget for our engine')
    ap.add_argument('--max-ply',type=int,default=300)
    ap.add_argument('--out',type=Path,default=ROOT/'lab/out/stockfish-dev-3s')
    args=ap.parse_args()
    if Path(sys.prefix).name.lower()!='touhouchess':
        ap.error('Use conda run -n TouhouChess python ...')
    if min(args.pairs,args.start_pair,args.time_ms,args.max_ply)<1:
        ap.error('Limits must be positive')
    args.out.mkdir(parents=True,exist_ok=True)
    lock=args.out/'.running.lock'
    fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
    os.write(fd,str(os.getpid()).encode()); os.close(fd)
    sf=bridge=None; config=None
    try:
        sf=Process([args.stockfish]); sf.send('uci'); options=sf.until('uciok')
        line=next(l for l in options if l.startswith('option name UCI_Elo '))
        lo,hi=map(int,re.search(r'min (\d+) max (\d+)',line).groups())
        if any(e<lo or e>hi for e in args.elos):
            raise ValueError(f'UCI_Elo must be {lo}..{hi}')
        paths=sorted((ROOT/'engine').glob('*'))+[ROOT/'cli/stockfish-bridge.mjs',Path(__file__),ROOT/'package-lock.json']
        digest=hashlib.sha256()
        for p in paths:
            if p.is_file():
                digest.update(str(p.relative_to(ROOT)).encode()); digest.update(p.read_bytes().replace(b'\r\n',b'\n'))
        config=dict(elos=args.elos,pairs=args.pairs,time_ms=args.time_ms,max_ply=args.max_ply,
                    level=args.level,native_time=args.native_time,protocol=2,
                    source=digest.hexdigest(),stockfish_name=next(l[8:] for l in options if l.startswith('id name ')),
                    stockfish_sha256=hashlib.sha256(Path(args.stockfish).read_bytes()).hexdigest())
        if args.start_pair!=1: config['start_pair']=args.start_pair
        manifest=args.out/'manifest.json'
        if manifest.exists() and json.loads(manifest.read_text())!=config:
            raise ValueError('Configuration/source changed: use a new output directory')
        save(manifest,config)
        for command in ['setoption name Threads value 1','setoption name Hash value 64',
                        'setoption name UCI_LimitStrength value true']:
            sf.send(command)
        bridge=Process(['node','--import','tsx','cli/stockfish-bridge.mjs'])
        for elo in args.elos:
            for pair in range(args.start_pair,args.start_pair+args.pairs):
                for side in ['w','b']:
                    path=args.out/f'game-{elo}-{pair:03d}-{side}.json'
                    d=json.loads(path.read_text()) if path.exists() else dict(elo=elo,dev_side=side,moves=[],records=[],result=None)
                    if d['result']:
                        continue
                    sf.send(f'setoption name UCI_Elo value {elo}')
                    sf.send('ucinewgame'); sf.send('isready'); sf.until('readyok')
                    bridge.rpc(reset=True)
                    print(f'{path.stem}: start/resume ply={len(d["moves"])}',flush=True)
                    while not d['result']:
                        state=bridge.rpc(moves=d['moves'])
                        outcome=state['outcome']
                        if outcome['over']:
                            winner=outcome['winner']
                            d['result']=dict(code=outcome['code'],winner=winner,score=.5 if winner is None else int(winner==side))
                        elif len(d['moves'])>=args.max_ply:
                            d['result']=dict(code='unresolved',winner=None,score=None)
                        if d['result']:
                            save(path,d); report(args.out,config)
                            print(f'{path.stem}: {d["result"]}',flush=True); break
                        turn=state['turn']; start=time.monotonic()
                        if turn==side:
                            found=bridge.rpc(moves=d['moves'],search=True,level=args.level,
                                             timeMs=None if args.native_time else args.time_ms,
                                             seed=pair*100000+len(d['moves']))
                            move=found['move']; depth=found['depth']
                        else:
                            sf.send('position startpos'+(' moves '+' '.join(d['moves']) if d['moves'] else ''))
                            sf.send(f'go movetime {args.time_ms}')
                            lines=sf.until('bestmove ',args.time_ms/1000+30)
                            move=lines[-1].split()[1]
                            depths=[int(m.group(1)) for l in lines if (m:=re.search(r'\bdepth (\d+)',l))]
                            depth=depths[-1] if depths else 0
                        if move not in state['legal']:
                            raise RuntimeError(f'Illegal move {move}: {path.stem}, ply {len(d["moves"])}')
                        d['moves'].append(move)
                        d['records'].append(dict(ply=len(d['moves']),side=turn,move=move,depth=depth,ms=round((time.monotonic()-start)*1000)))
                        save(path,d)
                        if len(d['moves'])%20==0:
                            report(args.out,config)
                            print(f'{path.stem}: ply={len(d["moves"])} depth={depth}',flush=True)
    finally:
        if bridge: bridge.close()
        if sf: sf.close()
        try:
            if config and (args.out/'manifest.json').exists() and json.loads((args.out/'manifest.json').read_text())==config:
                report(args.out,config)
        finally:
            lock.unlink(missing_ok=True)

if __name__=='__main__':
    try: main()
    except KeyboardInterrupt:
        print('Stopped. Run the same command to resume.',flush=True)
