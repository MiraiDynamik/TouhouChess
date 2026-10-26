"""Checkpointed, full-game Stockfish review with PVs and deeper verification of misses."""
import argparse
import csv
import statistics
import hashlib
import json
from pathlib import Path
import re
import sys
from stockfish_match import Process, save


def evaluate(sf, moves, nodes):
    sf.send('position startpos' + (' moves ' + ' '.join(moves) if moves else ''))
    sf.send(f'go nodes {nodes}')
    lines = sf.until('bestmove ', 60)
    scores = []
    for line in lines:
        score = re.search(r'\bscore (cp|mate) (-?\d+)', line)
        if score and 'lowerbound' not in line and 'upperbound' not in line:
            depth = re.search(r'\bdepth (\d+)', line)
            pv = re.search(r'\bpv (.*)', line)
            scores.append(dict(kind=score[1], value=int(score[2]),
                               depth=int(depth[1]) if depth else 0,
                               pv=pv[1].split() if pv else []))
    if not scores:
        raise RuntimeError('No exact score: ' + repr(lines[-3:]))
    return {**scores[-1], 'bestmove': lines[-1].split()[1]}


def classify(before, after):
    finite = before['kind'] == after['kind'] == 'cp'
    return dict(
        cp_loss=max(0, before['value'] + after['value']) if finite else None,
        competitive=before['kind'] == 'cp' and abs(before['value']) <= 400,
        missed_mate=(before['kind'] == 'mate' and before['value'] > 0
                     and not (after['kind'] == 'mate' and after['value'] <= 0)),
        allows_mate=(after['kind'] == 'mate' and after['value'] > 0
                     and not (before['kind'] == 'mate' and before['value'] < 0)))


