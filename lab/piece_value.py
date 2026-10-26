"""Stage 1: calibrate fairy (Ferz) against pawns; Python stdlib only."""
from __future__ import annotations
import argparse
import concurrent.futures
import csv
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import random
import statistics
import subprocess
import sys
import time
from contextlib import contextmanager

import timed_h2h as runner

ROOT = Path(__file__).resolve().parent.parent
COMMAND = [runner.NODE, '--import', 'tsx', str(ROOT / 'cli/value-match.mjs')]
CONTEXTS = ['pawn', 'minor', 'pawn-no-bishops', 'minor-no-bishops']


@contextmanager
def output_lock(out):
    """All commands writing an experiment directory share this lock."""
    lock = out / '.running.lock'
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        raise RuntimeError(f'{lock} exists; stop its runner before exporting or rebuilding reports') from None
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(str(os.getpid()))
        yield
    finally:
        lock.unlink(missing_ok=True)


def replace_report(tmp, path):
    for attempt in range(8):
        try:
            tmp.replace(path)
            return
        except PermissionError:
            if attempt == 7:
                runner.emit(f'Report busy: close {path.name}; checkpoints are safe. Run --summary later.')
                return
            time.sleep(min(.05 * 2**attempt, .5))


def validate_ids(manifest):
    ids = [s['id'] for s in manifest['specs']]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate game IDs would write the same checkpoint; choose distinct priors')


def source_hash():
    paths = list((ROOT / 'engine').glob('*')) + [ROOT / p for p in
        ['cli/value-match.mjs', 'lab/piece_value.py', 'lab/timed_h2h.py', 'package-lock.json']]
    digest = hashlib.sha256()
    for path in sorted(p for p in paths if p.is_file()):
        digest.update(path.relative_to(ROOT).as_posix().encode())
        digest.update(path.read_bytes().replace(b'\r\n', b'\n'))
    return digest.hexdigest()


def armies(piece, context, equivalent, seed):
    """Two test pieces replace pawns or knights; pawn odds balance the exchange.

    equivalent is the TOTAL number of reference pawns for TWO test pieces.
    All square names are from the army's own white-side view.
    """
    rng = random.Random(seed)
    a, b = runner.vanilla(), runner.vanilla()
    minor = context.startswith('minor')
    if minor:
        targets, baseline = ['b1', 'g1'], 6
    else:
        targets = [rng.choice('aceg')+'2', rng.choice('bdfh')+'2']
        baseline = 2
    if context.endswith('no-bishops'):
        for army in [a, b]:
            for square in ['c1', 'f1']:
                del army[square]
    for square in targets:
        a[square] = piece
    available = [f+'2' for f in 'abcdefgh' if f+'2' not in targets]
    rng.shuffle(available)
    delta = equivalent - baseline
    # The same seed gives nested pawn-removal subsets across all odds levels.
    losing_army = a if delta > 0 else b
    for square in available[:abs(delta)]:
        del losing_army[square]
    if abs(delta) > len(available):
        raise ValueError('Insufficient pawn slots for this odds level')
    return a, b


def make_manifest(config):
    specs = []
    cells = [('p', 'pawn', 1.0)]
    cells += [(p, c, v) for p in config['pieces'] for c in config['contexts'] for v in config['priors']]
    for piece, context, prior in cells:
        for equiv in config['equivalents']:
            for pair in range(config['pairs']):
                seed = config['seed'] + pair * 104729
                a, b = armies(piece, context, equiv, seed)
                pair_id = f'{piece}-{context}-v{prior:g}-e{equiv}-{pair+1:03d}'
                for side in ['w', 'b']:
                    specs.append(dict(id=pair_id+'-'+side, pair=pair_id, piece=piece,
                        context=context, prior=prior, equivalent=equiv, pairIndex=pair,
                        seed=seed, armyA=a, armyB=b, onSide=side,
                        timeMs=config['time_ms'], maxPly=config['max_ply'], source=config['source']))
    manifest = dict(config=config, specs=specs, host=dict(platform=platform.platform(),
        python=platform.python_version(), node=config['node']))
    validate_ids(manifest)
    return manifest


def load_record(out, spec):
    path = out / 'games' / (spec['id']+'.json')
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding='utf-8'))
    if data.get('spec') != spec:
        raise RuntimeError(f'Checkpoint mismatch: {path}')
    return data


