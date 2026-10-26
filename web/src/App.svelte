<script>
  import {onDestroy} from 'svelte';
  import {createGame} from './game.js';
  import * as E from './engine.js';
  import {translate,pieceName} from './i18n.js';
  import Board from './components/Board.svelte';
  import Palette from './components/Palette.svelte';
  import AnalysisPanel from './components/AnalysisPanel.svelte';
  const game=createGame();
  onDestroy(()=>game.dispose());
  const tr=(key,...args)=>translate($game.lang,key,...args);
  let result=$derived($game.phase==='play'?E.outcome($game.position,$game.legal):null);
  let status=$derived.by(()=>{
    if(!result)return '';
    if($game.botError)return $game.lang==='zh'?'电脑搜索失败，请重选电脑执方重试':'CPU search failed; select CPU side again to retry';
    if($game.thinking)return tr('thinking');
    if(result.code==='mates')return tr('mates',tr(result.winner===E.W?'white':'black'));
    if(result.code==='toMove')return tr('toMove',tr(result.toMove===E.W?'white':'black'))+(result.check?tr('chk'):'');
    return tr(result.code);
  });
  let material=$derived.by(()=>{
    if(!$game.position)return '';
    if(E.darkSet($game.position).size)return tr('matUnknown');
    let w=0,b=0;
    for(const p of $game.position.b)if(p){if(p.c===E.W)w+=E.P[p.t].cost;else b+=E.P[p.t].cost;}
    return '白 '+E.fmt(w)+'＋'+E.fmt($game.position.ammo.w)+'弹 · 黑 '+E.fmt(b)+'＋'+E.fmt($game.position.ammo.b)+'弹';
  });
  let note=$derived.by(()=>{
    if($game.phase==='play')return tr('notePlay');
    const dep=$game.deploy[$game.side],points=E.pointsOf(dep);
    const royal=c=>[...$game.deploy[c].values()].find(t=>E.P[t].royal);
    const name=c=>royal(c)?pieceName($game.lang,royal(c)):tr('undecided');
    return tr('noteDeploy',E.fmt(points),E.fmt(45-points),[...dep.values()].filter(t=>E.P[t].royal).length)
      +tr('royalW')+name(E.W)+tr('royalB')+name(E.B)
      +($game.pick?tr('selected')+pieceName($game.lang,$game.pick)+(E.P[$game.pick].files?tr('fileLimit'):''):'');
  });
  $effect(()=>{document.documentElement.lang=$game.lang==='zh'?'zh-CN':'en';});
</script>
<svelte:head><title>{tr('title')}</title></svelte:head>
<h1 id="title">{tr('title')}</h1>
<div class="row flex flex-wrap gap-2 mb-2.5"><button id="lang" onclick={game.toggleLanguage}>{tr('langBtn')}</button></div>
<p class="sub" id="phasehint">{tr($game.phase==='deploy'?'hintDeploy':'hintPlay')}</p>
{#if $game.phase==='deploy'}
  <div id="sideRow" class="row flex flex-wrap gap-2 mb-2.5">
    {#each ['w','b'] as color}
      <button id={color==='w'?'tabW':'tabB'} aria-pressed={$game.side===color} onclick={()=>game.selectSide(color)}>
        {tr(color==='w'?'white':'black')} <span>{E.fmt(E.pointsOf($game.deploy[color]))}</span>/45
      </button>
    {/each}
  </div>
  <div id="deployRow" class="row flex flex-wrap gap-2 mb-2.5">
    <button id="preset" onclick={game.preset}>{tr('preset')}</button>
    <button id="clearSide" onclick={game.clear}>{tr('clearSide')}</button>
    <button id="start" disabled={!E.readySide($game.deploy.w)||!E.readySide($game.deploy.b)} onclick={game.start}>{tr('start')}</button>
  </div>
{:else}
  <div class="statusbar flex justify-between items-baseline gap-2.5 mb-2 min-h-6" id="bar">
    <span id="status" class:alert={!!result?.alert}>{status}</span><span id="material">{material}</span>
  </div>
{/if}
<Board game={$game} onSquare={game.click} onChoice={game.choose}/>
{#if $game.phase==='deploy'}<Palette lang={$game.lang} pick={$game.pick} onPick={game.selectPiece}/>{/if}
<!-- Keep the panel mounted so its checkbox preferences survive redeployment. -->
<div id="playRow" class="row flex flex-wrap gap-2 mb-2.5" class:hide={$game.phase!=='play'}>
  <button id="undo" disabled={!$game.history.length} onclick={game.undo}>{tr('undo')}</button>
  <button id="flip" onclick={game.flip}>{tr('flip')}</button>
  <button id="redeploy" onclick={game.redeploy}>{tr('redeploy')}</button>
  <select id="botSide" aria-label={$game.lang==='zh'?'电脑执方':'CPU side'} value={$game.botSide} onchange={e=>game.setBotSide(e.currentTarget.value)}>
    <option value="">{tr('botOff')}</option><option value="b">{tr('botB')}</option>
    <option value="w">{tr('botW')}</option><option value="wb">{tr('botWB')}</option>
  </select>
  <select id="botLv" aria-label={$game.lang==='zh'?'电脑难度':'CPU difficulty'} value={$game.botLevel} onchange={e=>game.setBotLevel(e.currentTarget.value)}>
    {#each ['easy','normal','hard','lunatic'] as level}
      <option value={level}>{tr(level)}</option>
    {/each}
  </select>
  <AnalysisPanel position={$game.position} hist={$game.posHist} legal={$game.legal} lang={$game.lang} active={$game.phase==='play'}/>
</div>
{#if $game.phase==='play'}
  <div id="moves">
    {#each $game.log.filter((_,i)=>i%2===0) as white,i}
      <span class="m"><span class="n">{i+1}.</span>{white}{' '}{ $game.log[i*2+1]||''}</span>
    {:else}<span style="color:var(--subtle)">{tr('noMoves')}</span>{/each}
  </div>
{/if}
<p class="note" id="note">{note}</p>
