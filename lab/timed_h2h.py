"""Portable paired 3-second Eirin experiment; no Python chess implementation."""
from __future__ import annotations
import argparse
import concurrent.futures
import csv
import hashlib
import json
import os
from pathlib import Path
import platform
import random
import statistics
import subprocess
import sys
import threading

ROOT = Path(__file__).resolve().parent.parent
NODE = os.environ.get('NODE', 'node')
COMMAND = [NODE, '--import', 'tsx', str(ROOT / 'cli/timed-match.mjs')]
PRINT_LOCK = threading.Lock()
PROCESSES = set()
PROCESS_LOCK = threading.Lock()
STOP = threading.Event()

def emit(text):
    with PRINT_LOCK:
        print(text, flush=True)

def atomic_json(path, value):
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(path)

def rpc(payload):
    p = subprocess.run(COMMAND, cwd=ROOT, input=json.dumps(payload),
                       capture_output=True, text=True, encoding='utf-8')
    if p.returncode:
        raise RuntimeError(p.stderr)
    return json.loads(p.stdout)

def source_hash():
    paths = sorted((ROOT / 'engine').glob('*')) + [ROOT / 'cli/timed-match.mjs',
             ROOT / 'lab/timed_h2h.py', ROOT / 'package-lock.json']
    digest = hashlib.sha256()
    for path in paths:
        if path.is_file():
            digest.update(path.relative_to(ROOT).as_posix().encode())
            # Git's Windows CRLF checkout must not change the experiment identity.
            digest.update(path.read_bytes().replace(b'\r\n', b'\n'))
    return digest.hexdigest()

def vanilla():
    army = {f+'1': t for f, t in zip('abcdefgh', ['r','n','b','q','k','b','n','r'])}
    army.update({f+'2': 'p' for f in 'abcdefgh'})
    return army

def make_manifest(args, config):
    rng = random.Random(args.seed)
    catalog = rpc({'mode': 'catalog'})
    pairs = []
    seen = set()
    for group in ['vanilla', 'random']:
        for index in range(args.pairs):
            if group == 'vanilla':
                army, points = vanilla(), 43
            else:
                for attempt in range(1000):
                    squares = list(catalog)
                    rng.shuffle(squares)
                    proposals = []
                    for square in squares:
                        choices = catalog[square].copy()
                        rng.shuffle(choices)
                        proposals.append([square, choices])
                    prepared = rpc({'mode': 'prepare', 'proposals': proposals})
                    army, points = prepared['army'], prepared['points']
                    key = json.dumps(army, sort_keys=True)
                    if points >= 30 and key not in seen and army != vanilla():
                        seen.add(key)
                        break
                else:
                    raise RuntimeError('Unable to sample a distinct random army')
            pairs.append({'id': f'{group}-{index+1:03d}', 'group': group,
                          'seed': rng.randrange(1, 2**31), 'army': army, 'points': points})
    return {'config': config, 'host': {'platform': platform.platform(),
            'processor': platform.processor(), 'python': platform.python_version(),
            'node': subprocess.check_output([NODE, '--version'], text=True).strip()}, 'pairs': pairs}

def specs(manifest):
    c = manifest['config']
    for pair in manifest['pairs']:
        for side in ['w', 'b']:
            yield dict(pair, id=pair['id']+'-'+side, pair=pair['id'], onSide=side,
                       timeMs=c['time_ms'], maxPly=c['max_ply'], source=c['source'])

def run_game(spec, out):
    if STOP.is_set():
        return
    checkpoint = out / 'games' / (spec['id']+'.json')
    if checkpoint.exists() and json.loads(checkpoint.read_text(encoding='utf-8'))['result']:
        emit(f"[skip] {spec['id']}")
        return
    emit(f"[start/resume] {spec['id']}")
    log = out / 'games' / (spec['id']+'.stderr.log')
    with log.open('w', encoding='utf-8') as errors:
        with PROCESS_LOCK:
            if STOP.is_set():
                return
            p = subprocess.Popen(COMMAND, cwd=ROOT, stdin=subprocess.PIPE,
                                 stdout=subprocess.PIPE, stderr=errors, text=True, encoding='utf-8')
            PROCESSES.add(p)
        try:
            p.stdin.write(json.dumps({'mode': 'game', 'spec': spec, 'checkpoint': str(checkpoint)}))
            p.stdin.close()
            for line in p.stdout:
                event = json.loads(line)
                if event['kind'] == 'result':
                    emit(f"[done] {spec['id']} {event['code']} score={event['score']} plies={event['plies']}")
                elif event['ply'] % 20 == 0:
                    emit(f"[progress] {spec['id']} ply={event['ply']} depth={event['depth']}")
            if p.wait() and not STOP.is_set():
                raise RuntimeError(f'{spec["id"]} failed; see {log}')
        finally:
            if p.poll() is None:
                p.terminate()
                p.wait()
            p.stdout.close()
            with PROCESS_LOCK:
                PROCESSES.discard(p)

