import collections
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT/'lab'))
import fairy_exchange as experiment

class ExchangeTests(unittest.TestCase):
    def config(self):
        return dict(groups=['pawns','knight'], pairs=500, seed=20261026, time_ms=3000,
                    max_ply=400, source='test', prior=1.5, protocol='fairy-exchange-v1')

    def test_full_plan(self):
        manifest = experiment.make_manifest(self.config())
        specs = manifest['specs']
        self.assertEqual(len(specs), 2000)
        self.assertEqual(collections.Counter(s['context'] for s in specs), {'pawns':1000,'knight':1000})
        for i in range(0,len(specs),2):
            a,b=specs[i:i+2]
            self.assertEqual(a['armyA'],b['armyA']);self.assertEqual(a['armyB'],b['armyB'])
            self.assertEqual(a['seed'],b['seed']);self.assertEqual((a['onSide'],b['onSide']),('w','b'))
            self.assertEqual(a['prior'],1.5)
            army,opponent=a['armyA'],a['armyB']
            fairies=[sq for sq,t in army.items() if t=='fairy']
            self.assertEqual(len(fairies),2)
            self.assertNotEqual((ord(fairies[0][0])+int(fairies[0][1]))%2,(ord(fairies[1][0])+int(fairies[1][1]))%2)
            if a['context']=='pawns':
                self.assertEqual(sum(t=='p' for t in army.values()),5)
                self.assertEqual(opponent,experiment.runner.vanilla())
                self.assertEqual(len(army),15)
            else:
                self.assertEqual(sum(t=='n' for t in army.values()),0)
                self.assertEqual(sum(t=='n' for t in opponent.values()),1)
                for f in 'abcdefgh':
                    self.assertEqual(army[f+'2'],'p');self.assertEqual(opponent[f+'2'],'p')
        counts=collections.Counter(s['layout'] for s in specs[::2] if s['context']=='knight')
        self.assertEqual(sorted(counts.values()),[250,250])
        counts=collections.Counter(s['layout'] for s in specs[::2] if s['context']=='pawns')
        self.assertEqual(len(counts),96);self.assertEqual(set(counts.values()),{5,6})
        subprocess.run(experiment.common.COMMAND,cwd=ROOT,input=json.dumps(dict(mode='validate',specs=specs)),
                       text=True,capture_output=True,check=True)
        self.assertEqual(manifest,experiment.make_manifest(self.config()))

    def test_run_resume_and_lock(self):
        with tempfile.TemporaryDirectory() as tmp:
            command=[sys.executable,str(ROOT/'lab/fairy_exchange.py'),'--out',tmp,
                     '--pairs','3','--workers','12','--time-ms','5','--max-ply','2']
            subprocess.run(command,cwd=ROOT,capture_output=True,text=True,check=True)
            games=list((Path(tmp)/'games').glob('*.json'));self.assertEqual(len(games),12)
            before={p.name:p.read_bytes() for p in games}
            self.assertTrue(all(p.with_suffix('.pgn').exists() for p in games))
            again=subprocess.run(command,cwd=ROOT,capture_output=True,text=True,check=True)
            self.assertEqual(again.stdout.count('[skip]'),12)
            self.assertEqual(before,{p.name:p.read_bytes() for p in games})
            base=[sys.executable,str(ROOT/'lab/fairy_exchange.py'),'--out',tmp]
            for flag in ['--summary','--export-pgn']:
                subprocess.run(base+[flag],cwd=ROOT,capture_output=True,text=True,check=True)
            with experiment.common.output_lock(Path(tmp)):
                for flag in ['--summary','--export-pgn','--plan']:
                    p=subprocess.run(base+[flag],cwd=ROOT,capture_output=True,text=True)
                    self.assertNotEqual(p.returncode,0);self.assertIn('.running.lock',p.stderr)
            self.assertIn('未决', (Path(tmp)/'report.md').read_text(encoding='utf-8'))
            changed=subprocess.run(command+['--pairs','4'],cwd=ROOT,capture_output=True,text=True)
            self.assertNotEqual(changed.returncode,0);self.assertIn('Source/config/Node changed',changed.stderr)

if __name__=='__main__': unittest.main()