def pair_stats(records):
    """Bounded pair means, with unresolved legs allowed to be losses OR wins.

    Hoeffding intervals avoid pretending draws are binomial wins and avoid
    zero-width bootstrap intervals when a tiny sample has identical outcomes.
    """
    pairs = {}
    for spec, data in records:
        pairs.setdefault(spec['pair'], []).append(data)
    low, high = [], []
    for legs in pairs.values():
        if len(legs) != 2 or any(not d or not d['result'] for d in legs):
            continue
        scores = [d['result']['score'] for d in legs]
        low.append(sum(0 if s is None else s for s in scores)/2)
        high.append(sum(1 if s is None else s for s in scores)/2)
    if not low:
        return dict(n=0, low=0, high=1, mean=None)
    radius = math.sqrt(math.log(40)/(2*len(low)))
    return dict(n=len(low), low=max(0, statistics.mean(low)-radius),
                high=min(1, statistics.mean(high)+radius),
                mean=statistics.mean(low) if low == high else None)


def report(out, manifest):
    groups, rows = {}, []
    for spec in manifest['specs']:
        data = load_record(out, spec)
        groups.setdefault((spec['piece'], spec['context'], spec['prior'], spec['equivalent']), []).append((spec, data))
        result = data['result'] if data else None
        moves = data['moves'] if data else []
        rows.append(dict(id=spec['id'], piece=spec['piece'], context=spec['context'],
            prior=spec['prior'], equivalent_per_piece=spec['equivalent']/2, side=spec['onSide'],
            code=result['code'] if result else 'in_progress' if data else 'not_started',
            score=result['score'] if result else None, plies=len(moves),
            depth=round(statistics.mean(m['depth'] for m in moves), 2) if moves else None,
            opening8=' '.join(m['notation'] for m in moves[:8]),
            armyA=json.dumps(spec['armyA'], sort_keys=True), armyB=json.dumps(spec['armyB'], sort_keys=True)))
    stats = {key: pair_stats(records) for key, records in groups.items()}
    control = [stats.get(('p', 'pawn', 1.0, e)) for e in [0, 2, 4]]
    calibrated = (all(control) and control[0]['low'] > .5 and control[2]['high'] < .5
                  and control[1]['low'] <= .5 <= control[1]['high'])
    c = manifest['config']
    text = ['# 第一阶段：妖精（Ferz）对普通兵的交换实验', '',
        f"每手 {c['time_ms']} ms；每格 {c['pairs']} 对换色；共 {len(rows)} 局；步数上限 {c['max_ply']} ply。",
        '本阶段不测古明地恋。确认妖精标定后，第二阶段才分别用普通兵、妖精直接对照恋。',
        '每组放两枚被测子；表中兵值是每枚的名义交换量，不是输入给引擎的估值。',
        'Ferz 参考：GNU XBoard 的 Makruk 规则列 Met（F）为 1.5；这是不同规则环境的参照，不是本游戏的标准答案。',
        '参考：https://www.gnu.org/software/xboard/whats_new/rules/Makruk.html',
        'pawn = 替换两个异色兵位的兵；minor = 替换 b1/g1 两马；no-bishops = 双方撤去两象。',
        '对照方为香草棋子，通过移除一方若干兵制造补偿差。弹药固定为双方各 2，价格与默认参数不改。',
        '每对使用相同阵容并交换执白/执黑；随机种子配对，实际着法可能因限时搜索不同。', '',
        '**普通兵校准：'+('通过方向性检查。' if calibrated else '尚未通过／样本不足，不能据此确定棋子价值。')+'**',
        '校准要求：普通兵实验的 0 兵档显著优于 50%，2 兵档显著低于 50%，1 兵档与 50% 相容。', '',
        '| 棋子 | 场景 | 引擎先验估值 | 对照兵值/枚 | 胜/和/负 | 未决 | 完整配对 | 得分率 | 保守95%区间 |',
        '|---|---|---:|---:|---|---:|---:|---:|---|']
    summary = []
    for key, records in groups.items():
        piece, context, prior, equiv = key
        finished = [d['result'] for _, d in records if d and d['result']]
        w, draw, loss = [sum(r['score'] == s for r in finished) for s in [1, .5, 0]]
        unresolved = sum(r['score'] is None for r in finished)
        n = w + draw + loss
        rate = (w+draw/2)/n if n else None
        st = stats[key]
        text.append(f"| {piece} | {context} | {prior:g} | {equiv/2:g} | {w}/{draw}/{loss} | {unresolved} | {st['n']} | "
                    + (f'{rate:.1%}' if rate is not None else '—')
                    + f" | [{st['low']:.1%}, {st['high']:.1%}] |")
        summary.append(dict(piece=piece, context=context, prior=prior, equivalent_per_piece=equiv/2,
            wins=w, draws=draw, losses=loss, unresolved=unresolved, complete_pairs=st['n'],
            score_rate=rate, lower=st['low'], upper=st['high']))
    text += ['', '## 如何判断价值', '',
        '看得分率随对照兵值增加而下降、穿过 50% 的区间；不把胜率最高的先验估值当作真实价值。',
        '得分率仅列自然结束的局，须结合未决数阅读；区间以完整换色配对为单位，未决分别按全负/全胜计入上下界，使用保守 Hoeffding 界。未完成的配对不进入区间。',
        '区间是假设各随机配对近似独立的逐格95%区间，不是整张表的同时置信保证；重复开局会降低有效样本量。', '']
    for piece, context, prior in sorted({k[:3] for k in groups if k[0] != 'p'}):
        curve = sorted((k[3]/2, st) for k, st in stats.items() if k[:3] == (piece, context, prior))
        above = [x for x, st in curve if st['low'] > .5]
        below = [x for x, st in curve if st['high'] < .5]
        lo, hi = max(above, default=None), min(below, default=None)
        if calibrated and lo is not None and hi is not None and lo < hi:
            verdict = f'在价值—得分率单调的假设下，观察到的交换平衡范围约 {lo:g}–{hi:g} 兵/枚；仍需独立样本复核。'
        else:
            verdict = '定不住：尚无经校准的双侧范围；增加配对、扩展档位或检查非单调性。'
        text.append(f'- {piece}/{context}/先验 {prior:g}：{verdict}')
    openings = [r['opening8'] for r in rows if r['plies'] >= 8]
    text += ['', f"已有8手记录 {len(openings)} 局，其中不同开局文本 {len(set(openings))} 种（跨不同阵容不能仅凭文本判为重复局）。",
        '', '## 限制', '',
        '- 这是当前永琳控制下、指定阵容与阶段的实战交换价值，不是普适常数或最终部署价格。两枚棋子的均值包含配合收益，不能直接当作单枚独立价值。',
        '- 不同先验估值若给出不同结论，说明结果受引擎使用方式影响；不同场景应分别解释，不强行合成一个小数。',
        '- minor 场景另含“两马约六兵”的假设，仅作辅助；直接对兵标定以 pawn 场景为主。',
        '- 对称普通兵对照可能重复同一开局；区间不能消除系统性偏差，与 50% 相容也不能证明等价。',
        '- 双象场景可观察配合趋势，但撤象也改变局面复杂度；不能把两个场景的胜率差全部归因于主教保护。',
        '- 本实验不包含人为摆好的后排互保残局。开局、中局与残局价值可能不同；妖精是校验参照，程序不预设它应该值多少。',
        '- 步数上限只记未决，绝不按被测估值或子力裁胜；暂停续跑会丢失内存置换表，后续着法可能与不中断运行不同。',
        '- 每手时间是搜索预算，系统调度可能稍超时；降低 workers 可减轻 CPU 竞争。短时 smoke 结果不能用于估值。']
    def write_csv(name, data):
        tmp = out / (name+f'.{os.getpid()}.tmp')
        with tmp.open('w', encoding='utf-8-sig', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=list(data[0]))
            writer.writeheader(); writer.writerows(data)
        replace_report(tmp, out / name)
    write_csv('games.csv', rows)
    write_csv('summary.csv', summary)
    tmp = out / f'report.md.{os.getpid()}.tmp'
    tmp.write_text('\n'.join(text)+'\n', encoding='utf-8'); replace_report(tmp, out / 'report.md')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out', default='lab/out/fairy-pilot')
    ap.add_argument('--pairs', type=int, default=2, help='Pairs per cell; pilot only')
    ap.add_argument('--workers', type=int, default=12)
    ap.add_argument('--time-ms', type=int, default=3000)
    ap.add_argument('--max-ply', type=int, default=400)
    ap.add_argument('--seed', type=int, default=20261026)
    ap.add_argument('--contexts', default='pawn')
    ap.add_argument('--priors', default='1,2', help='Shared evaluator value; pawn is always 1')
    ap.add_argument('--equivalents', default='0,2,3,4,6', help='TOTAL pawn equivalence for TWO test pieces')
    ap.add_argument('--summary', action='store_true')
    ap.add_argument('--export-pgn', action='store_true', help='Export saved games without resuming experiments')
    ap.add_argument('--plan', action='store_true', help='Save and validate manifest without playing')
    args = ap.parse_args()
    if Path(sys.prefix).name.lower() != 'touhouchess':
        ap.error('Use the TouhouChess conda environment')
    if min(args.pairs, args.workers, args.time_ms, args.max_ply) < 1:
        ap.error('All limits must be positive')
    out = Path(args.out).expanduser().resolve()
    manifest_path = out / 'manifest.json'
    if args.export_pgn:
        with output_lock(out):
            for path in sorted((out / 'games').glob('*.json')):
                subprocess.run(COMMAND, cwd=ROOT, input=json.dumps(dict(mode='export', checkpoint=str(path))),
                               text=True, encoding='utf-8', check=True)
        return
    if args.summary:
        with output_lock(out):
            report(out, json.loads(manifest_path.read_text(encoding='utf-8')))
        print(out / 'report.md'); return
    pieces = ['fairy']  # Koishi needs the independently calibrated fairy anchor first.
    contexts = list(dict.fromkeys(args.contexts.split(',')))
    priors = sorted(set(float(x) for x in args.priors.split(',')))
    equivalents = sorted(set(int(x) for x in args.equivalents.split(',')))
    if not set(contexts) <= set(CONTEXTS):
        ap.error('Unknown piece/context')
    if any(not math.isfinite(v) or v <= 0 for v in priors) or any(e < 0 or e > 8 for e in equivalents):
        ap.error('priors must be positive finite; equivalents must be integers 0..8')
    config = dict(pieces=pieces, contexts=contexts, priors=priors, equivalents=equivalents,
        pairs=args.pairs, time_ms=args.time_ms, max_ply=args.max_ply, seed=args.seed,
        source=source_hash(), node=subprocess.check_output([runner.NODE, '--version'], text=True).strip(), protocol=1)
    out.mkdir(parents=True, exist_ok=True)
    lock = out / '.running.lock'
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        ap.error(f'{lock} exists; only remove it after confirming no runner uses this directory')
    os.write(fd, str(os.getpid()).encode()); os.close(fd)
    pool = None
    runner.STOP.clear(); runner.COMMAND = COMMAND
    try:
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
            if manifest['config'] != config:
                raise RuntimeError('Source/config/Node changed: use original command/code or a new --out directory')
        else:
            manifest = make_manifest(config)
            validation = subprocess.run(COMMAND, cwd=ROOT, input=json.dumps(dict(mode='validate', specs=manifest['specs'])),
                capture_output=True, text=True, encoding='utf-8', check=True)
            runner.emit(validation.stdout.strip())
            runner.atomic_json(manifest_path, manifest)
        validate_ids(manifest)
        (out / 'games').mkdir(exist_ok=True)
        report(out, manifest)
        runner.emit(f"Plan: {len(manifest['specs'])} games; {args.workers} workers; output {out}")
        if args.plan:
            return
        pool = concurrent.futures.ThreadPoolExecutor(max_workers=args.workers)
        for spec in manifest['specs']:
            load_record(out, spec)  # Validate even completed games before allowing skip.
        jobs = [pool.submit(runner.run_game, spec, out) for spec in manifest['specs']]
        for job in concurrent.futures.as_completed(jobs):
            job.result(); report(out, manifest)
    except KeyboardInterrupt:
        runner.emit('Stopping. Run the same command to resume saved plies.')
    finally:
        runner.STOP.set()
        with runner.PROCESS_LOCK:
            for process in list(runner.PROCESSES):
                if process.poll() is None:
                    process.terminate()
        if pool:
            pool.shutdown(wait=True, cancel_futures=True)
        try:
            if manifest_path.exists():
                report(out, json.loads(manifest_path.read_text(encoding='utf-8')))
        finally:
            lock.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