def report(out, manifest):
    records, move_rows = [], []
    for spec in specs(manifest):
        path = out / 'games' / (spec['id']+'.json')
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding='utf-8'))
        result = data['result']
        row = {'id': spec['id'], 'group': spec['group'], 'pair': spec['pair'],
               'on_side': spec['onSide'], 'code': result['code'] if result else 'in_progress',
               'score': result['score'] if result else None, 'plies': len(data['moves']),
               'points': spec['points'], 'army': json.dumps(spec['army'], ensure_ascii=False, sort_keys=True),
               'opening8': ' '.join(m['notation'] for m in data['moves'][:8])}
        for enabled, label in [(True, 'on'), (False, 'off')]:
            moves = [m for m in data['moves'] if m['enabled'] == enabled]
            row[label+'_depth'] = round(statistics.mean(m['depth'] for m in moves), 2) if moves else None
            row[label+'_ms'] = round(statistics.mean(m['ms'] for m in moves), 1) if moves else None
        records.append(row)
        for move in data['moves']:
            move_rows.append(dict(game=spec['id'], group=spec['group'], **move))
    def csv_write(name, rows, fields):
        path = out / name
        tmp = out / (name+f'.{os.getpid()}.tmp')
        with tmp.open('w', newline='', encoding='utf-8-sig') as f:
            writer = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(rows)
        tmp.replace(path)
    csv_write('games.csv', records, ['id','group','pair','on_side','code','score','plies','points',
                                    'on_depth','off_depth','on_ms','off_ms','opening8','army'])
    csv_write('moves.csv', move_rows, ['game','group','ply','side','enabled','notation','depth','ms','score','from','to','promo','drop','castle'])
    c = manifest['config']
    text = ['# 永琳：futility + LMR 等时对局报告', '',
            f"每手预算：{c['time_ms']} ms；每组 {c['pairs']} 对换色；并发 {c['workers']} 局；上限 {c['max_ply']} 半回合。",
            '以下胜负和分数均从**开启内部剪枝的一方**看。双方均为永琳，根节点收窄保持开启。', '',
            '| 阵容 | 已结束 | 胜 | 和 | 负 | 纯胜率 | 得分率（和计半分） | 未决 | 进行中 | 未开始 |',
            '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
    details = []
    for group, label in [('vanilla','香草'),('random','随机对称')]:
        rs = [r for r in records if r['group'] == group]
        finished = [r for r in rs if r['score'] is not None]
        w, d, l = [sum(r['score'] == s for r in finished) for s in [1, .5, 0]]
        n = len(finished)
        rate = lambda x: f'{100*x/n:.1f}%' if n else '—'
        unresolved = sum(r['code'] == 'unresolved' for r in rs)
        ongoing = sum(r['code'] == 'in_progress' for r in rs)
        text.append(f'| {label} | {n} | {w} | {d} | {l} | {rate(w)} | {rate(w+d/2)} | {unresolved} | {ongoing} | {2*c["pairs"]-len(rs)} |')
        complete_pairs = []
        for pair in manifest['pairs']:
            if pair['group'] != group:
                continue
            legs = [r for r in finished if r['pair'] == pair['id']]
            if len(legs) == 2:
                complete_pairs.append(sum(r['score'] for r in legs)/2)
        if complete_pairs:
            rng = random.Random(8675309)
            boots = sorted(statistics.mean(rng.choices(complete_pairs, k=len(complete_pairs))) for _ in range(5000))
            ci = f'{100*boots[124]:.1f}%～{100*boots[4874]:.1f}%'
            details.append(f'- {label}：完整配对 {len(complete_pairs)} 组，配对平均得分率 {100*statistics.mean(complete_pairs):.1f}%；配对 bootstrap 描述性 95% 区间 {ci}。')
            if len(complete_pairs) < 20 or len(set(complete_pairs)) < 2:
                details.append('  样本太少或结果过于单一，区间可能退化，不能据此宣称显著优势。')
        else:
            details.append(f'- {label}：尚无完整且有结论的配对，暂不计算配对区间。')
        openings = {r['opening8'] for r in rs if r['plies'] >= 8}
        details.append(f'- {label}前 8 个半回合：{len(openings)} 条不同走棋记录；重复对局会降低实际信息量。')
    text += ['', '## 统计边界', '', *details, '',
             '- 达到手数上限仍未终局的对局记为未决，不按子力裁决、不冒充和棋；胜率分母只含自然结束对局，未决较多时可能有选择偏差。',
             '- 每对使用同一镜像阵容和种子，交换开启剪枝方的颜色。没有预走开局，每个实际走子都调用限时永琳。',
             '- 随机阵容固定 e1 王，其他身位按种子随机排列候选，经同一 TS 引擎验证，保留 30～45 点阵容，不是所有合法阵容的均匀抽样；暂不包含作为将军对象的八云紫。',
             '- 开关同时控制 futility 和 LMR；不能从此实验分离两者各自的收益。',
             '- 深度和耗时详见 games.csv / moves.csv；真实墙钟限时受硬件、后台负载、并发和 JIT 影响，种子不能保证逐步完全复现。',
             '- 配对区间只使用两盘均自然结束的配对。小样本结果用于观察趋势，不自动决定修改默认设置。', '',
             '## 运行信息', '', '```json', json.dumps({'config':c,'host':manifest['host']}, ensure_ascii=False, indent=2), '```', '']
    tmp = out / f'report.md.{os.getpid()}.tmp'
    tmp.write_text('\n'.join(text), encoding='utf-8')
    tmp.replace(out / 'report.md')
    return records

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pairs', type=int, default=5, help='Pairs per army group: default 5 means 20 games total')
    parser.add_argument('--workers', type=int, default=1)
    parser.add_argument('--time-ms', type=int, default=3000, help='Use 3000 for the real experiment')
    parser.add_argument('--max-ply', type=int, default=300)
    parser.add_argument('--seed', type=int, default=20261025)
    parser.add_argument('--out', default='lab/out/timed-h2h-3s')
    parser.add_argument('--summary', action='store_true', help='Only regenerate Markdown and CSV reports')
    args = parser.parse_args()
    if min(args.pairs, args.workers, args.time_ms, args.max_ply) < 1:
        parser.error('pairs/workers/time-ms/max-ply must be positive')
    if Path(sys.prefix).name.lower() != 'touhouchess':
        parser.error('Run in the TouhouChess conda environment')
    out = Path(args.out).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    manifest_path = out / 'manifest.json'
    if args.summary:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        report(out, manifest)
        emit(f'Report: {out / "report.md"}')
        return
    config = dict(pairs=args.pairs, workers=args.workers, time_ms=args.time_ms,
                  max_ply=args.max_ply, seed=args.seed, source=source_hash(), protocol=1)
    lock = out / '.running.lock'
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        parser.error(f'{lock} exists. If no experiment is running, remove this stale lock and retry.')
    os.write(fd, str(os.getpid()).encode())
    os.close(fd)
    pool = None
    try:
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
            if manifest['config'] != config:
                raise RuntimeError('Configuration/source changed. Resume with identical arguments/code or use a new --out directory.')
        else:
            manifest = make_manifest(args, config)
            atomic_json(manifest_path, manifest)
        (out / 'games').mkdir(exist_ok=True)
        report(out, manifest)
        pool = concurrent.futures.ThreadPoolExecutor(max_workers=args.workers)
        jobs = [pool.submit(run_game, spec, out) for spec in specs(manifest)]
        for job in concurrent.futures.as_completed(jobs):
            job.result()
            report(out, manifest)
        emit(f'Completed. Report: {out / "report.md"}')
    except KeyboardInterrupt:
        emit('Stopping; saved moves can be resumed with the same command.')
    finally:
        STOP.set()
        with PROCESS_LOCK:
            for p in list(PROCESSES):
                if p.poll() is None:
                    p.terminate()
        if pool:
            pool.shutdown(wait=True, cancel_futures=True)
        try:
            if manifest_path.exists():
                report(out, json.loads(manifest_path.read_text(encoding='utf-8')))
        finally:
            lock.unlink(missing_ok=True)

if __name__ == '__main__':
    main()
