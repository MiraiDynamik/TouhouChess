<script>
  import {onDestroy} from 'svelte';
  import {createGame} from './game.js';
  import * as E from './engine.js';
  import {translate,pieceName} from './i18n.js';
  import Board from './components/Board.svelte';
  import Palette from './components/Palette.svelte';
  import AnalysisPanel from './components/AnalysisPanel.svelte';
  import PgnPanel from './components/PgnPanel.svelte';
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
<svelte:head><title>東方西洋棋 · Touhou Fairy Chess</title></svelte:head>
<!-- 外层铺满窗口，内层限制棋盘与操作区的宽度。 -->
<div class="min-h-dvh bg-paper font-ui text-[15px] leading-normal text-ink">
  <main class="mx-auto bg-sel max-w-[540px] px-3 pt-3.5 pb-10">
    <h1 id="title" class="m-0 mb-0.5 flex flex-wrap items-baseline gap-x-3 font-heading text-xl font-semibold leading-[1.5]">
      <span lang="ja">東方西洋棋</span>
      <span lang="en">Touhou Fairy Chess</span>
    </h1>
    <div class="row flex flex-wrap gap-2 mb-2.5"><button class="control" id="lang" onclick={game.toggleLanguage}>{tr('langBtn')}</button></div>
    <p class="sub m-0 mb-3 text-[13px] text-muted" id="phasehint">{tr($game.phase==='deploy'?'hintDeploy':'hintPlay')}</p>
    {#if $game.phase==='deploy'}
      <div id="sideRow" class="row flex flex-wrap gap-2 mb-2.5">
        {#each ['w','b'] as color}
          <button class="control" id={color==='w'?'tabW':'tabB'} aria-pressed={$game.side===color} onclick={()=>game.selectSide(color)}>
            {tr(color==='w'?'white':'black')} <span>{E.fmt(E.pointsOf($game.deploy[color]))}</span>/45
          </button>
        {/each}
      </div>
      <div id="deployRow" class="row flex flex-wrap gap-2 mb-2.5">
        <button class="control" id="preset" onclick={game.preset}>{tr('preset')}</button>
        <button class="control" id="clearSide" onclick={game.clear}>{tr('clearSide')}</button>
        <button class="control" id="start" disabled={!E.readySide($game.deploy.w)||!E.readySide($game.deploy.b)} onclick={game.start}>{tr('start')}</button>
      </div>
    {:else}
      <div class="statusbar flex justify-between items-baseline gap-2.5 mb-2 min-h-6" id="bar">
        <span id="status" class="font-semibold" class:alert={!!result?.alert} class:text-shu={!!result?.alert}>{status}</span><span id="material" class="text-[13px] text-muted tabular-nums">{material}</span>
      </div>
    {/if}
    <Board game={$game} onSquare={game.click} onChoice={game.choose}/>
    {#if $game.phase==='deploy'}<Palette lang={$game.lang} pick={$game.pick} onPick={game.selectPiece}/>{/if}
    <!-- Keep the panel mounted so its checkbox preferences survive redeployment. -->
    <div id="playRow" class="row flex flex-wrap gap-2 mb-2.5" class:hidden={$game.phase!=='play'}>
      <button class="control" id="undo" disabled={!$game.history.length} onclick={game.undo}>{tr('undo')}</button>
      <button class="control" id="flip" onclick={game.flip}>{tr('flip')}</button>
      <button class="control" id="redeploy" onclick={game.redeploy}>{tr('redeploy')}</button>
      <select class="control rounded-none border border-solid border-ink bg-paper font-ui text-ink" id="botSide" aria-label={$game.lang==='zh'?'电脑执方':'CPU side'} value={$game.botSide} onchange={e=>game.setBotSide(e.currentTarget.value)}>
        <option value="">{tr('botOff')}</option><option value="b">{tr('botB')}</option>
        <option value="w">{tr('botW')}</option><option value="wb">{tr('botWB')}</option>
      </select>
      <select class="control rounded-none border border-solid border-ink bg-paper font-ui text-ink" id="botLv" aria-label={$game.lang==='zh'?'电脑难度':'CPU difficulty'} value={$game.botLevel} onchange={e=>game.setBotLevel(e.currentTarget.value)}>
        {#each ['easy','normal','hard','lunatic'] as level}
          <option value={level}>{tr(level)}</option>
        {/each}
      </select>
      <AnalysisPanel position={$game.position} hist={$game.posHist} legal={$game.legal} lang={$game.lang} active={$game.phase==='play'}/>
    </div>
    {#if $game.phase==='play'}
      <div id="moves" class="max-h-[120px] overflow-auto border-t [border-top-style:solid] border-line pt-2.5 text-[13px] leading-[1.9] tabular-nums">
        {#each $game.log as move,i}
          <span class="m mr-3 whitespace-nowrap"><span class="n mr-1 text-subtle">{$game.history[i].position.full}{$game.history[i].position.turn==='w'?'.':'...'}</span>{move}</span>
        {:else}<span class="text-subtle">{tr('noMoves')}</span>{/each}
      </div>
    {/if}
    <PgnPanel {game} snapshot={$game}/>
    <p class="note mt-3.5 border-t [border-top-style:solid] border-line pt-2.5 text-[12.5px] text-muted" id="note">{note}</p>
  </main>
</div>
