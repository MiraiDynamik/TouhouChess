"""Controlled fairy exchanges: two fairies vs three pawns, or vs one knight."""
from __future__ import annotations
import argparse
import concurrent.futures
import csv
import hashlib
import json
import os
from pathlib import Path
import random
import statistics
import subprocess
import sys

import piece_value as common

ROOT = common.ROOT
runner = common.runner
GROUPS = {'pawns': '两妖精对三兵', 'knight': '两妖精对一马'}


def source_hash():
    digest = hashlib.sha256(common.source_hash().encode())
    digest.update(Path(__file__).read_bytes().replace(b'\r\n', b'\n'))
    return digest.hexdigest()


def layouts(group):
    """Only starting armies vary; no forced openings or random in-game moves."""
    if group == 'pawns':
        # 4 light x 4 dark squares x 6 possible empty pawn slots = 96 layouts.
        for light in 'aceg':
            for dark in 'bdfh':
                for empty in 'abcdefgh':
                    if empty in (light, dark):
                        continue
                    a, b = runner.vanilla(), runner.vanilla()
                    a[light+'2'] = a[dark+'2'] = 'fairy'
                    del a[empty+'2']
                    yield f'{light}2-{dark}2-empty-{empty}2', a, b
    else:
        for removed in ['b1', 'g1']:
            a, b = runner.vanilla(), runner.vanilla()
            a['b1'] = a['g1'] = 'fairy'
            del b[removed]
            yield 'remove-'+removed, a, b


def make_manifest(config):
    rng = random.Random(config['seed'])
    schedules = {}
    for group in config['groups']:
        available = list(layouts(group))
        selected = []
        while len(selected) < config['pairs']:
            cycle = available.copy()
            rng.shuffle(cycle)
            selected.extend(cycle[:config['pairs']-len(selected)])
        schedules[group] = selected
    specs = []
    # Interleave groups so an interrupted run still samples both comparisons.
    for index in range(config['pairs']):
        for group in config['groups']:
            layout, a, b = schedules[group][index]
            seed = rng.randrange(1, 2**31)
            pair = f'{group}-{index+1:04d}'
            for side in ['w', 'b']:
                specs.append(dict(id=pair+'-'+side, pair=pair, piece='fairy',
                    context=group, prior=1.5, equivalent=3, pairIndex=index,
                    layout=layout, seed=seed, armyA=a, armyB=b, onSide=side,
                    timeMs=config['time_ms'], maxPly=config['max_ply'], source=config['source']))
    manifest = dict(config=config, specs=specs)
    common.validate_ids(manifest)
    return manifest


