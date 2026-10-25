<script>
  import * as E from '../engine.js';
  import Piece from './Piece.svelte';
  import {pieceName,translate} from '../i18n.js';
  let {game,onSquare,onChoice}= $props();
  let squares=$derived.by(()=>{
    const play=game.phase==='play',s=game.position;
    const frozen=play?E.frozenSet(s):new Set(),dark=play?E.darkSet(s):new Set();
    const checked=play?E.royals(s,s.turn).filter(i=>E.isAttacked(s,i,s.turn===E.W?E.B:E.W,frozen)):[];
    const targets=new Map();
    if(play&&game.selected!==null&&!dark.has(game.selected))
      for(const m of game.legal)if(m.from===game.selected)targets.set(m.to,m);
    return Array.from({length:64},(_,view)=>{
      const i=game.flipped?63-view:view,r=E.rank(i),f=E.file(i);
      const type=game.deploy.w.get(i)||game.deploy.b.get(i);
      const piece=play?s.b[i]:type?{t:type,c:game.deploy.w.has(i)?E.W:E.B}:null;
      const fog=dark.has(i),move=targets.get(i),selected=i===game.selected;
      return {i,piece,fog,selected:!fog&&selected,
        last:!fog&&!selected&&(game.lastMove?.from===i||game.lastMove?.to===i)&&play,
        check:!fog&&checked.includes(i),frozen:!fog&&frozen.has(i)&&!!piece,
        zone:!play&&E.canDeploy(game.deploy,game.side,game.pick,i),
        color:(r+f)&1?'d':'l',marker:!fog&&move?(piece||move.epc||move.drop?'ring':'dot'):null,
        file:view>=56?'abcdefgh'[f]:null,rank:view%8===0?8-r:null,
        label:E.nm(i)+(piece&&!fog?' '+pieceName(game.lang,piece.t):'')};
    });
  });
</script>
<div class="relative boardwrap">
  <div id="board" class="grid grid-cols-8 grid-rows-8 w-full aspect-square" aria-label={game.lang==='zh'?'棋盘':'Chessboard'}>
    {#each squares as square (square.i)}
      <button type="button" data-i={square.i} aria-label={square.label}
        class="sq {square.color} relative flex items-center justify-center overflow-hidden min-w-0 min-h-0"
        class:fog={square.fog} class:sel={square.selected} class:last={square.last}
        class:check={square.check} class:frozen={square.frozen} class:zone={square.zone}
        onclick={()=>onSquare(square.i)}>
        {#if square.piece&&!square.fog}<Piece type={square.piece.t} color={square.piece.c}/>{/if}
        {#if square.marker}<span class={square.marker}></span>{/if}
        {#if square.file}<span class="coord f">{square.file}</span>{/if}
        {#if square.rank}<span class="coord r">{square.rank}</span>{/if}
      </button>
    {/each}
  </div>
  {#if game.choices}
    <div id="promo" class="on" role="dialog" aria-modal="true" aria-label={game.lang==='zh'?'选择走法':'Choose move'}>
      <div class="box" id="promoBox">
        {#each game.choices as move}
          {@const type=move.promo||move.drop||game.position.b[move.from].t}
          {@const action=move.drop?'dropA':move.promo?'promoTo':'moveA'}
          <button class="choice" title={translate(game.lang,action)+pieceName(game.lang,type)}
            aria-label={(move.drop?(game.lang==='zh'?'打入':'Drop '):move.promo?(game.lang==='zh'?'升变为':'Promote to '):(game.lang==='zh'?'移动':'Move '))+pieceName(game.lang,type)}
            onclick={()=>onChoice(move)}><Piece {type} color={game.position.turn}/></button>
        {/each}
      </div>
    </div>
  {/if}
</div>