def write_report(root, config, rows):
    effective = [{**r, **r.get('verified', {})} for r in rows]
    games = [json.loads(p.read_text()) for p in sorted(root.glob('*/game-*.json'))]
    text = ['# 永琳对 Stockfish：对局与漏着复查', '',
            '本轮不修改引擎。永琳与限强 Stockfish 均每手 3 秒、单线程，香草标准阵容，成对换色。',
            'UCI_Elo 是对手的限强参数，不是永琳的 Chess.com 或 FIDE 等级分。', '',
            '| SF 档位 | 胜 | 和 | 负 | 未决/进行中 | 得分率 |',
            '|---|---:|---:|---:|---:|---:|']
    for elo in sorted({g['elo'] for g in games}):
        group = [g for g in games if g['elo'] == elo]
        scores = [g['result']['score'] for g in group if g.get('result') and g['result']['score'] is not None]
        rate = f'{sum(scores)/len(scores):.1%}' if scores else '—'
        text.append(f"| {elo} | {scores.count(1)} | {scores.count(.5)} | {scores.count(0)} | {len(group)-len(scores)} | {rate} |")
    text += ['', '## 漏着指标', '',
             f"未限强 {config['stockfish']} 每局面 {config['nodes']} 节点初查；损失≥100 cp或涉及强制将杀的候选提高到 {config['verify_nodes']} 节点复查。",
             '评分损失采用落子前后双方行棋视角转换。cp 为 SF 归一化单位，不等于实际损失子力。',
             '下表只统计落子前绝对评分≤400 cp、前后均为有限评分的局面；已明确胜负的局面不混入平均值。', '',
             '| 档位 | 检查落子数 | 可比较落子数 | 平均损失 cp | ≥100 cp | ≥200 cp |',
             '|---|---:|---:|---:|---:|---:|']
    for elo in sorted({r['elo'] for r in effective}):
        group = [r for r in effective if r['elo'] == elo]
        losses = [r['cp_loss'] for r in group if r['competitive'] and r['cp_loss'] is not None]
        mean = f'{statistics.mean(losses):.1f}' if losses else '—'
        text.append(f"| {elo} | {len(group)} | {len(losses)} | {mean} | {sum(x>=100 for x in losses)} | {sum(x>=200 for x in losses)} |")
    text += ['', f"所有已审查落子中，搜索所见的强制将杀丢失 {sum(r['missed_mate'] for r in effective)} 次，新出现对方强制将杀 {sum(r['allows_mate'] for r in effective)} 次。",
             '这些是有限节点搜索发现的事件，不是棋理证明；同一盘可以连续出现多个事件。', '',
             '## 关键候选', '',
             '| 对局 | ply | 实际走法 | SF 推荐 | 损失 cp | 丢失己方强制杀 | 出现对方强制杀 |',
             '|---|---:|---|---|---:|---|---|']
    critical = [r for r in effective if (r['competitive'] and (r['cp_loss'] or 0)>=200) or r['missed_mate'] or r['allows_mate']]
    for r in critical:
        text.append(f"| {r['game']} | {r['ply']} | {r['move']} | {r['before']['bestmove']} | {r['cp_loss'] if r['cp_loss'] is not None else '—'} | {r['missed_mate']} | {r['allows_mate']} |")
    text += ['', '完整主变化与复查前后评分见 audit.json；逐局 audit-game-*.json 可断点续查。',
             '每档样本很少、起始局面单一，不能确定统计意义上的 Elo 上限。特殊棋子的评估与玩法不在 Stockfish 标准棋测试覆盖范围内。', '']
    (root/'audit.md').write_text('\n'.join(text), encoding='utf8')
    with (root/'audit.csv').open('w', encoding='utf-8-sig', newline='') as f:
        fields = ['elo','game','ply','move','depth','ms','cp_loss','competitive','missed_mate','allows_mate']
        writer = csv.DictWriter(f,fieldnames=fields); writer.writeheader()
        writer.writerows({k:r[k] for k in fields} for r in effective)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('root', type=Path)
    p.add_argument('--nodes', type=int, default=100000)
    p.add_argument('--verify-nodes', type=int, default=1000000)
    p.add_argument('--stockfish', default='/opt/homebrew/bin/stockfish')
    p.add_argument('--include-running', action='store_true', help='Audit a read-only snapshot of unfinished games too')
    a = p.parse_args()
    if Path(sys.prefix).name.lower() != 'touhouchess':
        p.error('Use the TouhouChess conda environment')
    if a.nodes < 1 or a.verify_nodes < a.nodes:
        p.error('Require 0 < nodes <= verify-nodes')
    sf = Process([a.stockfish])
    config = dict(nodes=a.nodes, verify_nodes=a.verify_nodes,
                  stockfish_sha256=hashlib.sha256(Path(a.stockfish).read_bytes()).hexdigest())
    all_rows = []
    try:
        sf.send('uci'); options = sf.until('uciok')
        config['stockfish'] = next(x[8:] for x in options if x.startswith('id name '))
        for command in ['setoption name Threads value 1', 'setoption name Hash value 64',
                        'setoption name UCI_LimitStrength value false', 'setoption name Skill Level value 20']:
            sf.send(command)
        for path in sorted(a.root.glob('*/game-*.json')):
            game = json.loads(path.read_text())
            if not game.get('result') and not a.include_running:
                continue
            out = path.with_name('audit-' + path.name)
            identity = {**config, 'game_sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
            previous = json.loads(out.read_text()) if out.exists() else {}
            old_moves = previous.get('moves', [])
            same_prefix = (old_moves and game['moves'][:len(old_moves)] == old_moves
                           and game['records'][:len(old_moves)] == previous.get('records')
                           and all(previous.get('identity', {}).get(k) == v for k, v in config.items()))
            if previous.get('identity') == identity or same_prefix:
                rows = previous['rows']
            else:
                rows = []
            done = {r['ply'] for r in rows}
            sf.send('ucinewgame'); sf.send('isready'); sf.until('readyok')
            for record in game['records']:
                ply = record['ply']
                if record['side'] != game['dev_side'] or ply in done:
                    continue
                before = evaluate(sf, game['moves'][:ply-1], a.nodes)
                after = evaluate(sf, game['moves'][:ply], a.nodes)
                flags = classify(before, after)
                suspect = ((flags['cp_loss'] or 0) >= 100 or flags['missed_mate'] or flags['allows_mate'])
                row = dict(game=path.stem, elo=game['elo'], **record,
                           before=before, after=after, **flags)
                if suspect:
                    sf.send('ucinewgame'); sf.send('isready'); sf.until('readyok')
                    vb = evaluate(sf, game['moves'][:ply-1], a.verify_nodes)
                    va = evaluate(sf, game['moves'][:ply], a.verify_nodes)
                    row['verified'] = dict(before=vb, after=va, **classify(vb, va))
                rows.append(row)
                save(out, dict(identity=identity, moves=game['moves'], records=game['records'], rows=rows))
            all_rows += rows
            print(f"Audited {path.parent.name}/{path.name}: {len(rows)} moves", flush=True)
    finally:
        sf.close()
    save(a.root/'audit.json', dict(config=config, rows=all_rows))
    write_report(a.root, config, all_rows)


if __name__ == '__main__':
    main()
