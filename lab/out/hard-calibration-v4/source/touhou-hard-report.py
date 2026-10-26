import json,statistics
from pathlib import Path
root=Path('lab/out/hard-calibration-v4')
trace=json.loads((root/'selection-trace.json').read_text())['rows']
games=[];reviews=[]
for batch in ['batch1','batch2']:
 for p in sorted((root/batch/'hard').glob('game-*.json')):
  g=json.loads(p.read_text());g['id']=p.stem;games.append(g)
 p=root/batch/'review.json'
 if p.exists():reviews+=json.loads(p.read_text())['rows']
scores=[g['result']['score'] for g in games if g.get('result') and g['result']['score'] is not None]
valid=[r for r in reviews if r['competitive'] and r['cp_loss'] is not None]
large=[r for r in valid if r['cp_loss']>=200]
verified=json.loads((root/'verified-losses.json').read_text())['rows']
text=['# 当前 Hard 棋力复测（2026-10-25）','',
'目标参照：Chess.com 约 10 分钟快棋 1000–1200。此报告不将 Stockfish UCI_Elo 换算为平台分数。','',
'## 条件','',
'- 当前 Hard：随机 / 低 1–3 分 / 次优 / 最优 = 0 / 1 / 20 / 79%；每手 2 秒；超过 18 枚棋子最多 5 ply，≤18 枚时不限深度。',
'- Stockfish 19：UCI_LimitStrength=true，UCI_Elo=1320，每手 3 秒，单线程，Hash=64 MB。',
'- 标准香草初始阵容，两个不同种子的换色配对，共四局，同时最多两局；双方缓存每局清空、局内保留。',
'- 使用项目终局判定，最多 300 ply，达到上限算未决；无子力裁定。引擎源码、工具快照见 source/。','',
'## 对局结果','',
'| 对局 | Hard 颜色 | 结果 | ply |','|---|---|---|---:|']
for g in games:
 r=g['result']; label='进行中' if not r else ('未决' if r['score'] is None else {1:'胜',.5:'和',0:'负'}[r['score']])
 text.append(f"| {g['id']} | {g['dev_side']} | {label}（{r['code'] if r else 'running'}） | {len(g['moves'])} |")
text+=['',f"已判定：{scores.count(1)} 胜、{scores.count(.5)} 和、{scores.count(0)} 负；得分率 {sum(scores)/len(scores):.1%}。",'',
'## 走法复查','',
'未限强 Stockfish 每个局面 50000 节点，检查完整对局。仅汇总落子前绝对评分 ≤400 cp 且前后均为有限 cp 评分的走法；评分是 SF 归一化单位，不是实际损失子力。',
f"共 {len(valid)} 个可比较走法，平均损失 {statistics.mean(r['cp_loss'] for r in valid):.1f} cp；其中 {len(large)} 次损失 ≥200 cp。",'',
'| 对局 | ply | 走法 | 策略（按种子还原） | 初查损失 cp | 100 万节点复查损失 cp |',
'|---|---:|---|---|---:|---:|']
for r in large:
 t=next(x for x in trace if x['game']==r['game'] and x['ply']==r['ply'])
 v=next((x for x in verified if x['game']==r['game'] and x['ply']==r['ply']),None)
 text.append(f"| {r['game']} | {r['ply']} | {r['move']} | {t['strategy']} | {r['cp_loss']} | {v['cp_loss'] if v else '—'} |")
text+=['','## 搜索深度','', '| 阶段 | Hard 落子数 | 完成深度中位数 | 范围 |','|---|---:|---:|---|']
for name,pred in [('棋子 >18',lambda r:r['pieces']>18),('棋子 ≤18',lambda r:r['pieces']<=18)]:
 a=[r['depth'] for r in trace if pred(r)]
 text.append(f'| {name} | {len(a)} | {statistics.median(a)} | {min(a)}–{max(a)} |')
text+=['','## 判断边界','',
'四局只说明本轮在统一引擎参照下的表现。不能据此确认已达 Chess.com 1000–1200，也不能算出还差多少平台分；同一起始局面、小样本、限强模型与人类不同、时间制度不同都会影响结果。',
'旧 Hard 在 stockfish-difficulties-v3 中为 1 胜 1 负，但使用更早的概率、深度配置。旧新局面不相同，不能把平均评分损失的变化解释成严格 A/B 棋力提升。',
'当前既有次优策略造成的较大失误，也有最优分支的搜索失误。下一步应区分选着削弱与搜索质量，不能仅凭增大深度或胜过 SF1320 就认定已达目标。',
'本次只评估香草阵容；东方特殊棋子下还需真人试玩。未修改游戏默认参数。','',
'官方参考：https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html','']
(root/'report.md').write_text('\n'.join(text))
print('\n'.join(text))
