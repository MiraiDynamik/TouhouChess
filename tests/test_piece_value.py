"""Run: conda run -n TouhouChess python -m unittest discover -s tests -p test_piece_value.py"""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'lab'))
import piece_value as experiment


class ValueExperimentTests(unittest.TestCase):
    def config(self):
        return dict(pieces=['fairy'], contexts=experiment.CONTEXTS,
                    priors=[1., 2.], equivalents=list(range(9)), pairs=2,
                    seed=20261026, time_ms=5, max_ply=4, source='test', node='test')

    def test_armies_and_color_pairs(self):
        manifest = experiment.make_manifest(self.config())
        for i in range(0, len(manifest['specs']), 2):
            a, b = manifest['specs'][i:i+2]
            self.assertEqual(a['armyA'], b['armyA'])
            self.assertEqual(a['armyB'], b['armyB'])
            self.assertEqual(a['seed'], b['seed'])
            self.assertEqual((a['onSide'], b['onSide']), ('w', 'b'))
            ref = 3 if a['context'].startswith('minor') else 1
            # Nominal material balance crosses at equivalent/2 per test piece.
            values = dict(p=1, n=3, b=3, r=5, q=9, k=4, fairy=ref, koishi=ref)
            difference = sum(values[t] for t in a['armyA'].values())-sum(values[t] for t in a['armyB'].values())
            self.assertEqual(difference, 2*ref-a['equivalent'])
        proc = subprocess.run(experiment.COMMAND, cwd=ROOT,
            input=json.dumps(dict(mode='validate', specs=manifest['specs'])),
            text=True, capture_output=True, encoding='utf-8')
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(json.loads(proc.stdout)['validated'], len(manifest['specs']))

    def test_unresolved_and_incomplete_intervals(self):
        spec = dict(pair='a')
        result = lambda score: dict(result=dict(score=score))
        self.assertEqual(experiment.pair_stats([(spec, result(1))])['n'], 0)
        stats = experiment.pair_stats([(spec, result(None)), (spec, result(None))])
        self.assertEqual((stats['low'], stats['high'], stats['mean']), (0, 1, None))
        stats = experiment.pair_stats([(spec, result(1)), (spec, result(1))])
        self.assertLess(stats['low'], 1)  # No fake certainty for an all-win small sample.

    def test_live_checkpoint_resume_and_identity(self):
        config = self.config()
        spec = experiment.make_manifest(config)['specs'][0]
        spec['timeMs'], spec['maxPly'] = 100, 4
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp); (out/'games').mkdir()
            checkpoint = out/'games'/(spec['id']+'.json')
            payload = json.dumps(dict(mode='game', spec=spec, checkpoint=str(checkpoint)))
            proc = subprocess.Popen(experiment.COMMAND, cwd=ROOT, stdin=subprocess.PIPE,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8')
            proc.stdin.write(payload); proc.stdin.close()
            first = json.loads(proc.stdout.readline())
            self.assertEqual(first['kind'], 'progress')
            proc.terminate(); proc.wait()
            proc.stdout.close(); proc.stderr.close()
            saved = json.loads(checkpoint.read_text(encoding='utf-8'))
            self.assertGreaterEqual(len(saved['moves']), 1)
            self.assertLess(len(saved['moves']), 4)
            resumed = subprocess.run(experiment.COMMAND, cwd=ROOT, input=payload,
                capture_output=True, text=True, encoding='utf-8')
            self.assertEqual(resumed.returncode, 0, resumed.stderr)
            done = json.loads(checkpoint.read_text(encoding='utf-8'))
            self.assertEqual(done['moves'][:len(saved['moves'])], saved['moves'])
            self.assertEqual(len(done['hist']), len(done['moves'])+1)
            self.assertEqual(done['result']['code'], 'unresolved')
            self.assertIsNone(done['result']['score'])
            pgn = checkpoint.with_suffix('.pgn').read_text(encoding='utf-8')
            self.assertIn('[Result "*"]', pgn)
            self.assertIn('[SetUp "1"]', pgn)  # Pawn-odds initial position.
            self.assertNotIn('[Variant ', pgn)
            again = subprocess.run(experiment.COMMAND, cwd=ROOT, input=payload,
                capture_output=True, text=True, encoding='utf-8', check=True)
            self.assertEqual(len(again.stdout.splitlines()), 1)
            other = copy.deepcopy(spec); other['prior'] = 9
            with self.assertRaises(RuntimeError):
                experiment.load_record(out, other)
            manifest = dict(config=config, specs=[spec])
            experiment.report(out, manifest)
            text = (out/'report.md').read_text(encoding='utf-8')
            self.assertIn('尚未通过', text)
            self.assertTrue((out/'summary.csv').exists())


if __name__ == '__main__':
    unittest.main()
