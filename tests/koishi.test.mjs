import assert from 'node:assert/strict';
import * as E from '../web/src/engine.js';

const sq=name=>(8-Number(name[1]))*8+'abcdefgh'.indexOf(name[0]);
function position(from='a1',color='w',extras={}){
  const s=E.buildState(new Map(),new Map());
  s.turn=color;
  s.b[sq(from)]={t:'koishi',c:color};
  for(const [at,piece] of Object.entries(extras))s.b[sq(at)]=piece;
  return s;
}
const destinations=(s,from)=>E.P.koishi.gen(s,sq(from)).map(m=>m.to);
const own={t:'p',c:'w'},enemy={t:'p',c:'b'};

// 正交落点都被堵住，仍能从斜向空格绕出去；不会吃掉跳跃落点的棋子。
let s=position('a1','w',{a3:own,c1:enemy,b2:enemy});
let moves=destinations(s,'a1');
assert(moves.includes(sq('c3')));
assert(moves.includes(sq('a5')));
assert(!moves.includes(sq('a3')));
assert(!moves.includes(sq('c1')));
assert(!moves.includes(sq('a1')));
assert.equal(new Set(moves).size,moves.length);

// 八向第一落点全部封住时仍不能逃出，不是直接传送。
s.b[sq('c3')]=enemy;
assert.deepEqual(destinations(s,'a1'),[]);

// 空棋盘仍只有同一奇偶组的另外十五格。
for(const from of ['a1','b1','a2','b2']){
  const targets=destinations(position(from),from),i=sq(from);
  assert.equal(targets.length,15);
  assert(targets.every(t=>(E.rank(t)&1)===(E.rank(i)&1)&&(E.file(t)&1)===(E.file(i)&1)));
}

// 吃子只检查原位置的后方三格，黑白方向相反，不允许跳完再吃。
for(const color of ['w','b']){
  const rear=color==='w'?'3':'5',opp=color==='w'?'b':'w';
  s=position('d4',color,Object.fromEntries(['c','d','e'].map(f=>[f+rear,{t:'p',c:opp}])));
  s.b[sq('b'+rear)]={t:'p',c:opp};
  const captures=destinations(s,'d4').filter(t=>s.b[t]);
  assert.deepEqual(captures.sort((a,b)=>a-b),['c','d','e'].map(f=>sq(f+rear)).sort((a,b)=>a-b));
  assert.deepEqual(E.P.koishi.atk(s,sq('d4')).sort((a,b)=>a-b),captures);
  assert(!destinations(s,'d4').includes(sq('b'+rear)),'不能跳到 b4 后再吃 b'+rear);
}

// 合法走法入口仍执行冻结和王安全检查。
s=position('a1','w',{h1:{t:'k',c:'w'},h8:{t:'k',c:'b'},b2:{t:'cirno',c:'b'}});
assert.equal(E.legalMoves(s).filter(m=>m.from===sq('a1')).length,0);
s=position('e3','w',{e1:{t:'k',c:'w'},a8:{t:'k',c:'b'},e8:{t:'r',c:'b'}});
assert(destinations(s,'e3').includes(sq('c5')));
assert(!E.legalMoves(s).some(m=>m.from===sq('e3')&&m.to===sq('c5')));
assert.equal(E.P.koishi.cost,1);
assert.deepEqual(E.P.koishi.slots,['n','p']);
console.log('Koishi: eight-direction paths, blocked landings, parity, separate captures, freezing and king safety passed.');
