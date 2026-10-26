#!/usr/bin/env python3
"""起 Node CLI 打批量对局、收 JSONL。Mirai 在游戏本上跑的就是这一层。

要点：
  可续跑  结果按行追加到 jsonl，已完成的局号跳过。
          上一轮的后台任务有 2 小时上限，跑到一半被砍是常态，
          所以"能接着跑"不是优化，是必需。
  并行    按分片起多个 Node 进程，每片一个固定种子 → 可复跑。
  零依赖  只用标准库。
"""
from __future__ import annotations
import json, os, pathlib, subprocess, sys, tempfile, time
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent.parent
CLI = ROOT / "cli" / "play.ts"
# 使用 npm ci 安装的本地 tsx；不要求全局安装，也不启动 tsx CLI IPC。
TS_COMMAND = ([os.environ["TSX"]] if os.environ.get("TSX")
              else [os.environ.get("NODE", "node"), "--import", "tsx"])
BACK = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']
FILES = "abcdefgh"


def vanilla() -> dict[str, str]:
    """香草阵容（白方视角的格名）"""
    d = {}
    for i, f in enumerate(FILES):
        d[f + '1'] = BACK[i]
        d[f + '2'] = 'p'
    return d


def mod(**changes) -> dict[str, str]:
    """香草改几格。值为 None 表示拿掉这个子。
    例：mod(a2='cirno', h2=None)"""
    d = vanilla()
    for sq, t in changes.items():
        if t is None:
            d.pop(sq, None)
        else:
            d[sq] = t
    return d


def points(dep: dict[str, str]) -> float:
    """场上点数，按 rules/pieces.toml 的 cost。用来确认阵容合法。"""
    import tomllib
    book = tomllib.loads((ROOT / "rules/pieces.toml").read_text(encoding="utf-8"))
    km = tomllib.loads((ROOT / "rules/keymap.toml").read_text(encoding="utf-8"))
    key = dict(km["key"]); key.pop("unimplemented", None)
    cost = {key[p["name"]]: p["cost"] for p in book["piece"] if p["name"] in key}
    return round(sum(cost[t] for t in dep.values()), 1)


def _shard(spec: dict, out_path: pathlib.Path, lock) -> int:
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
        json.dump(spec, f)
        tmp = f.name
    try:
        p = subprocess.run([*TS_COMMAND, str(CLI), tmp],
                           cwd=ROOT, capture_output=True, text=True)
        if p.returncode != 0:
            sys.stderr.write(f"[分片失败] {p.stderr[-800:]}\n")
            return 0
        rows = [l for l in p.stdout.splitlines() if l.strip()]
        with lock:
            with out_path.open('a', encoding='utf-8') as fh:
                for l in rows:
                    r = json.loads(l)
                    r['i'] += spec['_offset']
                    r['tag'] = spec.get('_tag', '')
                    fh.write(json.dumps(r, ensure_ascii=False) + '\n')
        return len(rows)
    finally:
        os.unlink(tmp)


def run(white: dict, black: dict, games: int, out: str | pathlib.Path,
        tag: str = "", level: str = "lunatic", workers: int | None = None,
        shard: int = 4, **kw) -> list[dict]:
    """分片默认 4 局：结果只在一片跑完时落盘，被中途砍掉就丢一整片。
    深度5 一局约 120 秒，所以 10 局一片等于一次丢 20 分钟 —— 实际发生过。
    Node 进程启动只要 0.43 秒，分片小几乎没有额外成本。"""
    # 打 games 局，结果追加到 out（jsonl）。已完成的局号跳过。
    # 返回这个 tag 下的全部结果（含之前跑的）。
    import threading
    out = pathlib.Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    done: set[int] = set()
    rows: list[dict] = []
    if out.exists():
        for l in out.read_text(encoding='utf-8').splitlines():
            if not l.strip():
                continue
            r = json.loads(l)
            if r.get('tag', '') == tag:
                done.add(r['i'])
                rows.append(r)
    todo = [i for i in range(games) if i not in done]
    if not todo:
        return rows
    workers = workers or max(1, (os.cpu_count() or 2))
    lock = threading.Lock()
    # 连续的局号切片 —— 每片一个固定种子，可复跑
    specs = []
    for s in range(0, len(todo), shard):
        chunk = todo[s:s + shard]
        if chunk != list(range(chunk[0], chunk[0] + len(chunk))):
            # 不连续（续跑的零散局号）：一局一片，慢但正确
            for i in chunk:
                specs.append(dict(white=white, black=black, games=1, level=level,
                                  seed=1000 + i, _offset=i, _tag=tag, **kw))
            continue
        specs.append(dict(white=white, black=black, games=len(chunk), level=level,
                          seed=1000 + chunk[0], _offset=chunk[0], _tag=tag, **kw))
    t0 = time.time()
    n = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for got in ex.map(lambda sp: _shard(sp, out, lock), specs):
            n += got
            el = time.time() - t0
            sys.stderr.write(f"\r  {tag or '对局'}: {len(done)+n}/{games}  "
                             f"{el:.0f}s  {(len(done)+n)/max(el,1e-9):.2f} 局/秒")
            sys.stderr.flush()
    sys.stderr.write("\n")
    return run(white, black, games, out, tag, level, workers, shard, **kw)


def score(rows: list[dict]):
    """把结果行折成 Rate"""
    from stats import Rate
    return Rate(sum(r['score'] for r in rows), len(rows))


if __name__ == "__main__":
    sys.path.insert(0, str(ROOT / "lab"))
    print("香草场上点数 =", points(vanilla()), "（应为 43）")
    print("少3兵     =", points(mod(a2=None, h2=None, b2=None)), "（应为 40）")
    print("\n冒烟：香草对香草 4 局，human 档")
    rows = run(vanilla(), vanilla(), 4, "/tmp/claude-0/harness_smoke.jsonl",
               tag="smoke", level="normal", maxPly=120, shard=2)
    from stats import Rate
    print("  得分率:", Rate(sum(r['score'] for r in rows), len(rows)))
