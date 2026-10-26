"""Regression checks for review score perspective, mate transitions, and resume."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'lab'))
from stockfish_audit import classify

class Audit(unittest.TestCase):
 def test_signs_and_mates(self):
  cp=lambda v:dict(kind='cp',value=v)
  mate=lambda v:dict(kind='mate',value=v)
  self.assertEqual(classify(cp(100),cp(50))['cp_loss'],150)
  self.assertFalse(classify(mate(3),mate(-2))['missed_mate'])
  self.assertFalse(classify(mate(3),mate(0))['missed_mate'])
  self.assertTrue(classify(mate(3),cp(400))['missed_mate'])
  self.assertTrue(classify(cp(0),mate(2))['allows_mate'])
  self.assertFalse(classify(mate(-3),mate(2))['allows_mate'])
 def test_fools_mate_and_resume(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);folder=root/'sample';folder.mkdir()
   moves='f2f3 e7e5 g2g4 d8h4'.split()
   game=dict(elo=1500,dev_side='w',moves=moves,result=dict(code='mates',winner='b',score=0),
    records=[dict(ply=i+1,side='w' if i%2==0 else 'b',move=m,depth=1,ms=1) for i,m in enumerate(moves)])
   (folder/'game-test.json').write_text(json.dumps(game))
   cmd=[sys.executable,str(ROOT/'lab/stockfish_audit.py'),tmp,'--nodes','10000','--verify-nodes','100000']
   subprocess.run(cmd,check=True,capture_output=True,text=True)
   rows=json.loads((root/'audit.json').read_text())['rows']
   self.assertEqual(len(rows),2)
   self.assertTrue(rows[1]['allows_mate'])
   self.assertTrue(rows[1]['verified']['allows_mate'])
   self.assertEqual(rows[1]['verified']['after']['bestmove'],'d8h4')
   checkpoint=folder/'audit-game-test.json';stamp=checkpoint.stat().st_mtime_ns
   subprocess.run(cmd,check=True,capture_output=True,text=True)
   self.assertEqual(checkpoint.stat().st_mtime_ns,stamp)
   # Growing live-game snapshots retain only an identical recorded prefix.
   path=folder/'game-live.json'
   live={**game,'moves':moves[:2],'records':game['records'][:2],'result':None}
   path.write_text(json.dumps(live))
   subprocess.run(cmd+['--include-running'],check=True,capture_output=True,text=True)
   partial=folder/'audit-game-live.json';cached=json.loads(partial.read_text())
   self.assertEqual(len(cached['rows']),1)
   cached['rows'][0]['cached_marker']=True;partial.write_text(json.dumps(cached))
   path.write_text(json.dumps(game))
   subprocess.run(cmd,check=True,capture_output=True,text=True)
   resumed=json.loads(partial.read_text())['rows']
   self.assertEqual(len(resumed),2)
   self.assertTrue(resumed[0]['cached_marker'])
if __name__=='__main__':unittest.main()