def report(out, manifest, records):
    rows = []
    for spec in manifest['specs']:
        data = records.get(spec['id'])
        result = data.get('result') if data else None
        moves = data['moves'] if data else []
        rows.append(dict(id=spec['id'], group=spec['context'], layout=spec['layout'],
            fairy_side=spec['onSide'], result=result['code'] if result else 'pending',
            score=result['score'] if result else None, plies=len(moves),
            mean_depth=round(statistics.mean(m['depth'] for m in moves), 2) if moves else None))
    lines = ['# 妖精固定交换实验', '',
        f"先验固定 1.5；每手 {manifest['config']['time_ms']} ms；每种情况 {manifest['config']['pairs']} 对换色。",
        '所有胜负与得分均从妖精方看，胜=1、和=0.5、负=0。两组独立统计，不混成一个估值。', '',
        '| 对照 | 完成/计划 | 胜/和/负 | 未决 | 完整配对 | 得分率（已决局） | 完整配对得分范围 | 布局数（完成/计划） |',
        '|---|---:|---|---:|---:|---:|---|---|']
    summaries = []
    for group in manifest['config']['groups']:
        subset = [r for r in rows if r['group'] == group]
        done = [r for r in subset if r['result'] != 'pending']
        w, d, loss = [sum(r['score'] == v for r in done) for v in [1, .5, 0]]
        unresolved = sum(r['score'] is None for r in done)
        decided = w+d+loss
        rate = (w+.5*d)/decided if decided else None
        paired = {}
        for spec in manifest['specs']:
            if spec['context'] == group:
                paired.setdefault(spec['pair'], []).append(records.get(spec['id']))
        complete = [legs for legs in paired.values() if all(g and g['result'] for g in legs)]
        scores = [g['result']['score'] for legs in complete for g in legs]
        low = sum(0 if x is None else x for x in scores)/len(scores) if scores else None
        high = sum(1 if x is None else x for x in scores)/len(scores) if scores else None
        bounds = f'{low:.1%}–{high:.1%}' if scores else '—'
        layouts_done = len({r['layout'] for r in done})
        layouts_total = len({r['layout'] for r in subset})
        lines.append(f"| {GROUPS[group]} | {len(done)}/{len(subset)} | {w}/{d}/{loss} | {unresolved} | {len(complete)} | "
                     + (f'{rate:.1%}' if rate is not None else '—') + f' | {bounds} | {layouts_done}/{layouts_total} |')
        summaries.append(dict(group=group, planned=len(subset), completed=len(done), wins=w,
            draws=d, losses=loss, unresolved=unresolved, complete_pairs=len(complete),
            score_rate=rate, pair_lower=low, pair_upper=high,
            layouts_completed=layouts_done, layouts_planned=layouts_total))
    lines += ['', '## 阅读方式', '',
        '- 兵对照：妖精方在香草阵容中用两个异色妖精和一个空位替换三个兵，对手为完整香草阵容。',
        '- 马对照：妖精方 b1/g1 两马均换妖精；对手删 b1 或 g1 的一马，双方八兵保留。格名为本方白视角，执黑时上下镜像。',
        '- 每对固定同一阵容与种子，只交换执色；不强制随机开局。双方永琳、妖精先验均固定1.5，弹药各2。',
        '- 兵对照共有96种布局，均衡循环后随机排列；马对照只有2种布局，500对时各250对。重复布局不是新的独立样本，不能把500对当作500个独立开局。',
        '- 完整配对得分范围仅将未决分别按全负/全胜计入，不是置信区间；未完成的配对不进入该范围。',
        '- 达到步数上限只算未决，不按子力或评分裁胜。得分高于50%倾向妖精方，低于50%倾向对照方，但位置偏差和重复局仍需结合棋谱判断。',
        '- 这两组测试固定交换关系，不直接拟合单枚妖精的精确兵值，不启动恋的测试。',
        '- JSON保存续跑与搜索数据，PGN供复盘。续跑丢失内存置换表，后续着法可能变化。']
    for name, content in [('games.csv', rows), ('summary.csv', summaries)]:
        tmp = out / f'{name}.{os.getpid()}.tmp'
        with tmp.open('w', encoding='utf-8-sig', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=list(content[0]))
            writer.writeheader(); writer.writerows(content)
        common.replace_report(tmp, out/name)
    tmp = out / f'report.md.{os.getpid()}.tmp'
    tmp.write_text('\n'.join(lines)+'\n', encoding='utf-8')
    common.replace_report(tmp, out/'report.md')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out', default='lab/out/fairy-exchange-2000')
    ap.add_argument('--pairs', type=int, default=500, help='Pairs PER group')
    ap.add_argument('--groups', choices=['both', 'pawns', 'knight'], default='both')
    ap.add_argument('--workers', type=int, default=12)
    ap.add_argument('--time-ms', type=int, default=3000)
    ap.add_argument('--max-ply', type=int, default=400)
    ap.add_argument('--seed', type=int, default=20261026)
    modes = ap.add_mutually_exclusive_group()
    modes.add_argument('--plan', action='store_true')
    modes.add_argument('--summary', action='store_true')
    modes.add_argument('--export-pgn', action='store_true')
    args = ap.parse_args()
    if Path(sys.prefix).name.lower() != 'touhouchess':
        ap.error('Use the TouhouChess conda environment')
    if min(args.pairs, args.workers, args.time_ms, args.max_ply) < 1:
        ap.error('All limits must be positive')
    out = Path(args.out).expanduser().resolve()
    if not (args.summary or args.export_pgn):
        out.mkdir(parents=True, exist_ok=True)
    runner.COMMAND = common.COMMAND
    runner.STOP.clear()
    with common.output_lock(out):
        path = out/'manifest.json'
        if args.summary or args.export_pgn:
            manifest = json.loads(path.read_text(encoding='utf-8'))
            records = {s['id']: common.load_record(out, s) for s in manifest['specs']}
            if args.summary:
                report(out, manifest, records)
            else:
                for spec in manifest['specs']:
                    if records[spec['id']]:
                        subprocess.run(common.COMMAND, cwd=ROOT, text=True, encoding='utf-8', check=True,
                            input=json.dumps(dict(mode='export', checkpoint=str(out/'games'/(spec['id']+'.json')))))
            return
        config = dict(protocol='fairy-exchange-v1', groups=list(GROUPS) if args.groups=='both' else [args.groups],
            pairs=args.pairs, prior=1.5, time_ms=args.time_ms, max_ply=args.max_ply,
            seed=args.seed, source=source_hash(), node=subprocess.check_output([runner.NODE, '--version'], text=True).strip())
        if path.exists():
            manifest = json.loads(path.read_text(encoding='utf-8'))
            if manifest['config'] != config:
                raise RuntimeError('Source/config/Node changed: use original code/command or a new --out')
        else:
            manifest = make_manifest(config)
            subprocess.run(common.COMMAND, cwd=ROOT, text=True, encoding='utf-8', check=True,
                input=json.dumps(dict(mode='validate', specs=manifest['specs'])))
            runner.atomic_json(path, manifest)
        common.validate_ids(manifest)
        (out/'games').mkdir(exist_ok=True)
        records = {s['id']: common.load_record(out, s) for s in manifest['specs']}
        report(out, manifest, records)
        runner.emit(f"Plan: {len(manifest['specs'])} games; {args.workers} workers; output {out}")
        if args.plan:
            return
        pool = concurrent.futures.ThreadPoolExecutor(max_workers=args.workers)
        try:
            jobs = {pool.submit(runner.run_game, s, out): s for s in manifest['specs']}
            for job in concurrent.futures.as_completed(jobs):
                job.result()
                spec = jobs[job]
                records[spec['id']] = common.load_record(out, spec)
                report(out, manifest, records)
        except KeyboardInterrupt:
            runner.emit('Stopping. Run the same command to resume saved plies.')
        finally:
            runner.STOP.set()
            with runner.PROCESS_LOCK:
                for process in list(runner.PROCESSES):
                    if process.poll() is None:
                        process.terminate()
            pool.shutdown(wait=True, cancel_futures=True)
            records = {s['id']: common.load_record(out, s) for s in manifest['specs']}
            report(out, manifest, records)


if __name__ == '__main__':
    main()
