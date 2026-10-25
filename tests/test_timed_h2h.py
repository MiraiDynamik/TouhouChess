"""Short protocol/resume/report checks; not a strength measurement."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('timed_h2h', ROOT / 'lab/timed_h2h.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)

class TimedMatchTests(unittest.TestCase):
    def test_cli_checkpoint_resume_and_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'checkpoint.json'
            game = dict(id='test', army=h.vanilla(), onSide='w', timeMs=10,
                        maxPly=4, seed=123, source='test')
            payload = dict(mode='game', spec=game, checkpoint=str(path))
            p = subprocess.Popen(h.COMMAND, cwd=ROOT, stdin=subprocess.PIPE,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8')
            p.stdin.write(json.dumps(payload)); p.stdin.close()
            first = json.loads(p.stdout.readline())
            self.assertEqual(first['kind'], 'progress')
            p.terminate(); p.wait()
            p.stdout.close(); p.stderr.close()
            previous = json.loads(path.read_text())
            result = subprocess.run(h.COMMAND, cwd=ROOT, input=json.dumps(payload),
                                    capture_output=True, text=True, encoding='utf-8', check=True)
            current = json.loads(path.read_text())
            self.assertEqual(current['moves'][:len(previous['moves'])], previous['moves'])
            self.assertEqual(len(current['hist']), len(current['moves'])+1)
            self.assertEqual(len(current['moves']), 4)
            self.assertEqual(current['result']['code'], 'unresolved')
            self.assertIsNone(current['result']['score'])
            game['timeMs'] = 20
            bad = subprocess.run(h.COMMAND, cwd=ROOT, input=json.dumps(payload), capture_output=True, text=True)
            self.assertNotEqual(bad.returncode, 0)
            self.assertIn('mismatch', bad.stderr)

    def test_orchestration_resume_reports(self):
        with tempfile.TemporaryDirectory() as tmp:
            command = [sys.executable, str(ROOT/'lab/timed_h2h.py'), '--pairs','1',
                       '--workers','2','--time-ms','10','--max-ply','4','--out',tmp]
            subprocess.run(command, cwd=ROOT, check=True, capture_output=True)
            out = Path(tmp)
            manifest = json.loads((out/'manifest.json').read_text(encoding='utf-8'))
            self.assertEqual(len(manifest['pairs']), 2)
            self.assertTrue(30 <= manifest['pairs'][1]['points'] <= 45)
            files = list((out/'games').glob('*.json'))
            self.assertEqual(len(files), 4)
            times = {p:p.stat().st_mtime_ns for p in files}
            subprocess.run(command, cwd=ROOT, check=True, capture_output=True)
            self.assertEqual(times, {p:p.stat().st_mtime_ns for p in files})
            for name in ['report.md','games.csv','moves.csv']:
                self.assertTrue((out/name).stat().st_size > 0)
            self.assertIn('| 香草 | 0 | 0 | 0 | 0 | — | — | 2 |', (out/'report.md').read_text(encoding='utf-8'))
            bad = subprocess.run(command+['--time-ms','20'], cwd=ROOT, capture_output=True)
            self.assertNotEqual(bad.returncode, 0)
            self.assertFalse((out/'.running.lock').exists())
            # Verify report arithmetic separately from strength measurements.
            for index, p in enumerate(sorted(files)):
                data=json.loads(p.read_text()); data['result']={'code':'mates','score':[1,.5,0,.5][index]}
                p.write_text(json.dumps(data))
            h.report(out,manifest)
            report=(out/'report.md').read_text(encoding='utf-8')
            self.assertIn('| 随机对称 | 2 | 1 | 1 | 0 | 50.0% | 75.0% |', report)
            self.assertIn('| 香草 | 2 | 0 | 1 | 1 | 0.0% | 25.0% |', report)

if __name__ == '__main__':
    unittest.main()
