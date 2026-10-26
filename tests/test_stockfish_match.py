"""Protocol interoperability and checkpoint/report smoke checks (requires Stockfish)."""
import importlib.util
import json
from pathlib import Path
import random
import re
import subprocess
import sys
import tempfile
import unittest
ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('sfmatch',ROOT/'lab/stockfish_match.py')
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
SF='/opt/homebrew/bin/stockfish'

class Integration(unittest.TestCase):
    def test_legal_moves_and_terminal(self):
        sf=module.Process([SF]); bridge=module.Process(['node','--import','tsx','cli/stockfish-bridge.mjs'])
        try:
            sf.send('uci'); sf.until('uciok')
            rng=random.Random(42)
            # Short king-side castling and en passant sequences, followed by random legal play.
            starts=[[], 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 e1g1'.split(),
                    'e2e4 a7a6 e4e5 d7d5 e5d6'.split(),
                    'a2a4 h7h5 a4a5 h5h4 a5a6 h4h3 a6b7 h3g2 b7a8q'.split()]
            for start in starts:
                moves=start[:]
                for _ in range(30):
                    answer=bridge.rpc(moves=moves)
                    sf.send('position startpos'+(' moves '+' '.join(moves) if moves else ''))
                    sf.send('go perft 1')
                    lines=sf.until('Nodes searched:')
                    actual={m.group(1) for line in lines if (m:=re.match(r'^([a-h][1-8][a-h][1-8][qrbn]?): ',line))}
                    self.assertEqual(set(answer['legal']),actual, moves)
                    if not actual: break
                    moves.append(rng.choice(sorted(actual)))
            mate=bridge.rpc(moves='f2f3 e7e5 g2g4 d8h4'.split())
            self.assertEqual(mate['outcome']['code'],'mates')
            self.assertEqual(mate['outcome']['winner'],'b')
        finally:
            sf.close(); bridge.close()

    def test_resume_and_report(self):
        with tempfile.TemporaryDirectory() as tmp:
            cmd=[sys.executable,str(ROOT/'lab/stockfish_match.py'),'--elos','1320','--pairs','1','--time-ms','10','--max-ply','4','--out',tmp]
            subprocess.run(cmd,check=True,capture_output=True,text=True)
            games=list(Path(tmp).glob('game-*.json'))
            self.assertEqual(len(games),2)
            times={p:p.stat().st_mtime_ns for p in games}
            subprocess.run(cmd,check=True,capture_output=True,text=True)
            self.assertEqual(times,{p:p.stat().st_mtime_ns for p in games})
            for p in games:
                d=json.loads(p.read_text()); self.assertEqual(len(d['moves']),4)
                self.assertIsNone(d['result']['score'])
            # Resume an interrupted checkpoint from its existing legal prefix.
            p=games[0]; d=json.loads(p.read_text()); d['moves']=d['moves'][:2]; d['records']=d['records'][:2]; d['result']=None
            prefix=d['moves'][:]; module.save(p,d)
            subprocess.run(cmd,check=True,capture_output=True,text=True)
            self.assertEqual(json.loads(p.read_text())['moves'][:2],prefix)
            bad=subprocess.run(cmd+['--time-ms','20'],capture_output=True,text=True)
            self.assertNotEqual(bad.returncode,0)
            self.assertFalse((Path(tmp)/'.running.lock').exists())
            self.assertTrue((Path(tmp)/'report.md').exists())
            batch=Path(tmp)/'batch'
            subprocess.run(cmd+['--start-pair','2','--out',str(batch)],check=True,capture_output=True,text=True)
            self.assertEqual({p.name for p in batch.glob('game-*.json')},
                             {'game-1320-002-w.json','game-1320-002-b.json'})

if __name__=='__main__': unittest.main()
