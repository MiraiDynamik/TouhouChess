"""Review recorded standard-chess games with unrestricted Stockfish; never infer human Elo."""
import argparse
import csv
import json
from pathlib import Path
import re
import statistics
import sys
from stockfish_match import Process, save

def evaluate(sf,moves,nodes):
    sf.send('position startpos'+(' moves '+' '.join(moves) if moves else ''))
    sf.send(f'go nodes {nodes}')
    lines=sf.until('bestmove ',60)
    scores=[]
    for line in lines:
        match=re.search(r'\bscore (cp|mate) (-?\d+)',line)
        if match and 'lowerbound' not in line and 'upperbound' not in line:
            depth=re.search(r'\bdepth (\d+)',line)
            scores.append(dict(kind=match[1],value=int(match[2]),depth=int(depth[1]) if depth else 0))
    if not scores:
        raise RuntimeError('No exact root score: '+repr(lines[-3:]))
    return scores[-1]

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('root',type=Path)
    p.add_argument('--nodes',type=int,default=50000)
    p.add_argument('--max-ply',type=int,default=80)
    p.add_argument('--stockfish',default='/opt/homebrew/bin/stockfish')
    a=p.parse_args()
    if Path(sys.prefix).name.lower()!='touhouchess':p.error('Use the TouhouChess conda environment')
    sf=Process([a.stockfish]); rows=[]
    try:
        sf.send('uci'); options=sf.until('uciok')
        name=next(l[8:] for l in options if l.startswith('id name '))
        for text in ['setoption name Threads value 1','setoption name Hash value 64',
                     'setoption name UCI_LimitStrength value false','setoption name Skill Level value 20']:
            sf.send(text)
        for game in sorted(a.root.glob('*/game-*.json')):
            d=json.loads(game.read_text())
            if not d.get('result'):continue
            level=game.parent.name;sf.send('ucinewgame');sf.send('isready');sf.until('readyok')
            cache={}
            for record in d['records']:
                ply=record['ply']
                if ply>a.max_ply or record['side']!=d['dev_side']:continue
                for n in [ply-1,ply]:
                    if n not in cache:cache[n]=evaluate(sf,d['moves'][:n],a.nodes)
                before,after=cache[ply-1],cache[ply]
                # Before is our side-to-move; after is the opponent's side-to-move.
                loss=max(0,before['value']+after['value']) if before['kind']==after['kind']=='cp' else None
                competitive=before['kind']=='cp' and abs(before['value'])<=400
                rows.append(dict(level=level,game=game.stem,ply=ply,move=record['move'],
                                 before=before,after=after,cp_loss=loss,competitive=competitive,
                                 newly_allows_mate=before['kind']=='cp' and after['kind']=='mate' and after['value']>0))
            print(f'Reviewed {level}/{game.stem}',flush=True)
    finally:sf.close()
    save(a.root/'review.json',dict(stockfish=name,nodes=a.nodes,max_ply=a.max_ply,rows=rows))
    with (a.root/'review.csv').open('w',encoding='utf-8-sig',newline='') as f:
        fields=['level','game','ply','move','cp_loss','competitive','newly_allows_mate']
        writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader()
        writer.writerows({k:r[k] for k in fields} for r in rows)
    text=['# 四档难度：Stockfish 参照与走法复查','',
          '目标参照为 Chess.com 10 分钟快棋；以下不输出或推算平台 Elo。',
          f'复查使用未限强 {name}，每局面 {a.nodes} 节点，最多检查前 {a.max_ply} 半回合。',
          '仅在落子前绝对评分不超过 400 cp 的局面统计有限评分损失；强制将杀评分单独列出。',
          'cp 为 Stockfish 的归一化评估单位，200 cp 损失不等同于一定丢掉两枚兵。有限节点分析存在噪声。','',
          '| 难度 | 对 1320 胜/和/负 | 未决 | 可比较走法 | 平均 cp 损失 | ≥200 cp 次数 | 新出现被将杀 |',
          '|---|---|---:|---:|---:|---:|---:|']
    for level in ['easy','normal','hard','lunatic']:
        games=[json.loads(g.read_text()) for g in (a.root/level).glob('game-*.json')]
        results=[g['result'] for g in games if g.get('result')]
        scores=[r['score'] for r in results if r['score'] is not None]
        subset=[r for r in rows if r['level']==level and r['competitive']]
        losses=[r['cp_loss'] for r in subset if r['cp_loss'] is not None]
        mean=f'{statistics.mean(losses):.1f}' if losses else '—'
        text.append(f"| {level} | {scores.count(1)}/{scores.count(.5)}/{scores.count(0)} | {sum(r['score'] is None for r in results)} | {len(losses)} | {mean} | {sum(x>=200 for x in losses)} | {sum(r['newly_allows_mate'] for r in subset)} |")
    text+=['','每档两局只能用于初步诊断；对局样本、局面难度和先后手均会影响这些指标。',
           '不同等级不共享相同局面集合，平均损失不能直接排序棋力或转换成 Elo。',
           '所有对局使用标准香草阵容；东方特殊棋子下的难度需要另行试玩。','']
    (a.root/'review.md').write_text('\n'.join(text),encoding='utf8')

if __name__=='__main__':main()
