import assert from 'node:assert/strict';
import * as E from '../engine/index.ts';
const check=text=>{const game=E.parsePGN(text),encoded=E.exportPGN(game),again=E.parsePGN(encoded);
 assert.equal(E.posKey(game.states.at(-1)),E.posKey(again.states.at(-1)));
 assert.deepEqual(game.moves,again.moves);return {game,encoded};};
const {encoded}=check('[Event "Test"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
assert.match(encoded,/Qh4# 0-1/);assert.doesNotMatch(encoded,/Variant|TFCState|SetUp/);
check('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 *');
check('1. e4 a6 2. e5 d5 3. exd6 *');
assert.equal(check('1.e4 {comment} e5 (1...c5 (1...e6)) 2.Nf3!? $1 Nc6 ;comment\n *').game.warnings.length,1);
const fenGame=(fen,text)=>`[SetUp "1"]\n[FEN "${fen}"]\n\n${text}`;
check(fenGame('4k3/P7/8/8/8/8/8/4K3 w - - 0 1','1. a8=Q+ *'));
check(fenGame('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1','1. O-O-O *'));
check(fenGame('8/8/8/8/8/6k1/K7/7r b - - 0 42','42... Rh2 *'));
check(fenGame('4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1','1. Nbd2 *'));
assert.throws(()=>E.parsePGN(fenGame('4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1','1. Nd2 *')),/ambiguous/);
// Pinned e2 rook must not force disambiguation of the legal c2 rook.
check(fenGame('k3r3/8/8/8/8/8/2R1R3/4K3 w - - 0 1','1. Rd2 *'));
for(const bad of ['1. e5 *','[Result "1-0"] 1. e4 0-1','1.e4 * 1...e5','1.e4 (1.d4','[Variant "Atomic"] *'])assert.throws(()=>E.parsePGN(bad));
for(const bad of ['8/8/8/8/8/8/8/8 w - - 0 1','4k3/8/8/8/8/8/8/4K3 w K - 0 1'])assert.throws(()=>E.fromFEN(bad));
// Extension round-trip: real Koishi move, complete ammunition and marked pieces retained.
const s=E.fromFEN(E.START_FEN);s.b[48]={t:'koishi',c:'w'};s.b[49]={t:'fairy',c:'w'};s.ammo={w:2.5,b:3};
const m=E.legalMoves(s).find(m=>m.from===48&&m.to===32);
assert.ok(m);const fairy=E.exportPGN({initial:s,moves:[m]});assert.match(fairy,/Variant "Touhou Fairy Chess"/);
assert.match(fairy,/Xkoishi_a2-a4/);const imported=E.parsePGN(fairy);
assert.equal(E.posKey(imported.initial),E.posKey(s));assert.equal(E.posKey(imported.states.at(-1)),E.posKey(E.nextPosition(s,m)));
assert.throws(()=>E.parsePGN(fairy.replace('TFCVersion "1"','TFCVersion "999"')));
console.log('PGN: SAN, FEN, comments/RAV, validation and fairy round-trips passed.');

// Controller: importing is atomic, browsing keeps future moves, branching replaces them.
const {createGame}=await import('../web/src/game.js');
const {get}=await import('svelte/store');
const controller=createGame();
controller.importPGN('1. e4 e5 2. Nf3 Nc6 *');
assert.equal(get(controller).cursor,4);assert.equal(get(controller).botSide,'');
controller.seek(1);assert.equal(get(controller).cursor,1);assert.equal(get(controller).record.moves.length,4);
assert.equal(E.parsePGN(controller.exportPGN()).moves.length,4);
const before=get(controller);assert.throws(()=>controller.importPGN('1. e5 *'));assert.equal(get(controller),before);
controller.seek(2);controller.click(57);controller.click(42); // Nc3 replaces Nf3 and Nc6.
assert.equal(get(controller).record.moves.length,3);assert.match(controller.exportPGN(),/2\. Nc3 \*/);
controller.undo();assert.equal(get(controller).record.moves.length,2);
controller.importPGN(fenGame('8/8/8/8/8/6k1/K7/7r b - - 0 42','42... Rh2+ *'));
controller.seek(0);assert.equal(get(controller).position.turn,'b');assert.equal(get(controller).position.full,42);
controller.dispose();console.log('PGN controller: import, browse, branch, undo and atomic rejection passed.');

const dropState=E.fromFEN('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
dropState.b[58]={t:'alice',c:'w'};dropState.b[0]={t:'keda',c:'w',mark:1};dropState.ammo.w=4;
const drop=E.legalMoves(dropState).find(m=>m.drop);assert.ok(drop);
const dropGame=E.parsePGN(E.exportPGN({initial:dropState,moves:[drop]}));
assert.equal(E.posKey(dropGame.initial),E.posKey(dropState));
assert.equal(E.posKey(dropGame.states.at(-1)),E.posKey(E.nextPosition(dropState,drop)));
console.log('PGN extension: drops, ammunition and disappearance marks round-trip.');
